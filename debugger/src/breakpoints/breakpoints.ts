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
import fs from 'fs';
import { DebugProtocol } from '@vscode/debugprotocol';

import { isMetaModelicaFile } from '../util/util';

export class BreakpointMapping {
  //readonly metaModelicaSourceFile: DebugProtocol.Source;
  readonly metaModelicaBreakpoints: DebugProtocol.Breakpoint[];

  readonly cSourceFile: DebugProtocol.Source;
  readonly cBreakpoints: DebugProtocol.Breakpoint[];

  private parentBreakpointHandler: BreakpointHandler;

  constructor (parent: BreakpointHandler, metaModelicaFile: DebugProtocol.Source, cFile: DebugProtocol.Source) {
    this.parentBreakpointHandler = parent;
    //this.metaModelicaSourceFile = metaModelicaFile;
    this.cSourceFile = cFile;
    this.cSourceFile.sources = [metaModelicaFile];

    this.metaModelicaBreakpoints = [];
    this.cBreakpoints = [];
  }

  /**
   * Get all C and MetaModelica breakpoints.
   *
   * @returns Array of breakpoints
   */
  getAllBreakpoints(): DebugProtocol.Breakpoint[] {
    return this.metaModelicaBreakpoints.concat(this.cBreakpoints);
  }

  /**
   * Add MetaModelica and corresponding C breakpoint to breakpoint mapping.
   *
   * @param metaModelicaBreakpoint
   */
  async addBreakpoint(metaModelicaBreakpoint: DebugProtocol.Breakpoint): Promise<DebugProtocol.Breakpoint[]> {
    const cBreakpoints: DebugProtocol.Breakpoint[] = [];
    const startLine = metaModelicaBreakpoint.line;
    if(!startLine) {
      console.error("addBreakpoint: No start line in MetaModelica breakpoiont");
      return [];
    }
    const endLine = metaModelicaBreakpoint.endLine || startLine;
    const lines = await this.findCorrespondingLine(startLine, endLine);
    for (const line of lines) {
      const cBreakpoint = {
        id: this.parentBreakpointHandler.getNewId(),
        verified: false,
        source: this.cSourceFile,
        line: line
      } as DebugProtocol.Breakpoint;

      this.metaModelicaBreakpoints.push(metaModelicaBreakpoint);
      this.cBreakpoints.push(cBreakpoint);
      cBreakpoints.push(cBreakpoint);
    }

    return cBreakpoints;
  }

  async findCorrespondingLine(startLine: number, endLine: number): Promise<number[]> {
    if (!this.cSourceFile || !this.cSourceFile.path) {
      console.error("findCorrespondingLine: C file not available.");
      return [];
    }

    try {
        const data = await fs.promises.readFile(this.cSourceFile.path, 'utf8');
        const lines = data.split('\n');

        // Regular expression to match lines starting with '#line N'
        // TODO: Ensure next string matches MetaModelica file
        const lineRegex = /^#line (\d+) "/;
        let matchedLines: { lineNumber: number, referenceLine: number }[] = [];

        // Iterate over lines
        lines.forEach((line: string, index: number) => {
          // Check if the line is within range
          const match = line.match(lineRegex);
          if (match) {
            const referenceLine: number = parseInt(match[1]);
            if (startLine <= referenceLine && referenceLine <= endLine) {
              matchedLines.push({lineNumber: index + 1, referenceLine: referenceLine});
            }
          }
        });
        if (matchedLines.length === 0) {
          console.error("findCorrespondingLine: Couldn't find any corresponding lines.");
          return [];
        }

        matchedLines = matchedLines.sort((a,b) => a.referenceLine - b.referenceLine);
        const firstReferenceLine = matchedLines[0].referenceLine;
        matchedLines = matchedLines.filter((l) => {
          return l.referenceLine === firstReferenceLine;
        });

        return matchedLines.map(i => i.lineNumber);
    } catch (err) {
      console.error(`Error reading file: ${err}`);
      return [];
    }
  }
}

