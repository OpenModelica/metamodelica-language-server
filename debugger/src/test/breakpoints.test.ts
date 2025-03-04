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

import path from 'path';
import assert from 'assert';

import { BreakpointHandler } from '../breakpoints/breakpoints';
import { DebugProtocol } from '@vscode/debugprotocol';

const openModelicaRootDir = path.join(__dirname, 'data');
const metaModelicaFile = path.join(__dirname, 'data/OMCompiler/Compiler/Main/Main.mo');
const cFile = path.join(__dirname, 'data/build_cmake/OMCompiler/Compiler/c_files/Main.c');

describe('Breakpoints', () => {
  it('BreakpointHandler', async () => {
    const handler = new BreakpointHandler(openModelicaRootDir);

    await handler.addFile(metaModelicaFile);
    const files = handler.getMetaModelicaFiles();
    assert.deepStrictEqual(files, [metaModelicaFile]);
    const correspondingCFile = handler.getCorrespondingCFile(metaModelicaFile);
    assert.equal(cFile, correspondingCFile?.path);
  });

  it('Add Breakpoint', async () => {
    const handler = new BreakpointHandler(openModelicaRootDir);

    const metaModelicaBreakPoint = {
      verified: false,
      source: {
        name: "Main.mo",
        path: metaModelicaFile,
      } as DebugProtocol.Source,
      line: 713,
      column: 1,
      endLine: 743,
      endColumn: 9
    } as DebugProtocol.Breakpoint;
    const cBreakpoint = await handler.addSourceBreakpoint(metaModelicaBreakPoint);
    assert.equal(cBreakpoint[0].line, 880);
  });
});
