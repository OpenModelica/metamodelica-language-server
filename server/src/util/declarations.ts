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

/* --------------------------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to MetaModelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/util/declarations.ts
 * ------------------------------------------------------------------------------------------ */

import * as LSP from 'vscode-languageserver/node';
import * as Parser from 'web-tree-sitter';

import * as TreeSitterUtil from './tree-sitter';
import { logger } from './logger';
import { MetaModelicaQueries } from './../analyzer';

const isEmpty = (data: string): boolean => {
  return typeof data === "string" && data.trim().length === 0;
};

/**
 * Returns all class declarations from a given tree.
 *
 * @param tree      Tree-sitter tree.
 * @param queries   MetaModelica language queries.
 * @returns         Symbol information for all declarations.
 */
export function getAllDeclarationsInTree(tree: Parser.Tree, queries: MetaModelicaQueries): LSP.DocumentSymbol[] {
  const documentSymbols: LSP.DocumentSymbol[] = [];
  const cursor = tree.walk();
  let reachedRoot = false;

  // Walk depth-first to each class_definition node.
  // Update DocumentSymbol children when going back up.
  while(!reachedRoot) {
    const currentNode = cursor.currentNode;

    if (cursor.nodeType === "class_definition") {
      const symbol = nodeToDocumentSymbol(currentNode, queries, []);
      if (symbol) {
        documentSymbols.push(symbol);
      }
    }

    if (cursor.gotoFirstChild()) {
      continue;
    }

    if (cursor.gotoNextSibling()) {
      continue;
    }

    let retracing = true;
    while (retracing) {
      // Try to go to parent
      if (cursor.gotoParent()) {
        if (cursor.nodeType === "class_definition") {
          let tmp = undefined;
          if (documentSymbols.length > 1) {
            tmp = documentSymbols.pop();
          }
          if (tmp) {
            if (documentSymbols.length > 0) {
              documentSymbols[documentSymbols.length - 1].children?.push(tmp);
            }
          }
        }
      } else {
        retracing = false;
        reachedRoot = true;
      }

      if (cursor.gotoNextSibling()) {
        retracing = false;
      }
    }
  }

  return documentSymbols;
}

/**
 * Converts node to symbol information.
 *
 * @param tree      Tree-sitter tree.
 * @param queries   MetaModelica language queries.
 * @param children  DocumentSymbol children.
 * @returns         Symbol information from node.
 */
export function nodeToDocumentSymbol(node: Parser.SyntaxNode, queries: MetaModelicaQueries, children: LSP.DocumentSymbol[] ): LSP.DocumentSymbol | null {
  const name = queries.getIdentifier(node);
  if (name === undefined || isEmpty(name)) {
    return null;
  }

  const detail = [];
  if ( node.childForFieldName("encapsulated") ) {
    detail.push("encapsulated");
  }
  if ( node.childForFieldName("partial") ) {
    detail.push("partial");
  }
  detail.push(queries.getClassType(node));

  const kind = getKind(node, queries) || LSP.SymbolKind.Variable;

  const range = TreeSitterUtil.range(node);
  const selectionRange =  TreeSitterUtil.range(queries.identifier.captures(node)[0].node) || range;

  // Walk tree to find next class_definition
  const cursor = node.walk();

  return LSP.DocumentSymbol.create(
    name,
    detail.join(" "),
    kind,
    range,
    selectionRange,
    children
  );
}

/**
 * Returns symbol kind from class definition node.
 *
 * @param node Node containing class_definition
 * @returns Symbol kind or `undefined`.
 */
function getKind(node: Parser.SyntaxNode, queries: MetaModelicaQueries): LSP.SymbolKind | undefined {

  const classType = queries.getClassType(node);
  if (classType === undefined) {
    return undefined;
  }

  switch (classType) {
    case 'class':
    case 'optimization':
    case 'model':
    case 'block':
    case 'connector':
      return LSP.SymbolKind.Class;
    case 'function':
    case 'operator':
      return LSP.SymbolKind.Function;
    case 'package':
    case 'uniontype':
      return LSP.SymbolKind.Package;
    case 'record':
      return LSP.SymbolKind.Struct;
    case 'type':
      return LSP.SymbolKind.TypeParameter;
    default:
      return undefined;
  }
}
