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

import * as LSP from 'vscode-languageserver/node';
import * as Parser from 'web-tree-sitter';

import { MetaModelicaQueries } from './analyzer';
import * as TreeSitterUtil from './tree-sitter';
import { logger } from '../util/logger';

export interface UnusedArgFix {
  argName: string;
  edits: LSP.TextEdit[];
}

export interface UnusedVarFix {
  varName: string;
  edits: LSP.TextEdit[];
}

export interface SilencedOutputFix {
  edits: LSP.TextEdit[];
}

export interface WildcardMatchFix {
  edits: LSP.TextEdit[];
}

export interface RedundantParensFix {
  edits: LSP.TextEdit[];
}

export interface WildcardTupleFix {
  edits: LSP.TextEdit[];
}

export interface UnusedCaseBindingFix {
  bindName: string;
  edits: LSP.TextEdit[];
}

/**
 * Extract tuple element expressions from a `(a, b, c)` expression node.
 * Returns null if the expression is not a parenthesized tuple with at least two elements.
 */
function getTupleInfo(expr: Parser.Node): { inner: Parser.Node; elements: Parser.Node[] } | null {
  // A tuple expression `(a, b, c)` parses as:
  //   expression -> simple_expression -> LPAR expression COMMA expression ... RPAR
  const inner = expr.namedChildren.find(c => c.type === 'simple_expression');
  if (!inner) { return null; }

  const hasParens = inner.children.some(c => c.type === 'LPAR') &&
                    inner.children.some(c => c.type === 'RPAR');
  if (!hasParens) { return null; }

  const elements = inner.namedChildren.filter(c => c.type === 'expression');
  if (elements.length < 2) { return null; }

  return { inner, elements };
}

/**
 * Return true if the expression node is a plain identifier (no dots, no call).
 * Only plain identifiers are safe to flag as unused — complex expressions such
 * as function calls (`f(x)`) or qualified names (`Foo.bar`) must not be removed
 * because they may carry information or have side-effects.
 */
function isSimpleIdentifier(node: Parser.Node): boolean {
  // expression → simple_expression → component_reference__function_call → component_reference → IDENT
  const se = node.namedChildren.find(c => c.type === 'simple_expression');
  if (!se || se.namedChildren.length !== 1) { return false; }
  const crf = se.namedChildren[0];
  if (crf.type !== 'component_reference__function_call' || crf.namedChildren.length !== 1) { return false; }
  const cr = crf.namedChildren[0];
  if (cr.type !== 'component_reference' || cr.namedChildren.length !== 1) { return false; }
  return cr.namedChildren[0].type === 'IDENT';
}

/**
 * Build replacement text for a tuple after removing one element.
 * Parentheses are always kept: dropping them when only one element remains
 * would concatenate the expression with the preceding `match`/`case` keyword
 * (e.g. `match(x, y)` → `matchy`).
 */
function buildTupleNewText(elements: Parser.Node[], skipIndex: number): string {
  const remaining = elements.filter((_, i) => i !== skipIndex).map(e => e.text);
  return '(' + remaining.join(', ') + ')';
}

/**
 * Convert an LSP Position to a character offset in `source`.
 */
function offsetAtPosition(source: string, pos: LSP.Position): number {
  let line = 0;
  let i = 0;
  while (i < source.length && line < pos.line) {
    if (source[i] === '\n') { line++; }
    i++;
  }
  return i + pos.character;
}

/**
 * Convert a character offset in `source` to an LSP Position.
 */
function offsetToPosition(source: string, offset: number): LSP.Position {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') { line++; lineStart = i + 1; }
  }
  return LSP.Position.create(line, offset - lineStart);
}

/**
 * Get the IDENT node from a component_declaration node.
 * In the grammar: component_declaration → declaration → IDENT (field: identifier)
 */
function getDeclIdent(decl: Parser.Node): Parser.Node | null {
  const declNode = decl.namedChildren.find(c => c.type === 'declaration');
  if (!declNode) { return null; }
  return declNode.namedChildren.find(c => c.type === 'IDENT') || null;
}

/**
 * Return true if `name` appears as any IDENT node inside `scope`,
 * excluding the subtree rooted at `skipNode` (the declaration element).
 */
