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

import Parser from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import { emitWarning } from 'process';

const resultClassString = ['done', 'running', 'connected', 'error', 'exit'] as const;
export type ResultClass = (typeof resultClassString)[number];

const asyncClassString = ["stopped", "breakpoint-created", "breakpoint-deleted", "breakpoint-modified", "cmd-param-changed", "library-loaded", "library-unloaded", "memory-changed", "record-started", "record-stopped", "running", "thread-created", "thread-exited", "thread-group-added", "thread-group-exited", "thread-group-removed", "thread-group-started", "thread-selected", "traceframe-changed", "tsv-created", "tsv-deleted", "tsv-modified"];
export type AsyncClass = (typeof asyncClassString)[number];

class GDBMITreeQueries {
  private asyncClassQuerry: Parser.Query;
  private resultClassQuerry: Parser.Query;

  constructor(language: Parser.Language) {
    this.asyncClassQuerry = language.query('(AsyncClass) @asyncClass');
    this.resultClassQuerry = language.query('(ResultClass) @resultClass');
  }

  getAsyncClasses(tree: Parser.Tree): AsyncClass[]  {
    const classes: AsyncClass[] = [];
    const captures = this.asyncClassQuerry.captures(tree.rootNode);
      for (const capture of captures ) {
        classes.push(capture.node.text as AsyncClass);
      }
    return classes;
  }

  getResultClasses(tree: Parser.Tree): ResultClass[] {
    const classes: ResultClass[] = [];
    const captures = this.resultClassQuerry.captures(tree.rootNode);
    for (const capture of captures ) {
      classes.push(capture.node.text as ResultClass);
    }
    return classes;
  }
}

export class GDBMIParser {
  private parser: Parser | undefined = undefined;
  private tree: Parser.Tree | undefined = undefined;
  private queries: GDBMITreeQueries | undefined = undefined;

  async initialize() {
    this.parser = await initializeGdbMiParser();
    this.queries = new GDBMITreeQueries(this.parser.getLanguage());
  }

  parse(input: string) {
    if (!this.parse) {
      throw new Error("GDB/MI parser undefined. Call initialize first.");
    }

    this.tree = this.parser!.parse(input);
  }

  /**
   * Get async classes from tree.
   *
   * @returns List of async class types.
   */
  getAsyncClasses(): AsyncClass[] {
    if (!this.tree) {
      throw new Error("GDB/MI parser tree undefined. Call parse first.");
    }

    return this.queries!.getAsyncClasses(this.tree);
  }

  /**
   * Get result classes from tree.
   *
   * @returns List of result class types.
   */
  getResultClasses(): ResultClass[] {
    if (!this.tree) {
      throw new Error("GDB/MI parser tree undefined. Call parse first.");
    }

    return this.queries!.getResultClasses(this.tree);
  }

  /**
   * Check of GDB/MI response is completed.
   *
   * @param response  Response from GDB/MI
   * @returns         True if compelted, false if ends with "running".
   */
  responseCompleted(response: string): boolean {
    this.parse(response);

    // Assuming if we can't parse the response it's not finished
    if ( this.tree!.rootNode.hasError ) {
      return false;
    }

    const resultClass = this.getResultClasses();

    if (resultClass) {
      switch (resultClass[resultClass.length - 1]) {
        case "running":
          return false;
        default:
          return true;
      }
    }

    const asyncClasses = this.getAsyncClasses();
    if (asyncClasses.length > 0) {
      switch (asyncClasses[asyncClasses.length - 1]) {
        case "running":
          return false;
        default:
          return true;
      }
    }

    emitWarning("GDB Parser: Can't tell if command is completed. Assuming it is.");
    return true;
  }
}

/**
 * Initialize tree-sitter parser and load GDB/MI language.
 *
 * See https://github.com/novafacing/tree-sitter-gdbmi  and
 * https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Output-Syntax.html
 * for the specification.
 *
 * @returns tree-sitter-gdbmi parser
 */
export async function initializeGdbMiParser(): Promise<Parser> {
  await Parser.init();
  const parser = new Parser;

  const gdbmiWasmFile = path.join(__dirname, 'tree-sitter-gdbmi.wasm');
  if (!fs.existsSync(gdbmiWasmFile)) {
    throw new Error(`Can't find 'tree-sitter-gdbmi.wasm' at ${gdbmiWasmFile}`);
  }

  const gdbmi = await Parser.Language.load(gdbmiWasmFile);
  parser.setLanguage(gdbmi);

  return parser;
}

