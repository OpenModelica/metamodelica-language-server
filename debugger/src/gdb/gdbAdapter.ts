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
import { GDBMIParser } from '../parser/gdbParser';

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
  private mpGDBProcess: ChildProcess | null = null;
  private mGDBProgram: string = '';
  private mGDBArguments: string[] = [];
  private mInferiorArguments: string[] = [];

  // TODO: Make this a state machine thingy instead of bazillion booleans.
  private gdbKilled: boolean = true;
  private gdbStarted: boolean = false;
  private isRunning: boolean = false;

  private token: number = 0;
  private mStandardOutputBuffer: string = ""; /* Buffer GDB machine interface output from STDOUT */

  private parser: GDBMIParser;

  /**
   * Event handler on GDB response completed
   */
  public onComplete?: () => void;
  public exited?: () => void;

  constructor() {
    super();
    this.parser = new GDBMIParser();
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
        reject(new Error(`GDB: The executable to debug does not exist: ${program}`));
        return;
      }

      // Start GDB/MI tree-sitter parser
      this.parser.initialize().then(() => {
        logger.info('GDB: GDB/MI parser initialized');
      }).catch((err) => {
        logger.error('GDB: GDB/MI parser failed to initialized');
        reject(err);
      });

      /* launch gdb with the default arguments
      * -q  quiet mode. Don't print welcome messages
      * -nw don't use window interface
      * -i  select interface
      * mi  machine interface
      */
      this.mGDBProgram = gdbPath;
      this.mGDBArguments = ['-q', '-nw', '-i', 'mi', '--args', program];
      this.mpGDBProcess = spawn(this.mGDBProgram, this.mGDBArguments, {
        cwd: workingDirectory
      });
      if (!this.mpGDBProcess) {
        reject(new Error("GDB: Failed to spawn gdb process."));
        return;
      }
      this.mInferiorArguments = programArgs;
      this.gdbKilled = false;

      this.mpGDBProcess.on('error', (err) => {
        logger.error('GDB: Error occurred in process:', err);
      });

      this.mpGDBProcess.stdout!.on('data', (data) => {
        this.mStandardOutputBuffer += data.toString();

        if (this.parser.responseCompleted(data.toString())) {
          this.emit('completed');
        }
      });

      this.once('completed', () => {
        logger.debug(`GDB:\nthis.mStandardOutputBuffer`);
        this.mStandardOutputBuffer = "";
        logger.info('GDB: Finished startup.');
        this.gdbStarted = true;
        this.isRunning = true;

        // Handle GDB process start
        this.handleGDBProcessStartedHelper().then(() => {
            resolve();
        }).catch((err) => {
            reject(err);
        });
      });

      // read GDB error output
      this.mpGDBProcess.stderr!.on('data', (data) => {
        reject(new Error(`Error from GDB: ${data.toString()}`));
      });

      this.mpGDBProcess.once('spawn', () => {
        logger.info('GDB: Process started.');
        this.gdbStarted = true;
      });

      this.mpGDBProcess.once('exit', (code, signal) => {
        logger.info(`GDB: Process exited with code ${code} and signal ${signal}`);
        this.gdbKilled = true;
        this.isRunning = false;
        this.gdbStarted = false;
        this.emit('exited');
      });
    });
  }

  /**
   * Quit GDB process.
   *
   * If quit failed kill process.
   */
  async quit(): Promise<void> {

    if (!this.mpGDBProcess || this.gdbKilled) {
      return;
    }

    // Stop GDB
    // TODO: Add some timeout
    await this.sendCommand(CommandFactory.gdbExit(), GDBCommandFlag.nonCriticalResponse);

    // Kill the process
    if (!this.gdbKilled) {
      logger.info("GDB: Killed process.");
      this.mpGDBProcess.kill();
      this.gdbKilled = true;
      this.isRunning = false;
      this.gdbStarted = false;
    }
  }

  public isGDBRunning(): boolean {
    return this.gdbStarted && this.isRunning;
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
    flags: GDBCommandFlag): Promise<string>
  {
    return new Promise<string>((resolve, reject) => {
      if ( !this.isGDBRunning() || !this.mpGDBProcess ) {
        reject(new Error(`GDB: Not running.`));
        return;
      }

      this.token += 1;
      const cmd = new GDBMICommand(flags, `${this.token}${command}`);

      const onExited = () => {
        const response = this.mStandardOutputBuffer;
        logger.debug(`\n${response}`);
        this.mStandardOutputBuffer = "";
        // This will leak event listener for 'completed', but who cares...
        resolve(response);
      };
      this.once('exited', onExited);

      // Resolve when GDB command completed.
      this.once('completed', () => {
        const response = this.mStandardOutputBuffer;
        logger.debug(`\n${response}`);
        this.mStandardOutputBuffer = "";
        logger.info(`GDB: Event listener count 'completed' ${this.listenerCount('completed')}`);
        logger.info(`GDB: Finished command "${cmd.mCommand}"`);
        this.removeListener('exited', onExited);
        resolve(response);
      });

      // Log command
      logger.info(`GDB: Run command "${cmd.mCommand}"`);

      // Pass command to GDB
      this.mpGDBProcess.stdin!.write(`${cmd.mCommand}\r\n`);
    });
  }

  /**
   *
   */
  async handleGDBProcessStartedHelper(): Promise<void> {
    // Create the temporary path
    //const tmpPath: string = Utilities.tempDirectory();

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
    const numberOfElements: number = 200;
    await this.sendCommand(CommandFactory.gdbSet(`print elements ${numberOfElements}`), GDBCommandFlag.nonCriticalResponse);

    // Set the inferior arguments.
    // GDB changes the program arguments if we pass them through --args e.g -override=variableFilter=.*
    await this.sendCommand(CommandFactory.gdbSet(`args ${this.mInferiorArguments.join(" ")}`), GDBCommandFlag.nonCriticalResponse);

    // Insert breakpoints
    await this.insertCatchOMCBreakpoint();
    await this.insertBreakpoints();
  }

  /**
   * Inserts a breakpoint at Catch.omc:1 to handle MMC_THROW()
   */
  async insertCatchOMCBreakpoint(): Promise<void> {
    await this.sendCommand(CommandFactory.breakInsert("Catch.omc", 1, true), GDBCommandFlag.silentCommand);
  }

  /**
   * Insert all breakpoints from VSCode.
   */
  async insertBreakpoints(): Promise<void> {
  //  //const breakpoints: BreakpointTreeItem[] = MainWindow.instance().getBreakpointsWidget().getBreakpointsTreeModel().getRootBreakpointTreeItem().getChildren();
  //  // TODO: Get breakpoints from VSCode
  //  const breakpoints: BreakpointTreeItem[] = [];
  //  for (const pBreakpoint of breakpoints) {
  //    this.insertBreakpoint(pBreakpoint);
  //  }
  }

  /**
   * Sends the -break-insert command to GDB.
   *
   * @param pBreakpointTreeItem - pointer to BreakpointTreeItem
   */
  //insertBreakpoint(pBreakpointTreeItem: BreakpointTreeItem): void {
  //  // TODO: Get file name, line number, ... from VSCode
  //  const fileName = "";
  //  const lineNumber = 0;
  //  const isDisabled = false;
  //  const condition = undefined;
  //  const ignoreCount = 0;
  //  const command = CommandFactory.breakInsert(
  //    fileName, lineNumber, isDisabled, condition, ignoreCount);
  //  this.sendCommand(command, pBreakpointTreeItem, this.insertBreakpointCB);
  //}
}
