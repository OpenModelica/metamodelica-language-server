/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
 * c/o Linköpings universitet, Department of Computer and Information Science,
 * SE-58183 Linköping, Sweden.
 *
 * All rights reserved.
 *
 * THIS PROGRAM IS PROVIDED UNDER THE TERMS OF AGPL VERSION 3 LICENSE OR
 * THIS OSMC PUBLIC LICENSE (OSMC-PL) VERSION 1.8.
 * ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS PROGRAM CONSTITUTES
 * RECIPIENT'S ACCEPTANCE OF THE OSMC PUBLIC LICENSE OR THE GNU AGPL
 * VERSION 3, ACCORDING TO RECIPIENTS CHOICE.
 *
 * The OpenModelica software and the OSMC (Open Source Modelica Consortium)
 * Public License (OSMC-PL) are obtained from OSMC, either from the above
 * address, from the URLs:
 * http://www.openmodelica.org or
 * https://github.com/OpenModelica/ or
 * http://www.ida.liu.se/projects/OpenModelica,
 * and in the OpenModelica distribution.
 *
 * GNU AGPL version 3 is obtained from:
 * https://www.gnu.org/licenses/licenses.html#GPL
 *
 * This program is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE, EXCEPT AS EXPRESSLY SET FORTH
 * IN THE BY RECIPIENT SELECTED SUBSIDIARY LICENSE CONDITIONS OF OSMC-PL.
 *
 * See the full OSMC Public License conditions for more details.
 *
 */

/*
 * Single-file name resolution for MetaModelica.
 *
 * MetaModelica packages are encapsulated, so the encapsulation boundary stops
 * lexical lookup (except for predefined/builtin names). A single file is
 * therefore essentially self-contained for resolution: every identifier must
 * resolve to a binding in some lexically enclosing scope or to a builtin.
 *
 * This module builds a lexical scope tree for the file, collects the bindings
 * introduced in each scope, and reports references whose leading identifier
 * resolves nowhere. To stay conservative (avoid false positives) it stays
 * silent whenever an enclosing class `extends` another class or does an
 * unqualified `import X.*` — in those cases the name may legitimately come
 * from outside the file, which we cannot see without a workspace index.
 *
 * See section 5.3 of the Modelica specification for the full lookup rules.
 */

import { Node as SyntaxNode } from 'web-tree-sitter';

interface Scope {
  parent: Scope | null;
  names: Set<string>;
  /** This scope is a class declared `encapsulated` (a lookup boundary). */
  encapsulated: boolean;
  /**
   * This scope's class `extends` another class or imports unqualified, so
   * unknown names may come from outside the file. Suppress diagnostics.
   */
  opaque: boolean;
}

export interface UnresolvedName {
  node: SyntaxNode;
  name: string;
}

function newScope(parent: Scope | null, encapsulated: boolean): Scope {
  return { parent, names: new Set<string>(), encapsulated, opaque: false };
}

/**
 * Is this node an identifier leaf? Normally `IDENT`, but Modelica keywords
 * (e.g. `operator`) can be used as identifiers, in which case the grammar
 * tokenizes them as their keyword token (e.g. `OPERATOR`). Treat any leaf
 * token whose text starts like an identifier as an identifier.
 */
function isIdentToken(node: SyntaxNode): boolean {
  if (node.childCount !== 0) {
    return false;
  }
  if (/^_+$/.test(node.text)) {
    // The wildcard `_` (token `WILD`) and bare underscores are placeholders,
    // never references.
    return false;
  }
  return node.type === 'IDENT' || /^[A-Za-z_]\w*$/.test(node.text);
}

/** Text of the first identifier descendant of `node`, in document order. */
function firstIdentText(node: SyntaxNode): string | null {
  const found = firstIdentNode(node);
  return found ? found.text : null;
}

