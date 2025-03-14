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

import { BreakpointHandler } from '../../../src/debugger/breakpoints/breakpoints';
import { DebugProtocol } from '@vscode/debugprotocol';
import assert from 'assert';

describe('Breakpoints', () => {
  it('Add a new breakpoint', () => {
    const handler = new BreakpointHandler();
    const source: DebugProtocol.Source = { path: 'test/path' };
    handler.addBreakpoint(1, source, 10);

    const breakpoints = handler.getBreakpoints(source);
    assert.strictEqual(breakpoints.length, 1);
    assert.strictEqual(breakpoints[0].id, 1);
    assert.strictEqual(breakpoints[0].line, 10);
  });

  it('Retrieve breakpoints by source', () => {
    const handler = new BreakpointHandler();
    const source1: DebugProtocol.Source = { path: 'test/path1' };
    const source2: DebugProtocol.Source = { path: 'test/path2' };
    handler.addBreakpoint(1, source1, 10);
    handler.addBreakpoint(2, source2, 20);

    const breakpoints1 = handler.getBreakpoints(source1);
    const breakpoints2 = handler.getBreakpoints(source2);

    assert.strictEqual(breakpoints1.length, 1);
    assert.strictEqual(breakpoints1[0].id, 1);
    assert.strictEqual(breakpoints1[0].line, 10);

    assert.strictEqual(breakpoints2.length, 1);
    assert.strictEqual(breakpoints2[0].id, 2);
    assert.strictEqual(breakpoints2[0].line, 20);
  });

  it('Retrieve breakpoint IDs by file path', () => {
    const handler = new BreakpointHandler();
    const source: DebugProtocol.Source = { path: 'test/path' };
    handler.addBreakpoint(1, source, 10);
    handler.addBreakpoint(2, source, 20);

    const ids = handler.getBreakpointIds('test/path');
    assert.deepStrictEqual(ids, [1, 2]);
  });

  it('Delete breakpoints by IDs', () => {
    const handler = new BreakpointHandler();
    const source: DebugProtocol.Source = { path: 'test/path' };
    handler.addBreakpoint(1, source, 10);
    handler.addBreakpoint(2, source, 20);

    handler.deleteBreakpointsByIds([1]);

    const breakpoints = handler.getBreakpoints(source);
    assert.strictEqual(breakpoints.length, 1);
    assert.strictEqual(breakpoints[0].id, 2);
  });
});