function isNameUsed(name: string, scope: Parser.Node, skipNode: Parser.Node): boolean {
  let found = false;
  const skipStart = skipNode.startIndex;
  const skipEnd = skipNode.endIndex;

  function visit(node: Parser.Node): void {
    if (found) { return; }
    if (node.startIndex === skipStart && node.endIndex === skipEnd) { return; }
    if (node.type === 'IDENT' && node.text === name) {
      found = true;
      return;
    }
    for (const child of node.children) {
      if (found) { return; }
      visit(child);
    }
  }

  visit(scope);
  return found;
}

/**
 * Build LSP TextEdits to remove a single component_declaration from its
 * parent element.  When it is the only declaration the entire element
 * (plus its trailing `;` and surrounding whitespace) is removed; otherwise
 * the declaration is excised from the comma-separated list.
 *
 * Multiple `element`s can share one source line (e.g. `Real a; Integer b;`),
 * so the "remove the whole line" shortcut would also delete unrelated
 * declarations. We compute the removal range from source character offsets
 * instead.
 */
function buildVarRemoveEdits(
  elementNode: Parser.Node,
  componentClause: Parser.Node,
  targetDecl: Parser.Node,
  source: string,
): LSP.TextEdit[] {
  const declarations = componentClause.namedChildren.filter(c => c.type === 'component_declaration');

  if (declarations.length === 1) {
    // The trailing `;` is a hidden token in the grammar and not part of
    // the `element` node, so scan the source forward over whitespace to
    // find and include it.
    let endIdx = elementNode.endIndex;
    while (endIdx < source.length && (source[endIdx] === ' ' || source[endIdx] === '\t')) {
      endIdx++;
    }
    if (source[endIdx] === ';') { endIdx++; }
    let startIdx = elementNode.startIndex;

    // If everything to the right of the cut (up to the next newline) is
    // whitespace, also consume that whitespace and the newline — and the
    // leading whitespace on this line — so we don't leave a blank line.
    let scanEnd = endIdx;
    while (scanEnd < source.length && (source[scanEnd] === ' ' || source[scanEnd] === '\t')) {
      scanEnd++;
    }
    const restOfLineIsBlank = scanEnd >= source.length || source[scanEnd] === '\n';
    if (restOfLineIsBlank) {
      if (scanEnd < source.length) { scanEnd++; } // consume the newline
      // back up to the previous newline (or start of file) so leading
      // indentation goes with the removed element.
      while (startIdx > 0 && (source[startIdx - 1] === ' ' || source[startIdx - 1] === '\t')) {
        startIdx--;
      }
      endIdx = scanEnd;
    } else {
      // Other content follows on the same line: also eat one trailing
      // space so we don't leave `Integer i;  Integer j;`.
      if (source[endIdx] === ' ') { endIdx++; }
    }

    return [{
      range: LSP.Range.create(
        offsetToPosition(source, startIdx),
        offsetToPosition(source, endIdx),
      ),
      newText: '',
    }];
  }

  const idx = declarations.indexOf(targetDecl);
  const allChildren = componentClause.children;
  const nodeIdx = allChildren.findIndex(c => c.startIndex === targetDecl.startIndex);

  if (nodeIdx === -1) {
    return [{ range: TreeSitterUtil.range(targetDecl), newText: '' }];
  }

  if (idx < declarations.length - 1) {
    // Not the last: remove "name, " by spanning to the start of the next declaration
    const nextDecl = declarations[idx + 1];
    return [{
      range: LSP.Range.create(
        targetDecl.startPosition.row, targetDecl.startPosition.column,
        nextDecl.startPosition.row, nextDecl.startPosition.column,
      ),
      newText: '',
    }];
  } else {
    // Last: remove ", name" by spanning back to the preceding COMMA
    let commaNode: Parser.Node | null = null;
    for (let i = nodeIdx - 1; i >= 0; i--) {
      if (allChildren[i].type === 'COMMA') {
        commaNode = allChildren[i];
        break;
      }
    }
    if (!commaNode) {
      return [{ range: TreeSitterUtil.range(targetDecl), newText: '' }];
    }
    return [{
      range: LSP.Range.create(
        commaNode.startPosition.row, commaNode.startPosition.column,
        targetDecl.endPosition.row, targetDecl.endPosition.column,
      ),
      newText: '',
    }];
  }
}

/**
 * Check all component_declarations within an element node for unused variables.
 */
