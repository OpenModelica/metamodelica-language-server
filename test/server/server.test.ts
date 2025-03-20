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

import * as assert from 'assert';
import { initializeMetaModelicaParser } from '../../src/server/metaModelicaParser';
import { MetaModelicaQueries } from '../../src/server/analyzer';

const metaModelicaTestString = `
model M "Hello World MetaModelica"
  Real x(start=1,fixed=true) "state";
equations
  der(x) = -0.5*x;
end M;
`;
const parsedMetaModelicaTestString = "(stored_definition classDefinition: (class_definition classType: (class_type model: (MODEL)) classSpecifier: (class_specifier identifier: (identifier (IDENT)) comment: (string_comment (STRING)) composition: (composition element: (element componentClause: (component_clause typeSpecifier: (type_specifier (T_REAL)) componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification (LPAR) argument: (argument (element_modification_or_replaceable (element_modification componentReference: (component_reference (IDENT)) modification: (modification (EQUALS) expression: (expression (simple_expression (UNSIGNED_INTEGER))))))) (COMMA) argument: (argument (element_modification_or_replaceable (element_modification componentReference: (component_reference (IDENT)) modification: (modification (EQUALS) expression: (expression (simple_expression (T_TRUE))))))) (RPAR)))) comment: (comment (string_comment (STRING)))))) element: (element componentClause: (component_clause typeSpecifier: (type_specifier namePath: (name_path identifier: (IDENT))) componentDeclaration: (component_declaration declaration: (declaration identifier: (IDENT) modification: (modification classModification: (class_modification (LPAR) argument: (argument (element_modification_or_replaceable (element_modification componentReference: (component_reference (IDENT))))) (RPAR)) (EQUALS) expression: (expression (simple_expression (MINUS) (UNSIGNED_REAL) (STAR) (component_reference__function_call componentReference: (component_reference (IDENT))))))))))) (T_END) endIdentifier: (identifier (IDENT)))))";

suite('MetaModelica tree-sitter parser', () => {
  test('Initialize parser', async () => {
    await initializeMetaModelicaParser();
  });

  test('Parse string', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(metaModelicaTestString);
    const parsedString = tree.rootNode.toString();
    assert.equal(parsedString, parsedMetaModelicaTestString);
  });

  test('Identifier of type class', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse("type Temperature = Real(unit = \"K \");");
    const classNode = tree.rootNode.childForFieldName("classDefinitionList")!;
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const name = queries.getIdentifier(classNode);
    assert.equal(name, 'Temperature');
  });
});
