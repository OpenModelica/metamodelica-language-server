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

import { DebugProtocol } from '@vscode/debugprotocol';

/**
 * Class responsible for handling breakpoints in the debugger.
 */
export class BreakpointHandler {
  private breakpoints: DebugProtocol.Breakpoint[] = [];

  constructor() {
  }

  /**
   * Retrieves all breakpoints for a given source.
   *
   * @param source - The source for which to retrieve breakpoints.
   * @returns An array of breakpoints associated with the given source.
   */
  public getBreakpoints(source: DebugProtocol.Source): DebugProtocol.Breakpoint[] {
    return this.breakpoints.filter(breakpoint => breakpoint.source === source);
  }

  /**
   * Retrieves the IDs of all breakpoints for a given file path.
   *
   * @param path - The file path for which to retrieve breakpoint IDs.
   * @returns An array of breakpoint IDs associated with the given file path.
   */
  public getBreakpointIds(path: string): number[] {
    return this.breakpoints
      .filter(breakpoint => breakpoint.source?.path === path)
      .map(breakpoint => breakpoint.id)
      .filter((id): id is number => id !== undefined);
  }

  /**
   * Deletes breakpoints by their IDs.
   *
   * @param ids - An array of breakpoint IDs to delete.
   */
  public deleteBreakpointsByIds(ids: number[]): void {
    this.breakpoints = this.breakpoints.filter(breakpoint => breakpoint.id !== undefined && !ids.includes(breakpoint.id));
  }

  /**
   * Adds a new breakpoint.
   *
   * @param id - The ID of the new breakpoint.
   * @param source - The source file of the new breakpoint.
   * @param line - The line number of the new breakpoint.
   */
  public addBreakpoint(id: number, source: DebugProtocol.Source, line: number): void {
    const breakpoint: DebugProtocol.Breakpoint = {
      id: id,
      source: source,
      line: line,
      verified: true
    };
    this.breakpoints.push(breakpoint);
  }
}