function checkElementDeclarations(
  elementNode: Parser.Node,
  scope: Parser.Node,
  source: string,
  results: { varNode: Parser.Node; fix: UnusedVarFix }[],
  sectionHeaderToAlsoRemove: Parser.Node | null = null,
): void {
  const componentClause = elementNode.namedChildren.find(c => c.type === 'component_clause');
  if (!componentClause) { return; }

  const declarations = componentClause.namedChildren.filter(c => c.type === 'component_declaration');
  for (const decl of declarations) {
    const identNode = getDeclIdent(decl);
    if (!identNode) { continue; }
    const name = identNode.text;
    if (!isNameUsed(name, scope, elementNode)) {
      const edits = buildVarRemoveEdits(elementNode, componentClause, decl, source);
      // When the whole element disappears (sole declaration on the clause)
      // and it was the only element of its `protected` section, the section
      // header keyword would otherwise be left stranded — splice it out too.
      // The two edits can collide when both are on the same source line
      // (`protected Real x;`): the header trims trailing whitespace forward
      // while the element trims leading whitespace backward, so they share a
      // character. Merge into one edit in that case.
      if (sectionHeaderToAlsoRemove && declarations.length === 1) {
        const headerEdit = buildSectionHeaderRemoveEdit(sectionHeaderToAlsoRemove, source);
        const headerEnd = offsetAtPosition(source, headerEdit.range.end);
        const elementStart = offsetAtPosition(source, edits[0].range.start);
        if (headerEnd > elementStart) {
          edits[0] = {
            range: LSP.Range.create(headerEdit.range.start, edits[0].range.end),
            newText: '',
          };
        } else {
          edits.unshift(headerEdit);
        }
      }
      results.push({
        varNode: identNode,
        fix: { varName: name, edits },
      });
    }
  }
}

/**
 * Build an edit that removes a section header keyword (`protected` / `public`)
 * together with the indentation on its line and the trailing newline.
 */
function buildSectionHeaderRemoveEdit(
  header: Parser.Node,
  source: string,
): LSP.TextEdit {
  let startIdx = header.startIndex;
  let endIdx = header.endIndex;
  while (endIdx < source.length && (source[endIdx] === ' ' || source[endIdx] === '\t')) { endIdx++; }
  if (source[endIdx] === '\n') { endIdx++; }
  while (startIdx > 0 && (source[startIdx - 1] === ' ' || source[startIdx - 1] === '\t')) { startIdx--; }
  return {
    range: LSP.Range.create(
      offsetToPosition(source, startIdx),
      offsetToPosition(source, endIdx),
    ),
    newText: '',
  };
}

/**
 * Return true when `composition` belongs to a `function` class definition.
 * The grammar is composition → class_specifier → class_definition, where
 * `class_definition` has a `class_type` whose first token (FUNCTION,
 * PACKAGE, MODEL, RECORD, ...) names the class kind.
 */
function isInsideFunction(composition: Parser.Node): boolean {
  let cur: Parser.Node | null = composition.parent;
  while (cur && cur.type !== 'class_definition') { cur = cur.parent; }
  if (!cur) { return false; }
  const classType = cur.namedChildren.find(c => c.type === 'class_type');
  if (!classType) { return false; }
  return classType.children.some(c => c.type === 'FUNCTION');
}

/**
 * Find unused protected variables in function bodies and unused local
 * variables inside match/matchcontinue expressions.
 */
function getUnusedVariables(rootNode: Parser.Node): { varNode: Parser.Node; fix: UnusedVarFix }[] {
  const results: { varNode: Parser.Node; fix: UnusedVarFix }[] = [];
  const source = rootNode.text;

  TreeSitterUtil.forEach(rootNode, (node) => {
    // Protected variables declared inside a function's composition.
    // Packages/models/classes also have `protected` sections, but those
    // declare API-visible constants/members that may be referenced from
    // *other* files, so a file-local "unused" judgement is unsound there.
    if (node.type === 'composition' && isInsideFunction(node)) {
      // Group children into sections so we know, for each protected
      // element, whether removing it would also leave the section header
      // (`protected` keyword) stranded — a function can have more than one
      // `protected` section.
      type Section = {
        header: Parser.Node | null;
        isProtected: boolean;
        elements: Parser.Node[];
      };
      const sections: Section[] = [{ header: null, isProtected: false, elements: [] }];
      for (const child of node.children) {
        if (child.type === 'PROTECTED') {
          sections.push({ header: child, isProtected: true, elements: [] });
        } else if (child.type === 'PUBLIC') {
          sections.push({ header: child, isProtected: false, elements: [] });
        } else if (child.type === 'element') {
          sections[sections.length - 1].elements.push(child);
        }
      }
      for (const sec of sections) {
        if (!sec.isProtected) { continue; }
        const headerToRemove = sec.elements.length === 1 ? sec.header : null;
        for (const el of sec.elements) {
          checkElementDeclarations(el, node, source, results, headerToRemove);
        }
      }
    }

    // Local variables declared in a match/matchcontinue local clause
    if (node.type === 'match_expression') {
      const localClause = node.namedChildren.find(c => c.type === 'local_clause');
      if (localClause) {
        for (const child of localClause.namedChildren) {
          if (child.type === 'element') {
            checkElementDeclarations(child, node, source, results);
          }
        }
      }
    }

    return true;
  });

  return results;
}

