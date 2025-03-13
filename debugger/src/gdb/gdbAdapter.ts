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
import { EventEmitter } from 'events';
import { existsSync } from 'fs';

import * as CommandFactory from './commandFactory';
import { logger } from '../util/logger';
import { GDBMIParser, GDBMIOutput, GDBMIOutputType, GDBMIOutOfBandRecordType, GDBMIAsyncRecordType, GDBMIResult } from '../parser/gdbParser';

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

export class GDBAdapter extends EventEmitter {
  private gdbProcess: ChildProcess | null = null;
  private gdbProgram: string = '';
  private gdbArguments: string[] = [];
  private inferiorArguments: string[] = [];

  // TODO: Make this a state machine thingy instead of bazillion booleans.
  private gdbKilled: boolean = true;
  private gdbStarted: boolean = false;
  private isRunning: boolean = false;

  private token: number = 0;
  private standardOutputBuffer: string = ""; /* Buffer GDB machine interface output from STDOUT */
  private gdbmiOutput: GDBMIOutput = { type: GDBMIOutputType.noneOutput, miOutOfBandRecordList: [] };
  private gdbmiCommandOutput?: (data: GDBMIOutput) => void;
  private programOutput: string = '';

  private parser: GDBMIParser;

  /**
   * Event handler on GDB response completed
   */
  public onComplete?: () => void;
  public exited?: () => void;

  constructor() {
    super();
    this.parser = new GDBMIParser();
    // Initialize GDB/MI tree-sitter parser
    this.parser.initialize();
  }

