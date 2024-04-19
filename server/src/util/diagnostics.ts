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

export function getDiagnosticsFromTree(tree: Parser.Tree, queries: MetaModelicaQueries): LSP.Diagnostic[] {
  const diagnostics: LSP.Diagnostic[] = [];
  let captures: Parser.QueryCapture[];

  // Handle all ERROR nodes from tree
  captures = queries.errorQuery.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Syntax Error"));
    }
  }

  // Handle all illegal equations
  captures = queries.illegalEqualsQuery.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Parse error: Algorithms can not contain equations ('='), use assignments (':=') instead."));
    }
  }
  // Handle all illegal assigns
  captures = queries.illegalAssignQuery.captures(tree.rootNode);
  if (captures.length > 0) {
    for (const capture of captures ) {
      diagnostics.push(nodeToDiagnostic(
        capture.node,
        LSP.DiagnosticSeverity.Error,
        "Parse error: Equations can not contain assignments (':='), use equations ('=') instead."));
    }
  }


  // Get all MISSING from tree


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
