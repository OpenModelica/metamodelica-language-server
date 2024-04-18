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
import * as LSP from 'vscode-languageserver/node';

import { MetaModelicaQueries } from '../../analyzer';
import { initializeParser } from '../../parser';
import { getAllDeclarationsInTree, nodeToDocumentSymbol } from '../declarations';

const metaModelicaTestString = `
//Some comment
encapsulated package A<T>
  package B1
    partial function foo
    end foo;
    record R
    end R;
  end B1;
  package B2
  end B2;
end A;
`;

const expectedSymbols = [
  LSP.DocumentSymbol.create(
    "A",
    "encapsulated package",
    LSP.SymbolKind.Package,
    LSP.Range.create(LSP.Position.create(2,0), LSP.Position.create(11,5)),
    LSP.Range.create(LSP.Position.create(2,21), LSP.Position.create(2,22)),
    [
      LSP.DocumentSymbol.create(
        "B1",
        "package",
        LSP.SymbolKind.Package,
        LSP.Range.create(LSP.Position.create(3,2), LSP.Position.create(8,8)),
        LSP.Range.create(LSP.Position.create(3,10), LSP.Position.create(3,12)),
        [
          LSP.DocumentSymbol.create(
            "foo",
            "partial function",
            LSP.SymbolKind.Function,
            LSP.Range.create(LSP.Position.create(4,4), LSP.Position.create(5,11)),
            LSP.Range.create(LSP.Position.create(4,21), LSP.Position.create(4,24)),
            []
          ),
          LSP.DocumentSymbol.create(
            "R",
            "record",
            LSP.SymbolKind.Struct,
            LSP.Range.create(LSP.Position.create(6,4), LSP.Position.create(7,9)),
            LSP.Range.create(LSP.Position.create(6,11), LSP.Position.create(6,12)),
            []
          ),
        ]
      ),
      LSP.DocumentSymbol.create(
        "B2",
        "package",
        LSP.SymbolKind.Package,
        LSP.Range.create(LSP.Position.create(9,2), LSP.Position.create(10,8)),
        LSP.Range.create(LSP.Position.create(9,10), LSP.Position.create(9,12)),
        []
      ),
    ]
  )
];

const expectedTypes = [LSP.SymbolKind.Class, LSP.SymbolKind.Function, LSP.SymbolKind.TypeParameter];

describe('nodeToDocumentSymbol', () => {
  it('type to TypeParameter', async () => {
  const parser = await initializeParser();
  const tree = parser.parse("type Temperature = Real(unit = \"K \");");
  const queries = new MetaModelicaQueries(parser.getLanguage());
  const symbol = nodeToDocumentSymbol(tree.rootNode.childForFieldName("classDefinitionList")!, queries, []);

  assert.equal(symbol?.name, 'Temperature');
  assert.equal(symbol?.kind, LSP.SymbolKind.TypeParameter);
  });
});

describe('getAllDeclarationsInTree', () => {
  it('Definitions and types', async () => {
    const parser = await initializeParser();
    const tree = parser.parse(metaModelicaTestString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const symbols = getAllDeclarationsInTree(tree, queries);

    console.log(symbols![0].children![0].children![1].range);
    console.log(symbols![0].children![0].children![1].selectionRange);

    assert.deepEqual(symbols, expectedSymbols);
  });
});