/**
 * Find arguments of a `match`/`matchcontinue` that are a plain identifier and
 * matched by `_` in every case branch, and are therefore unused.
 */
function getUnusedMatchArguments(rootNode: Parser.Node): { argNode: Parser.Node; fix: UnusedArgFix }[] {
  const results: { argNode: Parser.Node; fix: UnusedArgFix }[] = [];

  TreeSitterUtil.forEach(rootNode, (node) => {
    if (node.type !== 'match_expression') {
      return true;
    }

    const inputExpr = node.namedChildren.find(c => c.type === 'expression');
    if (!inputExpr) { return true; }

    const inputInfo = getTupleInfo(inputExpr);
    if (!inputInfo) { return true; }

    const { inner: inputInner, elements: inputArgs } = inputInfo;

    const casesNode = node.namedChildren.find(c => c.type === 'cases');
    if (!casesNode) { return true; }

    const onecases = casesNode.namedChildren.filter(c => c.type === 'onecase');
    if (onecases.length === 0) { return true; }

    const caseInfos: { inner: Parser.Node; elements: Parser.Node[] }[] = [];
    for (const onecase of onecases) {
      const patternExpr = onecase.namedChildren.find(c => c.type === 'expression');
      if (!patternExpr) { return true; }
      const info = getTupleInfo(patternExpr);
      if (!info || info.elements.length !== inputArgs.length) {
        // Pattern arity differs; per-position usage cannot be inferred.
        return true;
      }
      caseInfos.push(info);
    }

    for (let i = 0; i < inputArgs.length; i++) {
      if (!isSimpleIdentifier(inputArgs[i])) { continue; }
      if (caseInfos.every(ci => ci.elements[i].text.trim() === '_')) {
        const edits: LSP.TextEdit[] = [
          { range: TreeSitterUtil.range(inputInner), newText: buildTupleNewText(inputArgs, i) },
          ...caseInfos.map(ci => ({
            range: TreeSitterUtil.range(ci.inner),
            newText: buildTupleNewText(ci.elements, i)
          }))
        ];
        results.push({ argNode: inputArgs[i], fix: { argName: inputArgs[i].text, edits } });
      }
    }

    return true;
  });

  return results;
}

/**
 * Check whether a simple_expression node represents a bare wildcard `_`.
 * Structure: simple_expression → component_reference__function_call → component_reference → WILD
 */
function isWildcardSimpleExpr(simpleExpr: Parser.Node): boolean {
  if (simpleExpr.type !== 'simple_expression') { return false; }
  if (simpleExpr.namedChildren.length !== 1) { return false; }
  const crf = simpleExpr.namedChildren[0];
  if (crf.type !== 'component_reference__function_call' || crf.namedChildren.length !== 1) { return false; }
  const cr = crf.namedChildren[0];
  if (cr.type !== 'component_reference' || cr.namedChildren.length !== 1) { return false; }
  return cr.namedChildren[0].type === 'WILD';
}

/**
 * Find `_ := expr` statements in algorithm sections.
 *
 * Returns two kinds of results:
 * - `silenced`: `_ := functionCall()` where `_ :=` can simply be removed.
 * - `wildcardMatch`: `_ := match/matchcontinue` where `_` should be replaced
 *   with `()` because match expressions cannot be used as standalone statements.
 */
