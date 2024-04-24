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

import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';

import { logger } from '../util/logger';

export enum GDBCommandFlag {
  noFlags             = 0,
  consoleCommand      = 1 << 0,  // This is a command that needs to be wrapped into -interpreter-exec console
  nonCriticalResponse = 1 << 1,
  silentCommand       = 1 << 2,  // Ignore the error of this command
  blockUntilResponse  = 1 << 3   // Blocks until the command has received the answer
}

class GDBMICommand {
  mFlags: GDBCommandFlag;
  mCommand: string;
  mCompleted: boolean = false;

  constructor(flags: GDBCommandFlag, command: string) {
    this.mFlags = flags;
    this.mCommand = command;

    if ( (flags & GDBCommandFlag.consoleCommand) === GDBCommandFlag.consoleCommand ) {
      this.mCommand = `-interpreter-exec console "${this.mCommand}"`;
    }
  }
}

export class GDBAdapter {
  private mpGDBProcess: ChildProcess | null = null;
  private mGDBProgram: string = '';
  private mGDBArguments: string[] = [];
  //private mInferiorArguments: string[] = [];
  private gdbKilled: boolean = true;
  private gdbStarted: boolean = false;
  private acceptingCommand: boolean = false;

  private token: number = 0;
  private mGDBMICommandsHash: { [token: number]: GDBMICommand } = {};

  /**
   * Launch GDB child process with default arguments.
   *
   * @param program           The program to debug with GDB.
   * @param workingDirectory  Working directory for GDB.
   * @param _programArgs       Program arguments
   * @param gdbPath           Path to GDB executable.
   */
  public launch(
    program: string,
    workingDirectory: string,
    _programArgs: string[],
    gdbPath: string): Promise<void>
  {
    // Check if the program to debug exists
    if (!existsSync(program)) {
      throw new Error(`GDB: The executable to debug does not exist: ${program}`);
    }

    /* launch gdb with the default arguments
    * -q  quiet mode. Don't print welcome messages
    * -nw don't use window interface
    * -i  select interface
    * mi  machine interface
    */
    this.mGDBProgram = gdbPath;
    this.mGDBArguments = ['-q', '-nw', '-i', 'mi', '--args', program];

    return new Promise<void>((resolve, reject) => {
      this.mpGDBProcess = spawn(this.mGDBProgram, this.mGDBArguments, {
        cwd: workingDirectory
      });
      if (!this.mpGDBProcess) {
        throw new Error("GDB: Failed to spawn gdb process.");
      }
      //this.mInferiorArguments = _programArgs;
      this.gdbKilled = false;

      this.mpGDBProcess.on('error', (err) => {
        logger.error('GDB: Error occurred in process:', err);
      });

      this.mpGDBProcess.stdout!.on('data', (data) => {
        const stringData = data.toString();
        logger.debug(stringData);
        // Check if the response is complete
        if (stringData.trim().endsWith('(gdb)')) {
          logger.info('GDB: Finished startup.');
          this.acceptingCommand = true;
          this.gdbStarted = true;
          // Remove the 'data' event listeners once the 'launch' promise is resolved
          this.mpGDBProcess!.stdout!.removeAllListeners('data');
          resolve();
        }
      });

      this.mpGDBProcess.stderr!.on('data', (data) => {
        reject(new Error(`Error from GDB: ${data.toString()}`));
      });

      this.mpGDBProcess.once('spawn', () => {
        logger.info('GDB: Process started.');
        this.gdbStarted = true;
      });

      this.mpGDBProcess.once('exit', (code, signal) => {
        logger.info(`GDB: Process exited with code ${code} and signal ${signal}`);
        this.gdbStarted = false;
        this.gdbKilled = true;
      });
    });
  }

  /**
   * Kill GDB process.
   */
  public kill(): Promise<void> {

    return new Promise<void>((resolve, reject) => {
      if (!this.mpGDBProcess || this.gdbKilled) {
        reject(new Error('GDB process is not running.'));
        return;
      }

      // Resolve the promise when the process exits
      this.mpGDBProcess.once('exit', () => {
        this.gdbKilled = true;
        this.gdbStarted = false;
        resolve();
      });

      // Kill the process
      this.mpGDBProcess.kill();
    });
  }

  public isGDBRunning(): boolean {
    return this.gdbStarted && this.acceptingCommand;
  }

  /**
   * Send command to GDB.
   *
   * Resolves when response ends with "(gdb)".
   *
   * @param command   GDB command.
   * @param flags     Command flags.
   * @returns         Promise response data as string.
   */
  public sendCommand(
    command: string,
    flags: GDBCommandFlag): Promise<string>
  {
    return new Promise<string>((resolve, reject) => {
      if ( !this.isGDBRunning() || !this.mpGDBProcess ) {
        reject(new Error(`GDB: Not running.`));
        return;
      }

      this.token += 1;
      const cmd = new GDBMICommand(flags, command);

      //cmd.mCommand = `${this.token}${cmd.mCommand}`;
      this.mGDBMICommandsHash[this.token] = cmd;

      // Log command
      logger.info(`GDB: Run command "${cmd.mCommand}"`);
      // TODO: Add logger
      //this.writeDebuggerCommandLog(cmd.mCommand);

      // Resolve when GDB sends "(gdb)" and is ready to accept commands.
      let responseData = '';
      let counter = 0;
      this.mpGDBProcess.stdout!.on('data', (data) => {
        const stringData = data.toString();
        responseData += stringData;
        logger.debug(stringData);
        // Check if the response is complete
        if (stringData.trim().endsWith('(gdb)')) {
          counter++;
        }
        // For whatever reason there are two (gdb) when running a command.
        if (counter >= 2) {
          // Remove the 'data' event listeners once the 'launch' promise is resolved
          logger.info(`GDB: Finished command "${cmd.mCommand}"`);
          this.mpGDBProcess!.stdout!.removeAllListeners('data');
          resolve(responseData);
        }
      });

      this.mpGDBProcess.stdin!.write(`${cmd.mCommand}\r\n`);

      // TODO: When does it end on '-gdb-exit'?
      //if (!cmd.mCommand.endsWith('-gdb-exit')) {
      //  this.mGDBCommandTimer.start();
      //}
    });


  }
}
