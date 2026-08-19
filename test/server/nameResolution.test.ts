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

import { initializeMetaModelicaParser } from '../../src/server/metaModelicaParser';
import { getUnresolvedNames } from '../../src/server/nameResolution';

const BUILTINS: ReadonlySet<string> = new Set([
  'Integer', 'Boolean', 'String', 'list', 'Option',
  'listAppend', 'intString', 'continue', 'NONE', 'SOME',
]);

/** Parse `source` and return the sorted list of unresolved names. */
async function unresolved(source: string): Promise<string[]> {
  const parser = await initializeMetaModelicaParser();
  const tree = parser.parse(source)!;
  return getUnresolvedNames(tree.rootNode, BUILTINS)
    .map(u => u.name)
    .sort();
}

suite('getUnresolvedNames', () => {
  test('flags an unresolved simple local name', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    output Integer y;
  algorithm
    y := undefinedVar;
  end f;
end P;
`);
    assert.deepStrictEqual(names, ['undefinedVar']);
  });

  test('resolves locals, inputs/outputs and builtins', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    input Integer x;
    output Integer y;
  protected
    Integer z;
  algorithm
    z := intString(x);
    y := listAppend(z, x);
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('resolves imported names (simple and composite leading id)', async () => {
    const names = await unresolved(`encapsulated package P
  import Foo;
  import B = Bar.Baz;
  function f
    output Integer y;
  algorithm
    y := Foo.one() + B.two();
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('flags an unimported module used as a composite name', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    output Integer y;
  algorithm
    y := NotImported.frob();
  end f;
end P;
`);
    assert.deepStrictEqual(names, ['NotImported']);
  });

  test('resolves for-indices, match locals and as-bindings', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    input list<Integer> xs;
    output Integer n;
  algorithm
    n := match xs
      local Integer h; list<Integer> t;
      case h :: t as whole then h + listAppend(t, whole);
      else 0;
    end match;
    for i in xs loop
      n := n + i;
    end for;
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('ignores named-argument labels but checks their values', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    output Integer y;
  algorithm
    y := g(label = missingVal);
  end f;
end P;
`);
    // `label` (the formal name) is not a reference; `missingVal` and the
    // unimported function `g` are.
    assert.deepStrictEqual(names, ['g', 'missingVal']);
  });

  test('stays silent outside an encapsulated package', async () => {
    // Without an encapsulated boundary the name could still be found by global
    // lookup, so we cannot be sure it is unresolved.
    const names = await unresolved(`function f
  output Integer y;
algorithm
  y := someUndefinedThing(3);
end f;
`);
    assert.deepStrictEqual(names, []);
  });

  test('stays silent when a class extends another', async () => {
    const names = await unresolved(`encapsulated package P
  extends BaseP;
  function f
    output Integer y;
  algorithm
    y := mysteryName;
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('resolves uniontype record constructors used unqualified', async () => {
    const names = await unresolved(`encapsulated package P
  uniontype T
    record A Integer x; end A;
    record B end B;
  end T;
  function f
    output T y;
  algorithm
    y := A(1);
    y := B();
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('resolves generic type parameters', async () => {
    const names = await unresolved(`encapsulated package P
  function f<ArgT, ResultT>
    input ArgT a;
    output ResultT r;
  algorithm
    r := convert(a);
  end f;
end P;
`);
    // Only the unimported helper `convert` is unresolved; ArgT/ResultT resolve.
    assert.deepStrictEqual(names, ['convert']);
  });

  test('ignores leading-dot global references', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    output Integer y;
  algorithm
    y := .Global.Mod.value();
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });

  test('ignores modifier attribute names', async () => {
    const names = await unresolved(`encapsulated package P
  function f
    input Real x(unit = "m", quantity = "Length");
    output Real y;
  algorithm
    y := x;
  end f;
end P;
`);
    assert.deepStrictEqual(names, []);
  });
});