function getSilencedOutputs(rootNode: Parser.Node): {
  silenced: { wildNode: Parser.Node; fix: SilencedOutputFix }[];
  wildcardMatch: { wildNode: Parser.Node; fix: WildcardMatchFix }[];
} {
  const silenced: { wildNode: Parser.Node; fix: SilencedOutputFix }[] = [];
  const wildcardMatch: { wildNode: Parser.Node; fix: WildcardMatchFix }[] = [];

  TreeSitterUtil.forEach(rootNode, (node) => {
    if (node.type !== 'assign_clause_a') { return true; }

    const lhsExpr = node.namedChildren.find(c => c.type === 'simple_expression');
    if (!lhsExpr || !isWildcardSimpleExpr(lhsExpr)) { return true; }

    const rhsExpr = node.namedChildren.find(c => c.type === 'expression');
    if (!rhsExpr) { return true; }

    // The WILD node is nested inside lhsExpr.
    const wildNode = lhsExpr.namedChildren[0].namedChildren[0].namedChildren[0];

    if (rhsExpr.namedChildren.some(c => c.type === 'match_expression')) {
      // `_ := match/matchcontinue` — match expressions cannot be used as
      // standalone statements, so `_ :=` is required. Replace `_` with `()`
      // to make it explicit that the output is intentionally discarded.
      wildcardMatch.push({
        wildNode,
        fix: {
          edits: [{
            range: LSP.Range.create(
              wildNode.startPosition.row, wildNode.startPosition.column,
              wildNode.endPosition.row, wildNode.endPosition.column,
            ),
            newText: '()',
          }],
        },
      });
    } else {
      // Remove `_ := ` by replacing the span from the start of assign_clause_a
      // to the start of the RHS expression with an empty string.
      silenced.push({
        wildNode,
        fix: {
          edits: [{
            range: LSP.Range.create(
              node.startPosition.row, node.startPosition.column,
              rhsExpr.startPosition.row, rhsExpr.startPosition.column,
            ),
            newText: '',
          }],
        },
      });
    }
    return true;
  });

  return { silenced, wildcardMatch };
}

/**
 * Return the inner expression when `simpleExpr` is a single-element
 * parenthesized expression `(x)` — i.e. a `simple_expression` whose
 * children are exactly LPAR, expression, RPAR (no comma, no trailing
 * operator like `::`). For example `(r as X)::rest` is rejected because
 * the parens only wrap the head of a cons, not the whole expression.
 */
function getSingleElementParensInner(simpleExpr: Parser.Node): Parser.Node | null {
  if (simpleExpr.type !== 'simple_expression') { return null; }
  const cs = simpleExpr.children;
  if (cs.length !== 3) { return null; }
  if (cs[0].type !== 'LPAR' || cs[2].type !== 'RPAR') { return null; }
  if (cs[1].type !== 'expression') { return null; }
  return cs[1];
}

/**
 * Build the edit that replaces `(x)` with `x`. Stripping the parens can fuse
 * the inner text with neighbouring tokens on either side — e.g. `match(x)` →
 * `matchx`, or `case(_)then` → `case _then` — so we pad with a space on
 * whichever side would otherwise concatenate two identifier-like characters.
 */
function buildRemoveParensEdit(
  outer: Parser.Node,
  inner: Parser.Node,
  source: string,
): LSP.TextEdit {
  const idChar = /[A-Za-z0-9_]/;
  const prevChar = outer.startIndex > 0 ? source.charAt(outer.startIndex - 1) : ' ';
  const nextChar = outer.endIndex < source.length ? source.charAt(outer.endIndex) : ' ';
  const innerText = inner.text;
  const leadSpace = idChar.test(prevChar) ? ' ' : '';
  const trailSpace = idChar.test(nextChar) && idChar.test(innerText.charAt(innerText.length - 1)) ? ' ' : '';
  return {
    range: TreeSitterUtil.range(outer),
    newText: leadSpace + innerText + trailSpace,
  };
}

function reportParens(
  results: { node: Parser.Node; fix: RedundantParensFix }[],
  simpleExpr: Parser.Node,
  source: string,
): void {
  const inner = getSingleElementParensInner(simpleExpr);
  if (!inner) { return; }
  results.push({
    node: simpleExpr,
    fix: { edits: [buildRemoveParensEdit(simpleExpr, inner, source)] },
  });
}

/**
 * Find redundant single-element parens in three positions:
 *   - `match (x)` inputs
 *   - `case  (x)` patterns
 *   - `(x) := f(...)` assignment LHS
 * In each case the parens wrap a single expression (not a tuple) and can be
 * dropped without changing semantics.
 */
