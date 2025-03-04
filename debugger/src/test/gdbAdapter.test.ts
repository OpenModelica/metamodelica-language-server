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

import assert from 'assert';
import { exec } from 'child_process';
import * as process from 'process';

import { GDBAdapter, GDBCommandFlag } from '../gdb/gdbAdapter';
import * as CommandFactory from '../gdb/commandFactory';
import { setLogLevel } from '../util/logger';

async function which(programName: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(`which ${programName}`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Error occurred: ${error.message}`));
        return;
      }
      if (stderr) {
        reject(new Error(`Error: ${stderr}`));
        return;
      }
      const programPath = stdout.trim();
      if (programPath) {
        resolve(programPath);
      } else {
        reject(new Error(`${programName} is not found.`));
      }
    });
  });
}

async function getOMCAndGDB(): Promise<[string, string]> {
  const isWindows = process.platform === "win32";
  let omcExecutable: string, gdbExecutable: string;
  if (isWindows) {
    omcExecutable = process.env.OPENMODELICAHOME + "\\bin\\omc.exe";
    gdbExecutable = process.env.OMDEV + "\\tools\\msys\\ucrt64\\bin\\gdb.exe";
  } else {
    omcExecutable = await which('omc');
    gdbExecutable = await which('gdb');
  }
  return [omcExecutable, gdbExecutable];
}

describe('GDBAdapter', () => {
  let adapter: GDBAdapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.quit();
    }
  });

  it('Start and stop GDBAdapter with omc', async () => {
    setLogLevel('warning');

    adapter = new GDBAdapter();
    const [omcExecutable, gdbExecutable] = await getOMCAndGDB();
    await adapter.launch(omcExecutable, __dirname, [], gdbExecutable);
    assert(adapter.isGDBRunning(), "Assert GDB is running.");
    await adapter.quit();
    assert(!adapter.isGDBRunning(), "Assert GDB is not running any more.");
  }).timeout("10s");

  it('Run gdb omc with "r --version"', async () => {
    setLogLevel('warning');
    adapter = new GDBAdapter();
    const [omcExecutable, gdbExecutable] = await getOMCAndGDB();
    await adapter.launch(omcExecutable, __dirname, [], gdbExecutable);
    assert(adapter.isGDBRunning(), "Assert GDB is running.");

    const flags = GDBCommandFlag.noFlags;
    await adapter.sendCommand(CommandFactory.gdbSet("args --version"), flags);
    const response = await adapter.sendCommand(CommandFactory.execRun(), flags);
    // Check version string is in response and gdb did exit normally.
    assert.match(response, /v[0-9]+.[0-9]+.[0-9](?:-dev)/);
    assert.ok(response.includes('stopped,reason="exited-normally"'));

    await adapter.quit();
    assert(!adapter.isGDBRunning(), "Assert GDB is not running any more.");
  }).timeout("10s");
});
