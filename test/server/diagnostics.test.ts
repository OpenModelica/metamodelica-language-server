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

const unusedMatchArgString = `
function foo
  input Integer a;
  input Integer b;
  input Integer fns;
  output Boolean res;
algorithm
  res := match (a, b, fns)
    case (1, 2, _) then true;
    case (_, _, _) then false;
  end match;
end foo;
`;

const usedMatchArgString = `
function foo
  input Integer a;
  input Integer b;
  output Boolean res;
algorithm
  res := match (a, b)
    case (1, 2) then true;
    case (_, _) then false;
  end match;
end foo;
`;

const complexArgMatchString = `
function foo
  input Integer a;
  output Boolean res;
algorithm
  res := match (someFunc(a), a)
    case (_, 1) then true;
    case (_, _) then false;
  end match;
end foo;
`;

suite('getAllDeclarationsInTree', () => {
  test('Definitions and types', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(metaModelicaTestString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    assert.deepEqual(diagnostics, expectedDiagnostics);
  });

  test('Detects unused match argument', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(unusedMatchArgString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    const unused = diagnostics.filter(d => d.message.startsWith('Unused match argument'));
    assert.strictEqual(unused.length, 1, 'Exactly one unused argument expected');

    const d = unused[0] as LSP.Diagnostic & { data: { unusedArgFix: { argName: string; edits: LSP.TextEdit[] } } };
    assert.strictEqual(d.message, "Unused match argument 'fns': pattern is '_' in every case.");
    assert.deepEqual(d.range, { start: { line: 7, character: 22 }, end: { line: 7, character: 25 } });
    assert.strictEqual(d.severity, LSP.DiagnosticSeverity.Information);
    assert.strictEqual(d.source, 'MetaModelica-language-server');

    // Fix data: one edit for the input tuple and one per case branch
    assert.strictEqual(d.data.unusedArgFix.argName, 'fns');
    assert.strictEqual(d.data.unusedArgFix.edits.length, 3, 'Expect 1 input-tuple edit + 2 case-pattern edits');
    assert.strictEqual(d.data.unusedArgFix.edits[0].newText, '(a, b)', 'Input tuple without fns');
    assert.strictEqual(d.data.unusedArgFix.edits[1].newText, '(1, 2)', 'First case pattern without wildcard');
    assert.strictEqual(d.data.unusedArgFix.edits[2].newText, '(_, _)', 'Second case pattern without wildcard');
  });

  test('Does not report when all match arguments are used', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(usedMatchArgString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    const unused = diagnostics.filter(d => d.message.startsWith('Unused match argument'));
    assert.strictEqual(unused.length, 0);
  });

  test('Does not flag function-call arguments (only plain identifiers)', async () => {
    const parser = await initializeMetaModelicaParser();
    const tree = parser.parse(complexArgMatchString);
    const queries = new MetaModelicaQueries(parser.getLanguage());
    const diagnostics = getDiagnosticsFromTree(tree, queries);

    const unused = diagnostics.filter(d => d.message.startsWith('Unused match argument'));
    assert.strictEqual(unused.length, 0, 'Function-call argument must not be flagged');
  });
});
