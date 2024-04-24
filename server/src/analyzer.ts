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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to MetaModelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/analyser.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import Parser from 'web-tree-sitter';

import { getAllDeclarationsInTree } from './util/declarations';
import { getDiagnosticsFromTree } from './util/diagnostics';
import { logger } from './util/logger';

type AnalyzedDocument = {
  document: TextDocument,
  declarations: LSP.DocumentSymbol[],
  tree: Parser.Tree
};

export class MetaModelicaQueries {
  public identifier: Parser.Query;
  public classType: Parser.Query;
  public error: Parser.Query;
  public illegalEquals: Parser.Query;
  public illegalAssign: Parser.Query;
  public modifierAssign: Parser.Query;
  public caseEquation: Parser.Query;
  public missingElseCaseMatch: Parser.Query;
  public matchcontinue: Parser.Query;
  public startEndIdent: Parser.Query;

  constructor(language: Parser.Language) {
    this.identifier = language.query('(IDENT) @identifier');
    this.classType = language.query('(class_type) @type');
    this.error = language.query('(ERROR) @error');
    this.illegalEquals = language.query('(assign_clause_a (simple_expression) (EQUALS) @error )');
    this.illegalAssign = language.query('[ ( equation (simple_expression) (ASSIGN) @error ) ( constraint (simple_expression) (ASSIGN) @error ) ]');
    this.modifierAssign = language.query('(modification (ASSIGN) @warning)');
    this.caseEquation = language.query('(onecase (EQUATION) @info)');
    this.missingElseCaseMatch = language.query('(match_expression [(MATCH) (MATCHCONTINUE)] @info (cases case: (onecase)* case: (onecase) . ))');
    this.matchcontinue = language.query('(match_expression . (MATCHCONTINUE) @info (expression) )');
    this.startEndIdent = language.query('(class_specifier identifier: (identifier) @start endIdentifier: (identifier) @end )');
  }

  /**
   * Get identifier from node.
   *
   * @param node Node.
   * @returns Identifier
   */
  public getIdentifier(node: Parser.SyntaxNode): string | undefined {
    const captures = this.identifier.captures(node);
    if (captures.length > 0) {
      return captures[0].node.text;
    } else {
      return undefined;
    }
  }

  /**
   * Get class type from class_definition node.
   *
   * @param node Node.
   * @returns Class type
   */
  public getClassType(node: Parser.SyntaxNode): string | undefined {
    const captures = this.classType.captures(node);
    if (captures.length > 0) {
      return captures[0].node.text;
    } else {
      return undefined;
    }
  }
}

export default class Analyzer {
  private parser: Parser;
  private uriToAnalyzedDocument: Record<string, AnalyzedDocument | undefined> = {};
  private queries: MetaModelicaQueries;

  constructor (parser: Parser) {
    this.parser = parser;
    this.queries = new MetaModelicaQueries(parser.getLanguage());
  }

  public analyze(document: TextDocument): LSP.Diagnostic[] {
    logger.debug('analyze:');

    const fileContent = document.getText();
    const uri = document.uri;

    const tree = this.parser.parse(fileContent);
    logger.debug(tree.rootNode.toString());

    // Get declarations
    const declarations = getAllDeclarationsInTree(tree, this.queries);

    // Get diagnostics
    const diagnostics: LSP.Diagnostic[] = getDiagnosticsFromTree(tree, this.queries);

    // Update saved analysis for document uri
    this.uriToAnalyzedDocument[uri] = {
      document,
      declarations,
      tree
    };

    return diagnostics;
  }

  /**
   * Get all symbol declarations in the given file. This is used for generating an outline.
   *
   */
  public getDeclarationsForUri(uri: string): LSP.DocumentSymbol[] {
    const tree = this.uriToAnalyzedDocument[uri]?.tree;

    if (!tree?.rootNode) {
      return [];
    }

    return getAllDeclarationsInTree(tree, this.queries,);
  }
}
