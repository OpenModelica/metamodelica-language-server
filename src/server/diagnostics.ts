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

/**
 * Extract tuple element expressions from a `(a, b, c)` expression node.
 * Returns null if the expression is not a parenthesized tuple with at least two elements.
 */
function getTupleInfo(expr: Parser.SyntaxNode): { inner: Parser.SyntaxNode; elements: Parser.SyntaxNode[] } | null {
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
function isSimpleIdentifier(node: Parser.SyntaxNode): boolean {
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
 * With one element remaining the outer parentheses are dropped.
 */
function buildTupleNewText(elements: Parser.SyntaxNode[], skipIndex: number): string {
  const remaining = elements.filter((_, i) => i !== skipIndex).map(e => e.text);
  if (remaining.length === 1) { return remaining[0]; }
  return '(' + remaining.join(', ') + ')';
}

/**
 * Get the IDENT node from a component_declaration node.
 * In the grammar: component_declaration → declaration → IDENT (field: identifier)
 */
function getDeclIdent(decl: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const declNode = decl.namedChildren.find(c => c.type === 'declaration');
  if (!declNode) { return null; }
  return declNode.namedChildren.find(c => c.type === 'IDENT') || null;
}

/**
 * Return true if `name` appears as any IDENT node inside `scope`,
 * excluding the subtree rooted at `skipNode` (the declaration element).
 */
function isNameUsed(name: string, scope: Parser.SyntaxNode, skipNode: Parser.SyntaxNode): boolean {
  let found = false;
  const skipStart = skipNode.startIndex;
  const skipEnd = skipNode.endIndex;

  function visit(node: Parser.SyntaxNode): void {
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
 * parent element.  When it is the only declaration the entire element line
 * is removed; otherwise the declaration is excised from the comma-separated
 * list.
 */
function buildVarRemoveEdits(
  elementNode: Parser.SyntaxNode,
  componentClause: Parser.SyntaxNode,
  targetDecl: Parser.SyntaxNode,
): LSP.TextEdit[] {
  const declarations = componentClause.namedChildren.filter(c => c.type === 'component_declaration');

  if (declarations.length === 1) {
    return [{
      range: LSP.Range.create(
        elementNode.startPosition.row, 0,
        elementNode.endPosition.row + 1, 0,
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
    let commaNode: Parser.SyntaxNode | null = null;
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
  elementNode: Parser.SyntaxNode,
  scope: Parser.SyntaxNode,
  results: { varNode: Parser.SyntaxNode; fix: UnusedVarFix }[],
): void {
  const componentClause = elementNode.namedChildren.find(c => c.type === 'component_clause');
  if (!componentClause) { return; }

  const declarations = componentClause.namedChildren.filter(c => c.type === 'component_declaration');
  for (const decl of declarations) {
    const identNode = getDeclIdent(decl);
    if (!identNode) { continue; }
    const name = identNode.text;
    if (!isNameUsed(name, scope, elementNode)) {
      results.push({
        varNode: identNode,
        fix: {
          varName: name,
          edits: buildVarRemoveEdits(elementNode, componentClause, decl),
        },
      });
    }
  }
}

/**
 * Find unused protected variables in function bodies and unused local
 * variables inside match/matchcontinue expressions.
 */
function getUnusedVariables(rootNode: Parser.SyntaxNode): { varNode: Parser.SyntaxNode; fix: UnusedVarFix }[] {
  const results: { varNode: Parser.SyntaxNode; fix: UnusedVarFix }[] = [];

  TreeSitterUtil.forEach(rootNode, (node) => {
    // Protected variables declared inside a composition (function body)
    if (node.type === 'composition') {
      let inProtected = false;
      for (const child of node.children) {
        if (child.type === 'PROTECTED') { inProtected = true; continue; }
        if (child.type === 'PUBLIC') { inProtected = false; continue; }
        if (inProtected && child.type === 'element') {
          checkElementDeclarations(child, node, results);
        }
      }
    }

    // Local variables declared in a match/matchcontinue local clause
    if (node.type === 'match_expression') {
      const localClause = node.namedChildren.find(c => c.type === 'local_clause');
      if (localClause) {
        for (const child of localClause.namedChildren) {
          if (child.type === 'element') {
            checkElementDeclarations(child, node, results);
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
function getUnusedMatchArguments(rootNode: Parser.SyntaxNode): { argNode: Parser.SyntaxNode; fix: UnusedArgFix }[] {
  const results: { argNode: Parser.SyntaxNode; fix: UnusedArgFix }[] = [];

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

    const caseInfos: { inner: Parser.SyntaxNode; elements: Parser.SyntaxNode[] }[] = [];
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

  // Check start and end identifier matching
  const matches = queries.startEndIdent.matches(tree.rootNode);
  logger.debug(queries.startEndIdent.captureNames.toString());
  if (matches.length > 0) {
    for (const match of matches ) {

      logger.debug("pattern: " + match.pattern.toString());

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
function nodeToDiagnostic(node: Parser.SyntaxNode, severity: LSP.DiagnosticSeverity, message: string): LSP.Diagnostic {
  const diagnostic: LSP.Diagnostic = {
    range: TreeSitterUtil.range(node),
    severity: severity,
    source: "MetaModelica-language-server",
    message: message,
  };

  return diagnostic;
}