  /**
   * Launch GDB child process with default arguments.
   *
   * @param program           The program to debug with GDB.
   * @param workingDirectory  Working directory for GDB.
   * @param programArgs       Program arguments
   * @param gdbPath           Path to GDB executable.
   */
  public async launch(
    program: string,
    workingDirectory: string,
    programArgs: string[],
    gdbPath: string): Promise<void>
  {
    return new Promise<void>((resolve, reject) => {
      // Check if the program to debug exists
      if (!existsSync(program)) {
        return reject(new Error(`GDB: The executable to debug does not exist: ${program}`));
      }
      // Check if GDB/MI tree-sitter parser initialized
      if (!this.parser) {
        return reject(new Error(`GDB: GDB/MI parser not initialized`));
      }
      /* launch gdb with the default arguments
      * -q  quiet mode. Don't print welcome messages
      * -nw don't use window interface
      * -i  select interface
      * mi  machine interface
      */
      this.gdbProgram = gdbPath;
      this.gdbArguments = ['-q', '-nw', '-i', 'mi', '--args', program];
      logger.info(`GDB: Launching GDB ${this.gdbProgram} ${this.gdbArguments.join(" ")} with working directory ${workingDirectory}`);
      if (workingDirectory && !existsSync(workingDirectory)) {
        return reject(new Error(`GDB: The working directory (cwd) does not exist: ${workingDirectory}`));
      }
      this.gdbProcess = spawn(this.gdbProgram, this.gdbArguments, {
        cwd: workingDirectory
      });
      if (!this.gdbProcess) {
        return reject(new Error("GDB: Failed to spawn gdb process."));
      }
      this.inferiorArguments = programArgs;
      this.gdbKilled = false;

      this.gdbProcess.stdout!.once('data', (data: Buffer) => {
        logger.info('GDB: Process started.');
        this.gdbStarted = true;
        this.isRunning = true;
        resolve();
      });

      this.gdbProcess.stdout!.on('data', (data) => {
        let scan = this.standardOutputBuffer.length;

        this.standardOutputBuffer += data.toString();

        let newstart = 0;
        while (newstart < this.standardOutputBuffer.length) {
          const start = newstart;
          let end = this.standardOutputBuffer.indexOf('\n', scan);
          if (end < 0) {
            this.standardOutputBuffer = this.standardOutputBuffer.slice(start);
            return;
          }
          newstart = end + 1;
          scan = newstart;
          if (end === start) {
            continue;
          }
          if (process.platform === 'win32' && this.standardOutputBuffer[end - 1] === '\r') {
            --end;
            if (end === start) {
              continue;
            }
          }

          const response = this.standardOutputBuffer.slice(start, end);

          if (response.trim() === "" || response.trim() === "(gdb)") {
            continue;
          }

          // parser requires string to end with newline
          this.gdbmiOutput = this.parser.parse(response + "\n");
          // console.log(response);
          // console.log(this.gdbmiOutput.type);
          if (this.gdbmiOutput.type === GDBMIOutputType.outOfBandRecordOutput) {
            for (const miOutOfBandRecord of this.gdbmiOutput.miOutOfBandRecordList) {
              if (miOutOfBandRecord.type === GDBMIOutOfBandRecordType.asyncRecord) {
                if (miOutOfBandRecord.miAsyncRecord?.type === GDBMIAsyncRecordType.execAsyncOutput) {
                  if (miOutOfBandRecord.miAsyncRecord?.miExecAsyncOutput?.miAsyncOutput?.asyncClass === "stopped") {
                    if (miOutOfBandRecord.miAsyncRecord.miExecAsyncOutput.miAsyncOutput.miResult.variable === "reason") {
                      if (miOutOfBandRecord.miAsyncRecord.miExecAsyncOutput.miAsyncOutput.miResult.miValue.value === "exited-normally"
                        || miOutOfBandRecord.miAsyncRecord.miExecAsyncOutput.miAsyncOutput.miResult.miValue.value === "exited") {
                        this.emit('completed');
                        this.emit('exit');
                      } else if (miOutOfBandRecord.miAsyncRecord.miExecAsyncOutput.miAsyncOutput.miResult.miValue.value === "breakpoint-hit") {
                        this.emit('completed');
                        this.emit('stopOnBreakpoint');
                      }
                    }
                  }
                }
              }
            }
            // console.log(this.gdbmiOutput);
            // console.log(this.gdbmiOutput.miOutOfBandRecordList);
            // todo
          } else if (this.gdbmiOutput.type === GDBMIOutputType.resultRecordOutput) {
            // console.log(this.gdbmiOutput.miResultRecord?.cls);
            if (this.gdbmiOutput.miResultRecord?.cls === "done") {
              this.emit('completed');
            } else if (this.gdbmiOutput.miResultRecord?.cls === "running") {
              // do not send completed for running as it will break gdbAdapter.test
              // this.emit('completed');
            } else {
              // console.log(this.gdbmiOutput.miResultRecord?.cls);
            }
          } else { // GDBMIOutputType.noneOutput
            this.programOutput += response;
            // todo
          }

          if (this.gdbmiCommandOutput) {
            this.gdbmiCommandOutput(this.gdbmiOutput);
            this.gdbmiCommandOutput = undefined;
          }
        }
        this.standardOutputBuffer = "";
      });

      this.gdbProcess.on('error', (err) => {
        logger.error('GDB: Error occurred in process:', err);
        reject(err);
      });

      this.gdbProcess.once('exit', (code, signal) => {
        const err = `GDB: Process exited with code ${code} and signal ${signal}`;
        logger.info(err);
        this.gdbKilled = true;
        this.isRunning = false;
        this.gdbStarted = false;
        reject(err);
      });
    });
  }

  /**
   * Quit GDB process.
   *
   * If quit failed kill process.
   */
  async quit(): Promise<void> {

    if (!this.gdbProcess || this.gdbKilled) {
      return;
    }

    // Stop GDB
    // TODO: Add some timeout
    await this.sendCommand(CommandFactory.gdbExit(), GDBCommandFlag.nonCriticalResponse);

    // Kill the process
    if (!this.gdbKilled) {
      logger.info("GDB: Killed process.");
      this.gdbProcess.kill();
      this.gdbKilled = true;
      this.isRunning = false;
      this.gdbStarted = false;
    }
  }

  public isGDBRunning(): boolean {
    return this.gdbStarted && this.isRunning;
  }

  public getProgramOutput(): string {
    return this.programOutput;
  }

