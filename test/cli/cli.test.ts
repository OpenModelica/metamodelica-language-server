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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { processFiles, ALL_CHECKS } from '../../src/cli/cli';

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

const unusedProtectedVarSource = `function addOne
  input Integer x;
  output Integer y;
protected
  Integer unused;
  Integer tmp;
algorithm
  tmp := x + 1;
  y := tmp;
end addOne;
`;

const unusedProtectedVarFixed = `function addOne
  input Integer x;
  output Integer y;
protected
  Integer tmp;
algorithm
  tmp := x + 1;
  y := tmp;
end addOne;
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

  test('detects unused protected variable (report mode)', async () => {
    const filePath = path.join(tmpDir, 'unused_var.mo');
    fs.writeFileSync(filePath, unusedProtectedVarSource);

    const result = await processFiles([filePath], false);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFound, 1);
    assert.strictEqual(result.issuesFixed, 0);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), unusedProtectedVarSource);
  });

  test('fixes unused protected variable in-place (fix mode)', async () => {
    const filePath = path.join(tmpDir, 'unused_var.mo');
    fs.writeFileSync(filePath, unusedProtectedVarSource);

    const result = await processFiles([filePath], true);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), unusedProtectedVarFixed);
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

  // ── --check filter ─────────────────────────────────────────────────────

  // A file that has both kinds of issue: one unused match arg and one unused protected var.
  const bothIssuesSource = `function foo
  input Integer a;
  input Integer unused_arg;
  output Integer res;
protected
  Integer unused_var;
algorithm
  res := match (a, unused_arg)
    case (1, _) then 1;
    case (_, _) then 0;
  end match;
end foo;
`;

  test('--check unused-var reports only unused variables', async () => {
    const filePath = path.join(tmpDir, 'both.mo');
    fs.writeFileSync(filePath, bothIssuesSource);

    const result = await processFiles([filePath], false, new Set(['unused-var']));

    assert.strictEqual(result.issuesFound, 1, 'Only the unused-var issue should be reported');
  });

  test('--check unused-match-arg reports only unused match arguments', async () => {
    const filePath = path.join(tmpDir, 'both.mo');
    fs.writeFileSync(filePath, bothIssuesSource);

    const result = await processFiles([filePath], false, new Set(['unused-match-arg']));

    assert.strictEqual(result.issuesFound, 1, 'Only the unused-match-arg issue should be reported');
  });

  test('all checks active by default (reports both issue types)', async () => {
    const filePath = path.join(tmpDir, 'both.mo');
    fs.writeFileSync(filePath, bothIssuesSource);

    const result = await processFiles([filePath], false, new Set(ALL_CHECKS));

    assert.strictEqual(result.issuesFound, 2, 'Both issue types should be reported');
  });

  test('--check unused-var fix mode leaves match-arg issues untouched', async () => {
    const filePath = path.join(tmpDir, 'both.mo');
    fs.writeFileSync(filePath, bothIssuesSource);

    const result = await processFiles([filePath], true, new Set(['unused-var']));

    assert.strictEqual(result.issuesFixed, 1);
    // The unused match-arg issue must still be present after the fix.
    const remaining = await processFiles([filePath], false, new Set(['unused-match-arg']));
    assert.strictEqual(remaining.issuesFound, 1, 'Unused match arg should remain unfixed');
  });

  // ── unused-silenced-output ─────────────────────────────────────────────────

  const silencedOutputSource = `function binTreeintersection1
  input Integer key;
  output Integer result;
algorithm
  _ := someFunc(key);
  result := key + 1;
end binTreeintersection1;
`;

  const silencedOutputFixed = `function binTreeintersection1
  input Integer key;
  output Integer result;
algorithm
  someFunc(key);
  result := key + 1;
end binTreeintersection1;
`;

  test('detects silenced output (report mode)', async () => {
    const filePath = path.join(tmpDir, 'silenced.mo');
    fs.writeFileSync(filePath, silencedOutputSource);

    const result = await processFiles([filePath], false);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFound, 1);
    assert.strictEqual(result.issuesFixed, 0);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), silencedOutputSource);
  });

  test('fixes silenced output in-place (fix mode)', async () => {
    const filePath = path.join(tmpDir, 'silenced.mo');
    fs.writeFileSync(filePath, silencedOutputSource);

    const result = await processFiles([filePath], true);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), silencedOutputFixed);
  });

  test('--check unused-silenced-output reports only silenced outputs', async () => {
    const filePath = path.join(tmpDir, 'silenced.mo');
    fs.writeFileSync(filePath, silencedOutputSource);

    const result = await processFiles([filePath], false, new Set(['unused-silenced-output']));

    assert.strictEqual(result.issuesFound, 1, 'Only the silenced-output issue should be reported');
  });

  test('--check unused-var does not report silenced outputs', async () => {
    const filePath = path.join(tmpDir, 'silenced.mo');
    fs.writeFileSync(filePath, silencedOutputSource);

    const result = await processFiles([filePath], false, new Set(['unused-var']));

    assert.strictEqual(result.issuesFound, 0, 'Silenced output should not be reported under unused-var');
  });

  // ── wildcard-match ─────────────────────────────────────────────────────────

  const wildcardMatchSource = `function testMatch
  input Integer x;
algorithm
  _ := match (x)
    case 1 then ();
    else ();
  end match;
end testMatch;
`;

  const wildcardMatchFixed = `function testMatch
  input Integer x;
algorithm
  () := match (x)
    case 1 then ();
    else ();
  end match;
end testMatch;
`;

  test('detects wildcard-match (report mode)', async () => {
    const filePath = path.join(tmpDir, 'wildcard.mo');
    fs.writeFileSync(filePath, wildcardMatchSource);

    const result = await processFiles([filePath], false);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFound, 1);
    assert.strictEqual(result.issuesFixed, 0);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), wildcardMatchSource);
  });

  test('fixes wildcard-match in-place (fix mode)', async () => {
    const filePath = path.join(tmpDir, 'wildcard.mo');
    fs.writeFileSync(filePath, wildcardMatchSource);

    const result = await processFiles([filePath], true);

    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), wildcardMatchFixed);
  });

  test('--check wildcard-match reports only wildcard-match issues', async () => {
    const filePath = path.join(tmpDir, 'wildcard.mo');
    fs.writeFileSync(filePath, wildcardMatchSource);

    const result = await processFiles([filePath], false, new Set(['wildcard-match']));

    assert.strictEqual(result.issuesFound, 1, 'Wildcard-match issue should be reported');
  });

  test('--check unused-silenced-output does not report wildcard-match', async () => {
    const filePath = path.join(tmpDir, 'wildcard.mo');
    fs.writeFileSync(filePath, wildcardMatchSource);

    const result = await processFiles([filePath], false, new Set(['unused-silenced-output']));

    assert.strictEqual(result.issuesFound, 0, 'Wildcard-match should not be reported under unused-silenced-output');
  });
});