function getRedundantParens(rootNode: Parser.Node):
  { node: Parser.Node; fix: RedundantParensFix }[] {
  const results: { node: Parser.Node; fix: RedundantParensFix }[] = [];
  const source = rootNode.text;

  TreeSitterUtil.forEach(rootNode, (node) => {
    if (node.type === 'match_expression') {
      const inputExpr = node.namedChildren.find(c => c.type === 'expression');
      const inputSimple = inputExpr?.namedChildren.find(c => c.type === 'simple_expression');
      if (inputSimple) { reportParens(results, inputSimple, source); }

      const casesNode = node.namedChildren.find(c => c.type === 'cases');
      if (casesNode) {
        for (const onecase of casesNode.namedChildren.filter(c => c.type === 'onecase')) {
          const patternExpr = onecase.namedChildren.find(c => c.type === 'expression');
          const patternSimple = patternExpr?.namedChildren.find(c => c.type === 'simple_expression');
          if (patternSimple) { reportParens(results, patternSimple, source); }
        }
      }
    } else if (node.type === 'assign_clause_a') {
      const lhs = node.namedChildren.find(c => c.type === 'simple_expression');
      if (lhs) { reportParens(results, lhs, source); }
    }
    return true;
  });

  return results;
}

/**
 * Return true if `simpleExpr` is a parenthesized tuple where every element
 * is a bare wildcard `_`.
 */
function isAllWildcardTuple(simpleExpr: Parser.Node): boolean {
  if (simpleExpr.type !== 'simple_expression') { return false; }
  const cs = simpleExpr.children;
  // Must be exactly LPAR, expression, (COMMA expression)+, RPAR. Anything
  // else (e.g. a trailing `::rest` cons) means the parens don't wrap the
  // whole expression.
  if (cs.length < 5) { return false; }
  if (cs[0].type !== 'LPAR' || cs[cs.length - 1].type !== 'RPAR') { return false; }
  for (let i = 1; i < cs.length - 1; i++) {
    const expected = i % 2 === 1 ? 'expression' : 'COMMA';
    if (cs[i].type !== expected) { return false; }
  }
  const elements = simpleExpr.namedChildren.filter(c => c.type === 'expression');
  for (const el of elements) {
    const inner = el.namedChildren.find(c => c.type === 'simple_expression');
    if (!inner || !isWildcardSimpleExpr(inner)) { return false; }
  }
  return true;
}

/**
 * Return true if `simpleExpr` is *the* top-level pattern of a `case` branch
 * or *the* top-level input expression of `match`. Such positions are deliberately
 * excluded from the wildcard-tuple fix: collapsing them changes the visible
 * arity at the match boundary and is better handled by the unused-match-arg
 * detector.
 */
function isTopLevelMatchPattern(simpleExpr: Parser.Node): boolean {
  const parent = simpleExpr.parent;
  if (!parent || parent.type !== 'expression') { return false; }
  const grand = parent.parent;
  return grand?.type === 'onecase' || grand?.type === 'match_expression';
}

/**
 * Find `(_, _, ..., _)` tuples nested inside larger patterns and collapse
 * them to a single `_`. Top-level case patterns and match inputs are
 * intentionally skipped — see `isTopLevelMatchPattern`.
 */
function getWildcardTuples(rootNode: Parser.Node):
  { node: Parser.Node; fix: WildcardTupleFix }[] {
  const results: { node: Parser.Node; fix: WildcardTupleFix }[] = [];
  const source = rootNode.text;

  TreeSitterUtil.forEach(rootNode, (node) => {
    if (!isAllWildcardTuple(node)) { return true; }
    if (isTopLevelMatchPattern(node)) { return true; }

    const idChar = /[A-Za-z0-9_]/;
    const prevChar = node.startIndex > 0 ? source.charAt(node.startIndex - 1) : ' ';
    const nextChar = node.endIndex < source.length ? source.charAt(node.endIndex) : ' ';
    const leadSpace = idChar.test(prevChar) ? ' ' : '';
    const trailSpace = idChar.test(nextChar) ? ' ' : '';
    results.push({
      node,
      fix: {
        edits: [{
          range: TreeSitterUtil.range(node),
          newText: leadSpace + '_' + trailSpace,
        }],
      },
    });
    return true;
  });

  return results;
}

/**
 * Return the IDENT leaf of an `expression` node that satisfies
 * `isSimpleIdentifier`. Returns null otherwise.
 */
function getSimpleIdentifierLeaf(expr: Parser.Node): Parser.Node | null {
  if (!isSimpleIdentifier(expr)) { return null; }
  const se = expr.namedChildren[0];
  const crf = se.namedChildren[0];
  const cr = crf.namedChildren[0];
  return cr.namedChildren[0];
}

