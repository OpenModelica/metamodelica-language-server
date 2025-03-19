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
import { GDBMIParser } from '../../../src/debugger/parser/gdbParser';
import { setLogLevel } from '../../../src/util/logger';

describe('GDB/MI Parser', () => {
  it('Initialize parser', async () => {
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
  });

  it('Parse -break-insert output', async () => {
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

  it('Parse -exec-run output', async () => {
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
    const gdbmiOutput = gdbMiParser.parse('10^running\n');
    assert.equal(gdbmiOutput.miResultRecord?.token, 10, `Expected token 10 got ${gdbmiOutput.miResultRecord?.token}`);
    assert.equal(gdbmiOutput.miResultRecord?.cls, "running", `Expected result class "running" got ${gdbmiOutput.miResultRecord?.cls}`);
  }).timeout("2s");

  it('Parse stop event output', async () => {
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
});