export class BreakpointHandler {
  /** Path to OpenModelica/build_cmake */
  private buildDirectoryRoot: string;
  /** Path to OpenModelica/build_cmake/OMCompiler/Compiler/c_files */
  private compilerCFilesRoot: string;

  private count: number = 0;

  /** Mapping from MetaModelica to C files */
  private metaModelicaToCUriMap: Map<string, BreakpointMapping>;

  constructor(openModelicaRootDir) {
    this.buildDirectoryRoot = openModelicaRootDir;
    this.compilerCFilesRoot = path.join(this.buildDirectoryRoot, "build_cmake", "OMCompiler", "Compiler", "c_files");

    this.metaModelicaToCUriMap = new Map<string, BreakpointMapping>();
  }

  getMetaModelicaFiles(): string[] {
    return Array.from(this.metaModelicaToCUriMap.keys());
  }

  getCorrespondingCFile(metaModelicaFile: string): DebugProtocol.Source | undefined {
    const mapping = this.metaModelicaToCUriMap.get(metaModelicaFile);
    if (!mapping) {
      return undefined;
    }
    return mapping.cSourceFile;
  }

  /**
   *
   * @returns Array of breakpoints
   */
  getAllBreakpoints(): DebugProtocol.Breakpoint[] {
    const breakpoints: DebugProtocol.Breakpoint[] = [];
    for (const key of this.metaModelicaToCUriMap.keys()) {
      const mapping = this.metaModelicaToCUriMap.get(key)!;
      const list = mapping.getAllBreakpoints();
      breakpoints.push(...list);
    }
    return breakpoints;
  }

  getNewId(): number {
    this.count++;
    return this.count;
  }

  /**
   * Add MetaModelica file to handler.
   *
   * Initialize empty breakpoint mapping.
   *
   * @param metaModelicaFile  MetaModelica file.
   */
  async addFile(metaModelicaFile: string) {
    if (this.metaModelicaToCUriMap.has(metaModelicaFile)) {
      return;
    }
    const cFile = await this.findCFile(metaModelicaFile);
    this.metaModelicaToCUriMap.set(metaModelicaFile,
      new BreakpointMapping(
        this,
        {path: metaModelicaFile} as DebugProtocol.Source,
        {path: cFile} as DebugProtocol.Source
    ));
  }

  /**
   * Add MetaModelica source breakpoint.
   *
   * Add MetaModelica file if not already in map.
   *
   * @param metaModelicaBreakpoint  MetaModelica breakpoint.
   * @returns                       Corresponding C breakpoint.
   */
  async addSourceBreakpoint(metaModelicaBreakpoint: DebugProtocol.Breakpoint): Promise<DebugProtocol.Breakpoint[]> {
    if( metaModelicaBreakpoint.source?.path === undefined) {
      console.error("addSourceBreakpoint: No MetaModelica source path defined in break point.");
      return [];
    }

    await this.addFile(metaModelicaBreakpoint.source.path);
    const mapping = this.metaModelicaToCUriMap.get(metaModelicaBreakpoint.source.path)!;
    return mapping.addBreakpoint(metaModelicaBreakpoint);
  }

  /**
   * Find C source file corresponding to MetaModelica source file.
   *
   * @param metaModelicaFile  MetaModelica file.
   * @returns                 Absolute path to C file.
   */
  private async findCFile(metaModelicaFile: string): Promise<string> {
    if (!isMetaModelicaFile(metaModelicaFile)) {
      throw new Error(`Can't add file ${metaModelicaFile}, it's not a MetaModelica file.`);
    }
    let name: string = path.basename(metaModelicaFile);
    name = name.split('.').shift() || name ;
    const cFile = path.join(this.compilerCFilesRoot, name + ".c");

    // TODO: Check if file exists
    return cFile;
  }
}