/**
 * Find pattern bindings inside `case` patterns that bind an identifier which
 * is never referenced — in the case body, anywhere else in the same
 * `onecase`, *or* anywhere else in the enclosing function. The last check
 * matters because MetaModelica `match` patterns can write to outer-scope
 * variables: a pattern `type_ = ty` may assign to a protected `ty` that is
 * read later, after `end match`.
 *
 * Example:
 *   case (x, i) then x;   →   case (x, _) then x;
 *
 * Reported only when the name appears exactly once in the `onecase` AND
 * does not appear anywhere outside it within the enclosing `class_definition`
 * (so deliberate pattern-equality bindings like `case (x, x)` and outer-
 * scope binding writes like `case PROP(type_ = ty)` followed by `... := ty`
 * are both left alone).
 */
function getUnusedCaseBindings(rootNode: Parser.Node):
  { identNode: Parser.Node; fix: UnusedCaseBindingFix }[] {
  const results: { identNode: Parser.Node; fix: UnusedCaseBindingFix }[] = [];

  TreeSitterUtil.forEach(rootNode, (node) => {
    if (node.type !== 'onecase') { return true; }

    const expressions = node.namedChildren.filter(c => c.type === 'expression');
    if (expressions.length === 0) { return true; }
    const pattern = expressions[0];

    const insideCounts = new Map<string, number>();
    function countInside(n: Parser.Node): void {
      if (n.type === 'IDENT') {
        insideCounts.set(n.text, (insideCounts.get(n.text) ?? 0) + 1);
      }
      for (const c of n.children) { countInside(c); }
    }
    countInside(node);

    let scope: Parser.Node | null = node.parent;
    while (scope && scope.type !== 'class_definition') { scope = scope.parent; }
    const enclosing: Parser.Node = scope ?? rootNode;

    const outsideNames = new Set<string>();
    const skipStart = node.startIndex;
    const skipEnd = node.endIndex;
    function collectOutside(n: Parser.Node): void {
      if (n.startIndex === skipStart && n.endIndex === skipEnd) { return; }
      // Skip the IDENT that names a `declaration` itself — that is the
      // variable's binding occurrence, not a read of it. Modifications and
      // other deeper IDENTs under the declaration *are* uses and remain.
      if (n.type === 'IDENT' && n.parent?.type !== 'declaration') {
        outsideNames.add(n.text);
      }
      for (const c of n.children) { collectOutside(c); }
    }
    collectOutside(enclosing);

    function visit(e: Parser.Node): void {
      if (e.type === 'expression') {
        const ident = getSimpleIdentifierLeaf(e);
        if (ident) {
          const name = ident.text;
          if (name !== '_'
              && (insideCounts.get(name) ?? 0) === 1
              && !outsideNames.has(name)) {
            results.push({
              identNode: ident,
              fix: {
                bindName: name,
                edits: [{ range: TreeSitterUtil.range(ident), newText: '_' }],
              },
            });
          }
          return;
        }
      }
      for (const c of e.namedChildren) { visit(c); }
    }
    visit(pattern);

    return true;
  });

  return results;
}

