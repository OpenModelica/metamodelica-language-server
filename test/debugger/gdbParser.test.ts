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
import { GDBMIParser } from '../../src/debugger/parser/gdbParser';
import { setLogLevel } from '../../src/util/logger';

suite('GDB/MI Parser', () => {
  test('Initialize parser', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
  });

  test('Parse -break-insert output', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse('8^done,bkpt={number="1"}\n');
    const breakpointOutput = {
      miOutOfBandRecordList: [],
      miResultRecord: {
        token: 8,
        cls: 'done',
        miResultsList: [
          {
            variable: 'bkpt',
            miValue: {
              value: '',
              miTuple: {
                miResultsList:
                [
                  {
                    variable: 'number',
                    miValue:
                    {
                      value: '1'
                    }
                  }
                ]
              }
            }
          }
        ],
        consoleStreamOutput: '',
        logStreamOutput: ''
      }
    };
    assert.deepEqual(gdbmiOutput, breakpointOutput);
  }).timeout("2s");

  test('Parse -exec-run output', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse('10^running\n');
    assert.equal(gdbmiOutput.miResultRecord?.token, 10, `Expected token 10 got ${gdbmiOutput.miResultRecord?.token}`);
    assert.equal(gdbmiOutput.miResultRecord?.cls, "running", `Expected result class "running" got ${gdbmiOutput.miResultRecord?.cls}`);
  }).timeout("2s");

  test('Parse stop event output', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse('*stopped,reason="exited-normally"\n');
    const asyncOutput = {
      miOutOfBandRecordList:
      [
        {
          miAsyncRecord:
          {
            miExecAsyncOutput:
            {
              miAsyncOutput:
              {
                asyncClass: 'stopped',
                miResult:
                [
                  {
                    variable: 'reason',
                    miValue:
                    {
                      value: 'exited-normally'
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    };
    assert.deepEqual(gdbmiOutput, asyncOutput);
  }).timeout("2s");

  test('Parse -thread-info output', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse(
      '12^done,threads=[' +
      '{id="1",target-id="Thread 20556.0x4ac0",state="stopped"},' +
      '{id="2",target-id="Thread 20556.0x480",state="stopped"},' +
      '{id="3",target-id="Thread 20556.0x296c",state="stopped"}' +
      '],current-thread-id="1"\n'
    );

    assert.strictEqual(gdbmiOutput.miResultRecord?.token, 12, `Expected token 12 but got ${gdbmiOutput.miResultRecord?.token}`);
    assert.strictEqual(gdbmiOutput.miResultRecord?.miResultsList.length, 2, `Expected result list length 2 but got ${gdbmiOutput.miResultRecord?.miResultsList.length}`);

    const threadsResult = gdbmiOutput.miResultRecord?.miResultsList[0];
    assert.strictEqual(threadsResult?.variable, 'threads', `Expected variable "threads" but got ${threadsResult?.variable}`);
    assert.strictEqual(threadsResult?.miValue?.miList?.miValuesList?.length, 3, `Expected 3 threads but got ${threadsResult?.miValue?.miList?.miValuesList?.length}`);

    const firstThread = threadsResult?.miValue?.miList?.miValuesList[0];
    assert.strictEqual(firstThread?.miTuple?.miResultsList[0].variable, 'id', `Expected variable "id" but got ${firstThread?.miTuple?.miResultsList[0].variable}`);

    const currentThreadIdResult = gdbmiOutput.miResultRecord?.miResultsList[1];
    assert.strictEqual(currentThreadIdResult?.variable, 'current-thread-id', `Expected variable "current-thread-id" but got ${currentThreadIdResult?.variable}`);

  }).timeout("2s");

  test('Parse -stack-list-frames output', async () => {
    setLogLevel("warning");
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse(
      '14^done,stack=[' +
      'frame={level="0",addr="0x00007ffeb0b3521c",func="omc_CevalScript_cevalInteractiveFunctions2",' +
      'file="C:/OpenModelica/OMCompiler/Compiler/Script/CevalScript.mo",' +
      'fullname="C:\\OpenModelica\\OMCompiler\\Compiler\\Script\\CevalScript.mo",line="1050",arch="i386:x86-64"},' +
      'frame={level="1",addr="0x00007ffeb0b3f395",func="omc_CevalScript_cevalInteractiveFunctions",' +
      'file="C:/OpenModelica/OMCompiler/Compiler/Script/CevalScript.mo",' +
      'fullname="C:\\OpenModelica\\OMCompiler\\Compiler\\Script\\CevalScript.mo",line="635",arch="i386:x86-64"},' +
      'frame={level="2",addr="0x00007ffeb0de0ebd",func="omc_BackendInterface_cevalInteractiveFunctions",' +
      'file="C:/OpenModelica/OMCompiler/Compiler/FrontEnd/BackendInterface.mo",' +
      'fullname="C:\\OpenModelica\\OMCompiler\\Compiler\\FrontEnd\\BackendInterface.mo",line="57",arch="i386:x86-64"}]\n'
    );

    assert.strictEqual(gdbmiOutput.miResultRecord?.miResultsList.length, 1, `Expected result list length 1 but got ${gdbmiOutput.miResultRecord?.miResultsList.length}`);

    const stackResult = gdbmiOutput.miResultRecord?.miResultsList[0];
    assert.strictEqual(stackResult?.variable, 'stack', `Expected variable "stack" but got ${stackResult?.variable}`);
    assert.strictEqual(stackResult?.miValue?.miList?.miResultsList?.length, 3, `Expected 3 frames but got ${stackResult?.miValue?.miList?.miResultsList?.length}`);

    const firstFrame = stackResult?.miValue?.miList?.miResultsList[0];
    assert.strictEqual(firstFrame?.miValue.miTuple?.miResultsList[2].variable, 'func', `Expected variable "func" but got ${firstFrame?.miValue.miTuple?.miResultsList[2].variable}`);

    const firstFrameFunc = firstFrame?.miValue.miTuple?.miResultsList[2];
    assert.strictEqual(firstFrameFunc?.miValue.value, 'omc_CevalScript_cevalInteractiveFunctions2', `Expected function "omc_CevalScript_cevalInteractiveFunctions2" but got ${firstFrameFunc?.miValue.value}`);
  }).timeout("2s");
});
