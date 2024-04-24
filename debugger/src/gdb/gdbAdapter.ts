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

export class GDBAdapter {
  private mpGDBProcess: ChildProcess | null = null;
  private mGDBProgram: string = '';
  private mGDBArguments: string[] = [];
  //private mInferiorArguments: string[] = [];
  private gdbKilled: boolean = true;
  private gdbStarted: boolean = false;

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
      throw new Error(`The executable to debug does not exist: ${program}`);
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
        throw new Error("Error: Failed to spawn gdb process.");
      }
      //this.mInferiorArguments = _programArgs;
      this.gdbKilled = false;

      this.mpGDBProcess.on('error', (err) => {
        console.error('Error occurred in GDB process:', err);
      });

      this.mpGDBProcess.stdout!.on('data', (data) => {
        // Handle GDB standard output
        console.log(data.toString());
      });

      this.mpGDBProcess.stderr!.on('data', (data) => {
        // Handle GDB error output
        console.error(data.toString());
      });

      this.mpGDBProcess.on('spawn', () => {
        console.log('GDB process started.');
        this.gdbStarted = true;
        resolve(); // Resolve the promise once the GDB process is spawned
      });

      this.mpGDBProcess.on('exit', (code, signal) => {
        console.log(`GDB process exited with code ${code} and signal ${signal}`);
        this.gdbStarted = false;
        // Handle GDB process exit
      });

      // TODO: Handle simulation options

      // TODO: Start gdb with arguments
      // TODO: Wait for this.mpGDBProcess to have started
    });
  }

  /**
   * Kill GDB process.
   */
  public kill() {
    if (this.gdbKilled || !this.mpGDBProcess) {
      return;
    }
    if (!this.mpGDBProcess.kill()) {
      throw new Error(`Failed to kill GDB child process ${this.mpGDBProcess.pid}`);
    }
    this.gdbKilled = true;
    this.gdbStarted = false;
  }

  public isGDBRunning(): boolean {
    return this.gdbStarted;
  }

  /*

  handleGDBProcessStarted(): void {
    // Handle GDB process started event
  }

  readGDBStandardOutput(): void {
    // Handle GDB standard output
  }

  readGDBErrorOutput(): void {
    // Handle GDB error output
  }

  handleGDBProcessError(error: Error): void {
    console.error('Error occurred in GDB process:', error);
  }

  handleGDBProcessFinished(code: number): void {
    console.log('GDB process finished with code:', code);
    // Handle GDB process finished event
  }

  handleGDBProcessStartedForSimulation(): void {
    // Handle GDB process started event for simulation
  }

  handleGDBProcessFinishedForSimulation(code: number): void {
    console.log('GDB process finished for simulation with code:', code);
    // Handle GDB process finished event for simulation
  }
  */
}
