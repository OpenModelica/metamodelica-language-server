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

import { MetaModelicaQueries } from '../../src/server/analyzer';
import { initializeMetaModelicaParser } from '../../src/server/metaModelicaParser';
import { getDiagnosticsFromTree } from '../../src/server/diagnostics';

const metaModelicaTestString = `
function foo
  input Boolean inKey;
  output Boolean res1;
  output Boolean res2;
algorithm
  res1 := match (inKey)
    local
    case (true) equation
      true := realEq(factor1, factor2);
      true = intEq(i1, j1);
    then true;

    case (_) algorithm
      true := realEq(factor1, factor2);
      true = intEq(i1, j1);
    then false;
  end match;

  res2 := matchcontinue(inKey)
    case (true) equation
    then true;
    else false;
  end matchcontinue;
end bar;
`;

const expectedDiagnostics: LSP.Diagnostic[] = [
  {
    message: "Parse error: Algorithms can not contain equations ('='), use assignments (':=') instead.",
    range: {
      end: {
        character: 12,
        line: 15
      },
      start: {
        character: 11,
        line: 15
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
        line: 9
      },
      start: {
        character: 11,
        line: 9
      }
    },
    severity: 1,
    source: "MetaModelica-language-server"
  },
  {
    message: "Missing else case.",
    range: {
      end: {
        character: 15,
        line: 6
      },
      start: {
        character: 10,
        line: 6
      }
    },
    severity: 3,
    source: "MetaModelica-language-server"
  },
  {
    message: "Use 'algorithm' instead of 'equation' inside match cases.",
    range: {
      end: {
        character: 24,
        line: 8
      },
      start: {
        character: 16,
        line: 8
      }
    },
    severity: 3,
    source: "MetaModelica-language-server"
  },
  {
    message: "Use 'algorithm' instead of 'equation' inside match cases.",
    range: {
      end: {
        character: 24,
        line: 20
      },
      start: {
        character: 16,
        line: 20
      }
    },
    severity: 3,
    source: "MetaModelica-language-server"
  },
  {
    message: "'matchcontinue' is inefficient, use 'match' and 'try-catch' instead.",
    range: {
      end: {
        character: 23,
        line: 19
      },
      start: {
        character: 10,
        line: 19
      }
    },
    severity: 3,
    source: "MetaModelica-language-server"
  },
  {
    message: "Parse error: Start and end identifier don't match.\nReplace 'bar' with 'foo'.",
    range: {
      end: {
        character: 7,
        line: 24
      },
      start: {
        character: 4,
        line: 24
      }
    },
    severity: 1,
    source: "MetaModelica-language-server"
  }
];

suite('getAllDeclarationsInTree', () => {
  test('Definitions and types', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(metaModelicaTestString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    assert.deepEqual(diagnostics, expectedDiagnostics);
  });
});
