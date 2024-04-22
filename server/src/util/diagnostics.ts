/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
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

import { MetaModelicaQueries } from './../analyzer';
import * as TreeSitterUtil from './tree-sitter';
import { logger } from './logger';

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