export function getDiagnosticsFromTree(tree: Parser.Tree, queries: MetaModelicaQueries): LSP.Diagnostic[] {
  const diagnostics: LSP.Diagnostic[] = [];
  let captures: Parser.QueryCapture[];

  // Handle all ERROR nodes from tree
  captures = queries.error.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Syntax Error"));
    }
  }

  // Handle all illegal equations
  captures = queries.illegalEquals.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Parse error: Algorithms can not contain equations ('='), use assignments (':=') instead."));
    }
  }
  // Handle all illegal assigns
  captures = queries.illegalAssign.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Parse error: Equations can not contain assignments (':='), use equations ('=') instead."));
    }
  }
  captures = queries.modifierAssign.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Warning,
        "Parse error: ':=' in modifiers has been deprecated, use '=' instead."));
    }
  }

  // Inform about missing else case in match
  captures = queries.missingElseCaseMatch.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Information,
        "Missing else case."));
    }
  }

  // Inform about equations in match case
  captures = queries.caseEquation.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Information,
        "Use 'algorithm' instead of 'equation' inside match cases."));
    }
  }

  // Inform that matchcontinue sucks
  captures = queries.matchcontinue.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Information,
        "'matchcontinue' is inefficient, use 'match' and 'try-catch' instead."));
    }
  }

  // Inform about unused protected / local variables
  const unusedVars = getUnusedVariables(tree.rootNode);
  for (const { varNode, fix } of unusedVars) {
    const diagnostic = nodeToDiagnostic(
      varNode,
      LSP.DiagnosticSeverity.Information,
      `Unused variable '${varNode.text}'.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { unusedVarFix: fix };
    diagnostics.push(diagnostic);
  }

  // Inform about unused match/matchcontinue arguments
  const unusedArgs = getUnusedMatchArguments(tree.rootNode);
  for (const { argNode, fix } of unusedArgs) {
    const diagnostic = nodeToDiagnostic(
      argNode,
      LSP.DiagnosticSeverity.Information,
      `Unused match argument '${argNode.text}': pattern is '_' in every case.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { unusedArgFix: fix };
    diagnostics.push(diagnostic);
  }

  // Inform about silenced outputs (`_ := expr`)
  const { silenced: silencedOutputs, wildcardMatch: wildcardMatches } = getSilencedOutputs(tree.rootNode);
  for (const { wildNode, fix } of silencedOutputs) {
    const diagnostic = nodeToDiagnostic(
      wildNode,
      LSP.DiagnosticSeverity.Information,
      `Unnecessary output silencing: replace '_ := expr' with just 'expr'.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { silencedOutputFix: fix };
    diagnostics.push(diagnostic);
  }
  for (const { wildNode, fix } of wildcardMatches) {
    const diagnostic = nodeToDiagnostic(
      wildNode,
      LSP.DiagnosticSeverity.Information,
      `Replace '_ :=' with '() :=' before match/matchcontinue to ensure output of match/matchcontinue isn't ignored by accident.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { wildcardMatchFix: fix };
    diagnostics.push(diagnostic);
  }

  // Inform about redundant single-element parens
  const redundantParens = getRedundantParens(tree.rootNode);
  for (const { node, fix } of redundantParens) {
    const diagnostic = nodeToDiagnostic(
      node,
      LSP.DiagnosticSeverity.Information,
      `Redundant parentheses around single expression.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { redundantParensFix: fix };
    diagnostics.push(diagnostic);
  }

  // Inform about all-wildcard tuple patterns `(_, _, _)` that collapse to `_`.
  const wildcardTuples = getWildcardTuples(tree.rootNode);
  for (const { node, fix } of wildcardTuples) {
    const diagnostic = nodeToDiagnostic(
      node,
      LSP.DiagnosticSeverity.Information,
      `All-wildcard tuple pattern is equivalent to '_'.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { wildcardTupleFix: fix };
    diagnostics.push(diagnostic);
  }

  // Inform about case-pattern bindings that are never used in the case body.
  const unusedCaseBindings = getUnusedCaseBindings(tree.rootNode);
  for (const { identNode, fix } of unusedCaseBindings) {
    const diagnostic = nodeToDiagnostic(
      identNode,
      LSP.DiagnosticSeverity.Information,
      `Unused case binding '${identNode.text}': replace with '_'.`);
    (diagnostic as LSP.Diagnostic & { data: unknown }).data = { unusedCaseBindingFix: fix };
    diagnostics.push(diagnostic);
  }

  // Check start and end identifier matching
  const matches = queries.startEndIdent.matches(tree.rootNode);
  logger.debug(queries.startEndIdent.captureNames.toString());
  if (matches.length > 0) {
    for (const match of matches ) {

      logger.debug("pattern: " + match.patternIndex.toString());

      const startNode = match.captures[0].node;
      const startIdent = startNode.text;
      const endNode = match.captures[1].node;
      const endIdent = endNode.text;

      if (startIdent !== endIdent) {
        diagnostics.push(nodeToDiagnostic(
          endNode,
          LSP.DiagnosticSeverity.Error,
          `Parse error: Start and end identifier don't match.\nReplace '${endIdent}' with '${startIdent}'.`));
      }
    }
  }

  return diagnostics;
}

/**
 * Node to diagnostic.
 *
 * @param node  Syntax node
 * @returns     Diagnostic
 */
function nodeToDiagnostic(node: Parser.Node, severity: LSP.DiagnosticSeverity, message: string): LSP.Diagnostic {
  const diagnostic: LSP.Diagnostic = {
    range: TreeSitterUtil.range(node),
    severity: severity,
    source: "MetaModelica-language-server",
    message: message,
  };

  return diagnostic;
}
