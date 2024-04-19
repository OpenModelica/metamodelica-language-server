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
import { getDiagnosticsFromTree } from '../diagnostics';

const metaModelicaTestString = `
function foo
  input Boolean inKey;
  output Boolean res;
algorithm
  res := match(inKey)
    local
    case (true) equation
      true := realEq(factor1, factor2);
      true = intEq(i1, j1);
    then true;

    case (false) algorithm
      true := realEq(factor1, factor2);
      true = intEq(i1, j1);
    then false;

    else false;
  end match;
end foo;
`;

const expectedDiagnostics: LSP.Diagnostic[] = [
  {
    message: "Parse error: Algorithms can not contain equations ('='), use assignments (':=') instead.",
    range: {
      end: {
        character: 12,
        line: 14
      },
      start: {
        character: 11,
        line: 14
      }
    },
    severity: 1,
    source: "MetaModelica-language-server"
  },
  {
    message: "Parse error: Equations can not contain assignments (':='), use equations ('=') instead.",
    range: {
      end: {
        character: 13,
        line: 8
      },
      start: {
        character: 11,
        line: 8
      }
    },
    severity: 1,
    source: "MetaModelica-language-server"
  }
];

describe('getAllDeclarationsInTree', () => {
  it('Definitions and types', async () => {
    const parser = await initializeParser();
    const tree = parser.parse(metaModelicaTestString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    assert.deepEqual(diagnostics, expectedDiagnostics);
  });
});
