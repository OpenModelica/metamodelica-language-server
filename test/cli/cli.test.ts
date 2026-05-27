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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { processFiles } from '../../src/cli/cli';

const unusedArgSource = `function foo
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

// After the fix, `fns` and its wildcard patterns should be removed.
const unusedArgFixed = `function foo
  input Integer a;
  input Integer b;
  input Integer fns;
  output Boolean res;
algorithm
  res := match (a, b)
    case (1, 2) then true;
    case (_, _) then false;
  end match;
end foo;
`;

const noIssueSource = `function bar
  input Integer a;
  output Boolean res;
algorithm
  res := match (a)
    case (1) then true;
    case (_) then false;
  end match;
end bar;
`;

suite('CLI processFiles', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmlsc-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects unused match argument (report mode)', async () => {
    const filePath = path.join(tmpDir, 'unused.mo');
    fs.writeFileSync(filePath, unusedArgSource);

    const result = await processFiles([filePath], false);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFound, 1);
    assert.strictEqual(result.issuesFixed, 0);

    // File must not be modified in report mode.
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), unusedArgSource);
  });

  test('fixes unused match argument in-place (fix mode)', async () => {
    const filePath = path.join(tmpDir, 'unused.mo');
    fs.writeFileSync(filePath, unusedArgSource);

    const result = await processFiles([filePath], true);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFixed, 1);

    const fixed = fs.readFileSync(filePath, 'utf-8');
    assert.strictEqual(fixed, unusedArgFixed);
  });

  test('reports zero issues for a clean file', async () => {
    const filePath = path.join(tmpDir, 'clean.mo');
    fs.writeFileSync(filePath, noIssueSource);

    const result = await processFiles([filePath], false);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFound, 0);
  });

  test('scans directory recursively for .mo files', async () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, 'a.mo'), unusedArgSource);
    fs.writeFileSync(path.join(subDir, 'b.mo'), unusedArgSource);
    // A non-.mo file should be ignored.
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not modelica');

    const result = await processFiles([tmpDir], false);

    assert.strictEqual(result.filesProcessed, 2);
    assert.strictEqual(result.issuesFound, 2);
  });

  test('fixes multiple files in a directory (fix mode)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.mo'), unusedArgSource);
    fs.writeFileSync(path.join(tmpDir, 'b.mo'), unusedArgSource);

    const result = await processFiles([tmpDir], true);

    assert.strictEqual(result.filesProcessed, 2);
    assert.strictEqual(result.issuesFixed, 2);

    for (const name of ['a.mo', 'b.mo']) {
      const content = fs.readFileSync(path.join(tmpDir, name), 'utf-8');
      assert.strictEqual(content, unusedArgFixed);
    }
  });
});