  /**
   * Send command to GDB.
   *
   * Resolves when response completed.
   *
   * @param command   GDB command.
   * @param flags     Command flags.
   * @returns         Promise response data as string.
   */
  public sendCommand(
    command: string,
    flags: GDBCommandFlag = GDBCommandFlag.noFlags): Promise<GDBMIOutput>
  {
    return new Promise<GDBMIOutput>((resolve, reject) => {
      if ( !this.isGDBRunning() || !this.gdbProcess ) {
        return reject(new Error(`GDB: Not running.`));
      }

      this.token += 1;
      const cmd = new GDBMICommand(flags, `${this.token}${command}`);

      // Resolve when GDB command completed.
      this.once('completed', () => {
        logger.info(`GDB: Finished command "${cmd.mCommand}"`);
        this.gdbmiCommandOutput = resolve;
      });

      // Log command
      logger.info(`GDB: Run command "${cmd.mCommand}"`);
      // Pass command to GDB
      this.gdbProcess.stdin!.write(`${cmd.mCommand}\r\n`);

      if (command === '-gdb-exit') {
        resolve({ type: GDBMIOutputType.noneOutput, miOutOfBandRecordList: [] });
      }
    });
  }

  /**
   * Sets up the GDB (GNU Debugger) environment with various configurations before starting the actual debugging process.
   */
  async setupGDB(): Promise<void> {
    // Set the GDB environment before starting the actual debugging
    // Sets the confirm on/off. Off disables confirmation requests. On enables confirmation requests.
    await this.sendCommand(CommandFactory.gdbSet("confirm off"), GDBCommandFlag.nonCriticalResponse);

    // When displaying a pointer to an object, identify the actual (derived) type of the object rather than the declared type,
    // using the virtual function table.
    await this.sendCommand(CommandFactory.gdbSet("print object on"), GDBCommandFlag.nonCriticalResponse);

    // This indicates that an unrecognized breakpoint location should automatically result in a pending breakpoint being created.
    await this.sendCommand(CommandFactory.gdbSet("breakpoint pending on"), GDBCommandFlag.nonCriticalResponse);

    // This command sets the width of the screen to num characters wide.
    await this.sendCommand(CommandFactory.gdbSet("width 0"), GDBCommandFlag.nonCriticalResponse);

    // This command sets the height of the screen to num lines high.
    await this.sendCommand(CommandFactory.gdbSet("height 0"), GDBCommandFlag.nonCriticalResponse);

    /* Set a limit on how many elements of an array GDB will print.
     * If GDB is printing a large array, it stops printing after it has printed
     * the number of elements set by the set print elements command. This limit
     * also applies to the display of strings. When GDB starts, this limit is
     * set to 200.  Setting number-of-elements to zero means that the printing
     * is unlimited.
     */
    // TODO: Make this an option in the final extension
    const numberOfElements: number = 0;
    await this.sendCommand(CommandFactory.gdbSet(`print elements ${numberOfElements}`), GDBCommandFlag.nonCriticalResponse);

    // Set the inferior arguments.
    // GDB changes the program arguments if we pass them through --args e.g -override=variableFilter=.*
    await this.sendCommand(CommandFactory.gdbSet(`args ${this.inferiorArguments.join(" ")}`), GDBCommandFlag.nonCriticalResponse);

    // Insert breakpoints
    await this.insertCatchOMCBreakpoint();
  }

  /**
   * Inserts a breakpoint at Catch.omc:1 to handle MMC_THROW()
   */
  async insertCatchOMCBreakpoint(): Promise<void> {
    await this.sendCommand(CommandFactory.breakInsert("Catch.omc", 1, true), GDBCommandFlag.silentCommand);
  }

  /**
   * Get the result record from the GDBMIOutput.
   *
   * @param gdbmiOutput GDBMIOutput object.
   * @returns The result record if available, otherwise undefined.
   */
  public getGDBMIResultRecord(gdbmiOutput: GDBMIOutput) {
    if (gdbmiOutput.type === GDBMIOutputType.resultRecordOutput) {
      return gdbmiOutput.miResultRecord;
    }
    return undefined;
  }

  /**
   * Get the result from the GDBMIResult array.
   *
   * @param variable The variable to search for.
   * @param gdbmiResults Array of GDBMIResult.
   * @returns The result if found, otherwise undefined.
   */
  public getGDBMIResult(variable: string, gdbmiResults: GDBMIResult[]) {
    for (const result of gdbmiResults) {
      if (result.variable === variable) {
        return result;
      }
    }
    return undefined;
  }

  /**
   * Get the constant value from the GDBMIResult.
   *
   * @param results Array of GDBMIResult.
   * @returns The constant value if found, otherwise undefined.
   */
  public getGDBMIConstantValue(gdbmiResult: GDBMIResult): string {
    if (gdbmiResult) {
      return gdbmiResult.miValue.value;
    }
    return "";
  }
}
