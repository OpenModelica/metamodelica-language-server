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

/**
 * Set command.
 *
 * @param command Command.
 * @returns       The command.
 */
export function gdbSet(command: string): string {
  return "-gdb-set " + command;
}

/**
 * Attach the process to GDB.
 *
 * @param processID The process ID to attach.
 * @returns         The command.
 */
export function attach(processID: string): string {
  return "attach " + processID;
}

/**
 * Changes the stdout & stderr stream buffer.
 *
 * Sets them to NULL so that executable can flush the output as they receive it.
 * @returns The command.
 */
export function changeStdStreamBuffer(): string {
  return "-data-evaluate-expression changeStdStreamBuffer()";
}

/**
 * Creates the -break-insert command.
 *
 * @param fileName    The breakpoint location.
 * @param line        The breakpoint line number.
 * @param isDisabled  Is the breakpoint disabled.
 * @param condition   The conditional expression.
 * @param ignoreCount The ignore count.
 * @param isPending   Sets the breakpoint pending.
 * @returns           The command.
 */
export function breakInsert(
  fileName: string,
  line: number,
  isDisabled: boolean = false,
  condition: string = "",
  ignoreCount: number = 0,
  isPending: boolean = true
): string {
  const command: string[] = [];
  command.push("-break-insert");
  if (isPending) {
    command.push("-f");
  }
  if (isDisabled) {
    command.push("-d");
  }
  if (condition !== "") {
    command.push("-c");
    command.push(`"\\"${condition}\\""`);
  }
  if (ignoreCount > 0) {
    command.push("-i");
    command.push(ignoreCount.toString());
  }

  command.push(`"\\"${fileName}\\":${line}"`);
  return command.join(" ");
}

/**
 * Creates the -break-delete command.
 *
 * @param breakpointIDs The breakpoint ids to delete.
 * @returns             The command.
 */
export function breakDelete(breakpointIDs: string[]): string {
  return "-break-delete " + breakpointIDs.join(" ");
}

/**
 * Creates the -break-enable command.
 *
 * @param breakpointIDs The breakpoint ids to enable.
 * @returns             The command.
 */
export function breakEnable(breakpointIDs: string[]): string {
  return "-break-enable " + breakpointIDs.join(" ");
}

/**
 * Creates the -break-disable command.
 *
 * @param breakpointIDs The breakpoint ids to disable.
 * @returns             The command.
 */
export function breakDisable(breakpointIDs: string[]): string {
  return "-break-disable " + breakpointIDs.join(" ");
}

/**
 * Creates the -break-after command.
 *
 * @param breakpointID  The breakpoint id.
 * @param count         The ignore count.
 * @returns             The command.
 */
export function breakAfter(breakpointID: string, count: number): string {
  return "-break-after " + breakpointID + " " + count.toString();
}

/**
 * Creates the -break-condition command.
 *
 * @param breakpointID  The breakpoint id.
 * @param condition     The conditional expression.
 * @returns             The command.
 */
export function breakCondition(breakpointID: string, condition: string): string {
  return "-break-condition " + breakpointID + " \"" + `\\"${condition}\\"` + "\"";
}
/**
 * Creates the -exec-run command.
 *
 * @returns The command.
 */
export function execRun(): string {
  return "-exec-run";
}

/**
 * Creates the -exec-continue command.
 *
 * @returns The command.
 */
export function execContinue(): string {
  return "-exec-continue";
}

/**
 * Creates the -exec-next command.
 *
 * @returns The command.
 */
export function execNext(): string {
  return "-exec-next";
}

/**
 * Creates the -exec-step command.
 *
 * @returns The command.
 */
export function execStep(): string {
  return "-exec-step";
}

/**
 * Creates the -exec-finish command.
 *
 * @returns The command.
 */
export function execFinish(): string {
  return "-exec-finish";
}

/**
 * Creates the -thread-info command.
 *
 * @returns The command.
 */
