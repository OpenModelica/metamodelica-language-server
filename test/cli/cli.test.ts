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
    case (3, 4, _) then false;
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
    case (3, 4) then false;
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
  res := match a
    case 1 then true;
    case _ then false;
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

  test('fixes 2-element match tuple without producing invalid syntax', async () => {
    // Regression: when removing one of two match arguments the parens used to
    // be dropped, producing `matchinDefs` instead of `match (inDefs)`.
    const src = `function foo
  input Integer a;
  input Integer b;
  output Integer res;
algorithm
  res := match (a, b)
    case (_, 1) then 1;
    case (_, _) then 0;
  end match;
end foo;
`;
    const expected = `function foo
  input Integer a;
  input Integer b;
  output Integer res;
algorithm
  res := match (b)
    case (1) then 1;
    case (_) then 0;
  end match;
end foo;
`;
    const filePath = path.join(tmpDir, 'two_arg.mo');
    fs.writeFileSync(filePath, src);

    // Limit to the match-arg check so the redundant-parens fix doesn't
    // cascade onto the resulting single-element tuple — this test is
    // specifically about not producing `matchinDefs`.
    const result = await processFiles([filePath], true, new Set(['unused-match-arg']));

    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected);
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
    case (2, _) then 0;
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

  // ── redundant-parens check ─────────────────────────────────────────────

  test('removes redundant parens in match input, case pattern, and assignment LHS', async () => {
    const src = `function foo
  input Integer x;
  output Integer y;
algorithm
  (y) := match (x)
    case (1) then 1;
    case (_) then 0;
  end match;
end foo;
`;
    const expected = `function foo
  input Integer x;
  output Integer y;
algorithm
  y := match x
    case 1 then 1;
    case _ then 0;
  end match;
end foo;
`;
    const filePath = path.join(tmpDir, 'parens.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['redundant-parens']));

    assert.strictEqual(result.issuesFixed, 4);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected);
  });

  test('redundant-parens fix inserts a space when keyword has no whitespace', async () => {
    // The keyword `match` is glued to the LPAR; dropping the parens must
    // keep `match` and `x` separated.
    const src = `function foo
  input Integer x;
  output Integer y;
algorithm
  y := match(x)
    case 1 then 1;
    case _ then 0;
  end match;
end foo;
`;
    const filePath = path.join(tmpDir, 'parens_nospace.mo');
    fs.writeFileSync(filePath, src);

    await processFiles([filePath], true, new Set(['redundant-parens']));

    const out = fs.readFileSync(filePath, 'utf-8');
    assert.ok(out.includes('match x'), `expected 'match x' in output, got:\n${out}`);
    assert.ok(!out.includes('matchx'), `should not produce 'matchx', got:\n${out}`);
  });

  // ── wildcard-tuple check ───────────────────────────────────────────────

  test('collapses nested all-wildcard tuple but leaves top-level case pattern alone', async () => {
    // The inner `(_, _)` is nested inside an outer tuple pattern, so it
    // should collapse to `_`. The outer `(_, _)` *is* a top-level case
    // pattern — that one must be left alone (the unused-match-arg check
    // handles top-level redundancy).
    const src = `function foo
  input Integer a;
  input Pair b;
  output Integer r;
algorithm
  r := match (a, b)
    case (1, _) then 1;
    case (_, PAIR((_, _), x)) then x;
    case (_, _) then 0;
  end match;
end foo;
`;
    const filePath = path.join(tmpDir, 'wild_tuple.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['wildcard-tuple']));

    assert.strictEqual(result.issuesFixed, 1, 'only the inner tuple should be collapsed');
    const out = fs.readFileSync(filePath, 'utf-8');
    assert.ok(out.includes('PAIR(_, x)'), `inner (_, _) should become _, got:\n${out}`);
    assert.ok(out.includes('case (_, _) then 0'), 'top-level (_, _) must be untouched');
  });

  test('redundant-parens does not strip parens that wrap only part of a cons', async () => {
    // Regression: `((r as X())::rest)` was being rewritten to `r as X()`,
    // dropping `::rest` — because the inner `(r as X())` was matched as a
    // single-element parens even though the parens only wrap the head of
    // the cons, not the whole simple_expression. The outer parens *are*
    // safe to remove, but the inner ones must be left alone.
    const src = `function f
  input list<R> xs;
  output Integer n;
algorithm
  n := match xs
    case ((r as BACKEND_RULE())::rest) then 1;
    case _ then 0;
  end match;
end f;
`;
    const filePath = path.join(tmpDir, 'cons_as.mo');
    fs.writeFileSync(filePath, src);

    await processFiles([filePath], true, new Set(['redundant-parens']));

    const out = fs.readFileSync(filePath, 'utf-8');
    assert.ok(
      out.includes('(r as BACKEND_RULE())::rest'),
      `inner cons must survive intact, got:\n${out}`,
    );
  });

  test('does not collapse `(_::rest, _)` — first element is not a wildcard', async () => {
    // Regression: `_::rest` is a cons pattern, not a wildcard. The whole
    // tuple is not all-wildcard and must not be replaced.
    const src = `function foo
  input list<Integer> xs;
  input Integer y;
  output Integer r;
algorithm
  r := match (xs, y)
    case (_::rest, _) then listLength(rest);
    case (_, _) then 0;
  end match;
end foo;
`;
    const filePath = path.join(tmpDir, 'cons.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['wildcard-tuple']));

    assert.strictEqual(result.issuesFixed, 0);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), src);
  });

  test('unused-var fix does not nuke sibling declarations sharing a line', async () => {
    // Regression: `Absyn.Exp e; Integer i;` are two separate `element`
    // nodes on the same source line. Previously the whole line was
    // removed when `e` was unused, taking `Integer i` with it — even
    // though `i` is referenced from the match case pattern.
    const src = `function foo
  input Absyn.Exp inExp;
  output Integer outI;
algorithm
  outI := matchcontinue inExp
    local
      Absyn.ComponentRef cr;
      Absyn.Exp e; Integer i;
    case Absyn.CREF(cr) then 0;
    case Absyn.INTEGER(i) then i;
  end matchcontinue;
end foo;
`;
    const filePath = path.join(tmpDir, 'unused_sibling.mo');
    fs.writeFileSync(filePath, src);

    await processFiles([filePath], true, new Set(['unused-var']));

    const out = fs.readFileSync(filePath, 'utf-8');
    assert.ok(out.includes('Integer i;'), `Integer i must survive, got:\n${out}`);
    assert.ok(!out.includes('Absyn.Exp e'), `Absyn.Exp e must be removed, got:\n${out}`);
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
  _ := match x
    case 1 then ();
    else ();
  end match;
end testMatch;
`;

  const wildcardMatchFixed = `function testMatch
  input Integer x;
algorithm
  () := match x
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

  // ── dead-silenced-assign ──────────────────────────────────────────────

  test('removes whole `_ := variable;` instead of stripping the LHS', async () => {
    // Regression: stripping `_ :=` from `_ := eqIdx1;` left `eqIdx1;`,
    // which isn't a valid MetaModelica statement. The whole statement must
    // be dropped because a bare value reference has no observable effect.
    const src = `function foo
  input Integer eqIdx1;
  input Integer eqIdx2;
  output Integer eqIdxDel;
algorithm
  if intLe(1, 2) then eqIdxDel := eqIdx2; _ := eqIdx1; else eqIdxDel := eqIdx1; _ := eqIdx2; end if;
end foo;
`;
    const expected = `function foo
  input Integer eqIdx1;
  input Integer eqIdx2;
  output Integer eqIdxDel;
algorithm
  if intLe(1, 2) then eqIdxDel := eqIdx2; else eqIdxDel := eqIdx1; end if;
end foo;
`;
    const filePath = path.join(tmpDir, 'dead_silenced.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['dead-silenced-assign']));

    assert.strictEqual(result.issuesFixed, 2);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected);
  });

  test('still strips `_ :=` when RHS is a function call', async () => {
    // Function calls have observable effects, so dropping just `_ :=` is
    // safe — verify the silenced-output path didn't regress when the
    // dead-silenced-assign route was added.
    const src = `function foo
  input Integer x;
algorithm
  _ := sideEffect(x);
end foo;
`;
    const expected = `function foo
  input Integer x;
algorithm
  sideEffect(x);
end foo;
`;
    const filePath = path.join(tmpDir, 'silenced_call.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['unused-silenced-output']));

    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected);
  });

  test('removes sole element of single-line `protected Real x;` section', async () => {
    // Regression: when `protected` and the element share a source line the
    // section-header edit and the element edit overlapped on the space
    // between them, crashing TextDocument.applyEdits with "Overlapping
    // edit". The two edits must be merged into one in that layout.
    const src = `function foo
  input Real x;
  output Real y;
protected Real eachPrefix;
algorithm
  y := x;
end foo;
`;
    const expected = `function foo
  input Real x;
  output Real y;
algorithm
  y := x;
end foo;
`;
    const filePath = path.join(tmpDir, 'sameline_proto.mo');
    fs.writeFileSync(filePath, src);

    const result = await processFiles([filePath], true, new Set(['unused-var']));

    assert.strictEqual(result.issuesFixed, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), expected);
  });
});