/** First identifier descendant node (not just its text). */
function firstIdentNode(node: SyntaxNode): SyntaxNode | null {
  if (node.childCount === 0) {
    return isIdentToken(node) ? node : null;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const found = firstIdentNode(child);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Does this `class_definition` carry the `encapsulated` prefix? */
function isEncapsulated(classDef: SyntaxNode): boolean {
  for (let i = 0; i < classDef.childCount; i++) {
    if (classDef.child(i)?.type === 'ENCAPSULATED') {
      return true;
    }
  }
  return false;
}

/** A `function_arguments` node is a reduction iff it has a `for_indices` child. */
function isReductionArguments(node: SyntaxNode): boolean {
  if (node.type !== 'function_arguments') {
    return false;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    if (node.namedChild(i)?.type === 'for_indices') {
      return true;
    }
  }
  return false;
}

/**
 * Walk the tree building the scope tree and collecting bindings, the list of
 * references to resolve (each paired with its enclosing scope), and the set of
 * IDENT node ids that are `as`-pattern binding occurrences (so they are not
 * treated as references).
 */
function collect(
  node: SyntaxNode,
  scope: Scope,
  refs: { node: SyntaxNode; name: string; scope: Scope }[],
  asBindingIds: Set<number>,
): void {
  // Names inside an `annotation(...)` are annotation/attribute names, not
  // references to local declarations — skip the whole subtree.
  if (node.type === 'annotation') {
    return;
  }

  // Determine the scope used for this node's children.
  let childScope = scope;

  switch (node.type) {
    case 'class_definition': {
      // The class name is a member of the enclosing scope.
      const spec = node.childForFieldName('classSpecifier');
      const idNode = spec?.childForFieldName('identifier') ?? null;
      const name = idNode ? firstIdentText(idNode) : null;
      if (name) {
        scope.names.add(name);
      }
      // Record constructors of a uniontype are visible in the scope that
      // declares the uniontype (used unqualified, e.g. `FRAME(...)`).
      if (node.childForFieldName('classType')?.text === 'uniontype') {
        hoistUniontypeRecords(node, scope);
      }
      childScope = newScope(scope, isEncapsulated(node));
      // Generic type parameters (`function foo<ArgT, ResultT>`) are bare IDENT
      // children of the class_specifier, visible inside the class body.
      if (spec) {
        for (let i = 0; i < spec.childCount; i++) {
          const child = spec.child(i);
          if (child?.type === 'IDENT') {
            childScope.names.add(child.text);
          }
        }
      }
      break;
    }
    case 'match_expression':
    case 'for_clause_a':
    case 'for_clause_e':
      childScope = newScope(scope, false);
      break;
    case 'function_arguments':
      if (isReductionArguments(node)) {
        childScope = newScope(scope, false);
      }
      break;
    case 'component_declaration': {
      const name = firstIdentText(node);
      if (name) {
        scope.names.add(name);
      }
      break;
    }
    case 'for_index': {
      const name = firstIdentText(node);
      if (name) {
        scope.names.add(name);
      }
      break;
    }
    case 'import_clause':
      collectImport(node, scope);
      break;
    case 'extends_clause':
      // An extended base class may bring in names we cannot see.
      scope.opaque = true;
      break;
    case 'component_reference': {
      // The name part of a modifier (`x(unit = "m")`) is an attribute of the
      // modified type, not a reference to a local declaration.
      if (node.parent?.type === 'element_modification') {
        break;
      }
      // A leading-dot reference (`.A.B.C`) is a global-scope lookup we cannot
      // resolve within the file; only the first identifier of a normal name
      // (simple `x` or composite `A.B.C`) must resolve locally.
      if (!hasLeadingDot(node)) {
        const ident = firstIdentNode(node);
        if (ident) {
          refs.push({ node: ident, name: ident.text, scope });
        }
      }
      break;
    }
    case 'type_specifier': {
      // Builtin scalar types (Integer, Real, ...) are keyword tokens with no
      // name_path; only user/dotted types have a name_path to resolve.
      const namePath = childForType(node, 'name_path');
      if (namePath && !hasLeadingDot(namePath)) {
        const ident = firstIdentNode(namePath);
        if (ident) {
          refs.push({ node: ident, name: ident.text, scope });
        }
      }
      break;
    }
  }

  // Handle `<pattern> as <name>` binding occurrences before recursing: the
  // name immediately after an `AS` token binds the matched value.
  registerAsBindings(node, childScope, asBindingIds);

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      collect(child, childScope, refs, asBindingIds);
    }
  }
}

/** Add the import name of an `import_clause` and flag unqualified imports opaque. */
function collectImport(node: SyntaxNode, scope: Scope): void {
  const explicit = childForType(node, 'explicit_import_name');
  if (explicit) {
    // `import D = A.B.C;` — the import name is the alias D.
    const ident = firstIdentNode(explicit);
    if (ident) {
      scope.names.add(ident.text);
    }
    return;
  }
  const implicit = childForType(node, 'implicit_import_name');
  if (implicit) {
    const text = implicit.text;
    if (text.includes('*')) {
      // `import A.B.*;` brings in members we cannot enumerate.
      scope.opaque = true;
      return;
    }
    if (text.includes('{')) {
      // `import A.B.{X,Y,Z};` — each braced name is imported.
      collectBracedImportNames(implicit, scope);
      return;
    }
    // `import A.B.C;` — the import name is the last path segment C.
    const name = lastIdentText(implicit);
    if (name) {
      scope.names.add(name);
    }
  }
}

/** Add every IDENT inside the braces of `import A.B.{X,Y,Z};`. */
function collectBracedImportNames(node: SyntaxNode, scope: Scope): void {
  let inBraces = false;
  const visit = (n: SyntaxNode): void => {
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (!child) {
        continue;
      }
      if (child.type === 'LBRACE') {
        inBraces = true;
      } else if (child.type === 'RBRACE') {
        inBraces = false;
      } else if (inBraces && child.type === 'IDENT') {
        scope.names.add(child.text);
      } else if (child.childCount > 0) {
        visit(child);
      }
    }
  };
  visit(node);
}