export function threadInfo(): string {
  return "-thread-info";
}

/**
 * Generates a GDB command to retrieve stack depth information.
 *
 * @param depth - The depth of the stack to retrieve. If the value is greater than 0,
 *                the command will include the specified depth. Defaults to 0.
 * @returns A string representing the GDB command for stack depth information.
 */
export function stackDepth(depth: number = 0): string {
  return depth > 0 ? `-stack-info-depth ${depth}` : "-stack-info-depth";
}

/**
 * Generates a GDB command to list stack frames for a specific thread and frame range.
 *
 * @param thread - The thread ID for which to list stack frames.
 * @param startFrame - The starting frame index in the stack.
 * @param endFrame - The ending frame index in the stack.
 * @returns The formatted GDB command as a string.
 */
export function stackListFrames(thread: number, startFrame: number, endFrame: number): string {
  const command: string = `-stack-list-frames --thread ${thread} ${startFrame} ${endFrame}`;
  return command;
}

/**
 * Creates the -stack-list-variables command.
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @returns           The command.
 */
export function stackListVariables(thread: number, frame: number): string {
  const command: string = `-stack-list-variables --thread ${thread} --frame ${frame} --simple-values`;
  return command;
}

/**
 * Creates the "thread apply all bt full" command.
 *
 * Generates a full backtrace of the program.
 * @returns The command.
 */
export function createFullBacktrace(): string {
  return "thread apply all bt full";
}

/**
 * Creates the -data-evaluate-expression --thread <thread> --frame <frame> "<expression>" command.
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to be evaluated.
 * @returns           The command.
 */
export function dataEvaluateExpression(thread: number, frame: number, expression: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "${expression}"`;
  return command;
}

/**
 * Create debug function getTypeOfAny command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(char*)getTypeOfAny(<expression>, <inRecord>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to be evaluated.
 * @param inRecord    Is in record.
 * @returns           The command.
 */
export function getTypeOfAny(thread: number, frame: number, expression: string, inRecord: boolean): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(char*)getTypeOfAny(${expression}, ${inRecord ? "1" : "0"})"`;
  return command;
}

/**
 * Create debug function anyString command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(char*)anyString(<expr>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to be evaluated.
 * @returns           The command.
 */
export function anyString(thread: number, frame: number, expression: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(char*)anyString(${expression})"`;
  return command;
}

/**
 * Create debug function getMetaTypeElement command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(char*)getMetaTypeElement(<expression>, <index>, <mt>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to find.
 * @param index
 * @param mt          Metatype
 * @returns           The command.
 */
export function getMetaTypeElement(thread: number, frame: number, expression: string, index: number, mt: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(char*)getMetaTypeElement(${expression}, ${index}, ${mt})"`;
  return command;
}

/**
 * Create debug function mmc_gdb_arrayLength command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(int)mmc_gdb_arrayLength(<expression>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to find the array length.
 * @returns           The command.
 */
export function arrayLength(thread: number, frame: number, expression: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(int)mmc_gdb_arrayLength(${expression})"`;
  return command;
}

/**
 * Create debug function listLength command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(int)listLength(<expression>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to find the list length.
 * @returns           The command.
 */
export function listLength(thread: number, frame: number, expression: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(int)listLength(${expression})"`;
  return command;
}

/**
 * Create debug function isOptionNone command.
 *
 * Command: -data-evaluate-expression --thread <thread> --frame <frame> "(int)isOptionNone(<expression>)"
 *
 * @param thread      The thread number.
 * @param frame       The frame number.
 * @param expression  The expression to check if option is none.
 * @returns           The command.
 */
export function isOptionNone(thread: number, frame: number, expression: string): string {
  const command: string = `-data-evaluate-expression --thread ${thread} --frame ${frame} "(int)isOptionNone(${expression})"`;
  return command;
}

/**
 * Creates the -gdb-exit command.
 *
 * @returns The command.
 */
export function gdbExit(): string {
  return "-gdb-exit";
}