/**
 * Register the operands of an `as` pattern as bindings (and mark their IDENTs
 * so they are not treated as references). The `as` operator appears in two
 * forms: `pattern as name` in case patterns and `name as expr` in a match
 * subject, so both the operand before and the operand after `as` may bind a
 * fresh variable. Treating both conservatively avoids false positives.
 */
function registerAsBindings(node: SyntaxNode, scope: Scope, asBindingIds: Set<number>): void {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i)?.type !== 'AS') {
      continue;
    }
    registerAsOperand(prevNamedSibling(node, i), scope, asBindingIds);
    registerAsOperand(nextNamedSibling(node, i), scope, asBindingIds);
  }
}

function registerAsOperand(operand: SyntaxNode | null, scope: Scope, asBindingIds: Set<number>): void {
  if (!operand) {
    return;
  }
  const ident = firstIdentNode(operand);
  if (ident) {
    scope.names.add(ident.text);
    asBindingIds.add(ident.id);
  }
}

function prevNamedSibling(node: SyntaxNode, index: number): SyntaxNode | null {
  for (let j = index - 1; j >= 0; j--) {
    const sibling = node.child(j);
    if (sibling?.isNamed) {
      return sibling;
    }
  }
  return null;
}

function nextNamedSibling(node: SyntaxNode, index: number): SyntaxNode | null {
  for (let j = index + 1; j < node.childCount; j++) {
    const sibling = node.child(j);
    if (sibling?.isNamed) {
      return sibling;
    }
  }
  return null;
}

/** Does this reference begin with a leading `.` (global-scope lookup)? */
function hasLeadingDot(node: SyntaxNode): boolean {
  return node.child(0)?.type === 'DOT';
}

/**
 * Add the names of a uniontype's record constructors to `scope` (the scope in
 * which the uniontype is declared), where they are visible unqualified.
 */
function hoistUniontypeRecords(classDef: SyntaxNode, scope: Scope): void {
  const spec = classDef.childForFieldName('classSpecifier');
  const composition = spec ? childForType(spec, 'composition') : null;
  if (!composition) {
    return;
  }
  for (let i = 0; i < composition.namedChildCount; i++) {
    const element = composition.namedChild(i);
    if (!element) {
      continue;
    }
    const record = element.type === 'class_definition' ? element : childForType(element, 'class_definition');
    if (record && record.childForFieldName('classType')?.text === 'record') {
      const recSpec = record.childForFieldName('classSpecifier');
      const idNode = recSpec?.childForFieldName('identifier') ?? null;
      const name = idNode ? firstIdentText(idNode) : null;
      if (name) {
        scope.names.add(name);
      }
    }
  }
}

/** First direct named child of the given type, or null. */
function childForType(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === type) {
      return child;
    }
  }
  return null;
}

/** Text of the last identifier descendant, in document order. */
function lastIdentText(node: SyntaxNode): string | null {
  let result: string | null = null;
  const visit = (n: SyntaxNode): void => {
    if (n.childCount === 0) {
      if (isIdentToken(n)) {
        result = n.text;
      }
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) {
        visit(child);
      }
    }
  };
  visit(node);
  return result;
}

/**
 * Resolve a name against the scope chain. Returns 'resolved', 'unresolved', or
 * 'suppressed' (unresolved but inside a scope we cannot fully analyze).
 */
function resolve(name: string, scope: Scope, builtins: ReadonlySet<string>): 'resolved' | 'unresolved' | 'suppressed' {
  let sawOpaque = false;
  let sealed = false;
  let current: Scope | null = scope;
  while (current) {
    if (current.opaque) {
      sawOpaque = true;
    }
    if (current.names.has(name)) {
      return 'resolved';
    }
    if (current.encapsulated) {
      // Lookup stops at an encapsulated boundary (except builtins, below).
      sealed = true;
      break;
    }
    current = current.parent;
  }
  if (builtins.has(name)) {
    return 'resolved';
  }
  // Only an encapsulated package gives us a closed world where an unresolved
  // name is definitely an error. Outside one, the name could still be found by
  // global lookup, so stay silent. Likewise stay silent if a reachable class
  // `extends` another or imports unqualified.
  if (!sealed || sawOpaque) {
    return 'suppressed';
  }
  return 'unresolved';
}

/**
 * Find references in the tree whose leading identifier cannot be resolved.
 *
 * @param root      Root syntax node of a parsed file.
 * @param builtins  Predefined names visible without an import.
 * @returns         Unresolved references (the offending IDENT node + name).
 */
export function getUnresolvedNames(root: SyntaxNode, builtins: ReadonlySet<string>): UnresolvedName[] {
  const rootScope = newScope(null, false);
  const refs: { node: SyntaxNode; name: string; scope: Scope }[] = [];
  const asBindingIds = new Set<number>();

  collect(root, rootScope, refs, asBindingIds);

  const unresolved: UnresolvedName[] = [];
  for (const ref of refs) {
    if (asBindingIds.has(ref.node.id)) {
      continue;
    }
    if (resolve(ref.name, ref.scope, builtins) === 'unresolved') {
      unresolved.push({ node: ref.node, name: ref.name });
    }
  }
  return unresolved;
}
