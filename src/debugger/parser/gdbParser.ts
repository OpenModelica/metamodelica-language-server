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
import { logger } from '../../util/logger';

export interface GDBMIOutput {
  miOutOfBandRecordList: GDBMIOutOfBandRecord[];
  miResultRecord?: GDBMIResultRecord;
}

export interface GDBMIOutOfBandRecord {
  miAsyncRecord?: GDBMIAsyncRecord;
  miStreamRecord?: GDBMIStreamRecord;
}

export interface GDBMIAsyncRecord {
  miExecAsyncOutput?: GDBMIExecAsyncOutput;
  miStatusAsyncOutput?: GDBMIStatusAsyncOutput;
  miNotifyAsyncOutput?: GDBMINotifyAsyncOutput;
}

export interface GDBMIExecAsyncOutput {
  miAsyncOutput?: GDBMIAsyncOutput;
}

export interface GDBMIStatusAsyncOutput {
  miAsyncOutput?: GDBMIAsyncOutput;
}

export interface GDBMINotifyAsyncOutput {
  miAsyncOutput?: GDBMIAsyncOutput;
}

export interface GDBMIAsyncOutput {
  asyncClass: string;
  miResult: GDBMIResult[];
}

export interface GDBMIStreamRecord {
  type: GDBMIStreamRecordType;
  value: string;
}

export enum GDBMIStreamRecordType {
  consoleStream = "ConsoleStream",
  targetStream = "TargetStream",
  logStream = "LogStream"
}

export interface GDBMIResultRecord {
  token: number;
  cls: string;
  miResultsList: GDBMIResult[];
  consoleStreamOutput: string;
  logStreamOutput: string;
}

export interface GDBMIResult {
  variable: string;
  miValue: GDBMIValue;
}

export interface GDBMIValue {
  value: string;
  miTuple?: GDBMITuple;
  miList?: GDBMIList;
}

export interface GDBMITuple {
  miResultsList: GDBMIResult[];
}

export interface GDBMIList {
  miValuesList: GDBMIValue[];
  miResultsList: GDBMIResult[];
}

export class GDBMIParser {
  private parser: Parser | undefined = undefined;
  private tree: Parser.Tree | undefined = undefined;

  async initialize() {
    this.parser = await initializeGdbMiParser();
  }

  parse(input: string): GDBMIOutput {
    if (!this.parser) {
      throw new Error("GDB/MI parser undefined. Call initialize first.");
    }

    this.tree = this.parser!.parse(input);
    // walkTree and print it for debugging purpose
    this.walkTree(this.tree.rootNode);
    // return GDBMIOutput
    return this.createGDBMIOutput();
  }

  /**
   * Recursively walks through the syntax tree starting from the given node,
   * logging the type and text of each node with indentation corresponding to its depth.
   *
   * @param node - The current syntax node to process.
   * @param depth - The current depth in the tree, used for indentation. Defaults to 0.
   */
  private walkTree(node: Parser.SyntaxNode, depth: number = 0) {
    const indent = '  '.repeat(depth);
    logger.debug(`${indent}${node.type}: ${node.text}`);

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        this.walkTree(childNode, depth + 1);
      }
    }
  }

  /**
   * Creates a GDB/MI output object by parsing the internal parser tree.
   *
   * This method should be called after the `parse` method to ensure the parser tree is defined.
   * It traverses the tree to construct a `GDBMIOutput` object based on the types of nodes found.
   *
   * @throws {Error} If the parser tree is undefined.
   * @returns {GDBMIOutput} The constructed GDB/MI output object.
   *
   * The method identifies `ResultRecord` and `OutOfBandRecord` nodes to populate the output object.
   */
  private createGDBMIOutput(): GDBMIOutput {
    if (!this.tree) {
      throw new Error("GDB/MI parser tree undefined. Call parse first.");
    }

    const output: GDBMIOutput = {
      miOutOfBandRecordList: []
    };

    const rootNode = this.tree.rootNode;

    // rootNode is Stream and its child node is Ouput
    // For example,
    // (Stream
    //   (Output
    //     (ResultRecord
    //       (Token)
    //       (ResultClass)
    //       (Result
    //         (Variable
    //           (Identifier))
    //         (Value
    //           (Const
    //             (CString
    //               (CStringCharacterSequence))))))))

    if (rootNode && rootNode.type === "Stream") {
      const outputNode = rootNode.child(0);
      if (outputNode && outputNode.type === "Output") {
        for (let i = 0; i < outputNode.childCount; i++) {
          const childNode = outputNode.child(i);
          if (childNode) {
            switch (childNode.type) {
              case 'ResultRecord':
                output.miResultRecord = this.parseResultRecord(childNode);
                break;
              case 'OutOfBandRecord':
                output.miOutOfBandRecordList.push(this.parseOutOfBandRecord(childNode));
                break;
              default:
                break;
            }
          }
        }
      }
    }

    return output;
  }

  /**
   * Parses a GDB/MI result record from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIResultRecord` object containing the parsed data.
   *
   * The function initializes a `GDBMIResultRecord` object with default values and iterates over the child nodes of the given syntax node.
   * Depending on the type of each child node, it updates the corresponding properties of the `GDBMIResultRecord` object:
   * - 'Token': Parses the token as an integer and assigns it to the `token` property.
   * - 'ResultClass': Assigns the text of the node to the `cls` property.
   * - 'Result': Parses the result node and adds it to the `miResultsList` array.
   * - 'ConsoleStreamOutput': Assigns the text of the node to the `consoleStreamOutput` property.
   * - 'LogStreamOutput': Assigns the text of the node to the `logStreamOutput` property.
   */
  private parseResultRecord(node: Parser.SyntaxNode): GDBMIResultRecord {
    const resultRecord: GDBMIResultRecord = {
      token: 0,
      cls: '',
      miResultsList: [],
      consoleStreamOutput: '',
      logStreamOutput: ''
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'Token':
            resultRecord.token = parseInt(childNode.text, 10);
            break;
          case 'ResultClass':
            resultRecord.cls = childNode.text;
            break;
          case 'Result':
            resultRecord.miResultsList.push(this.parseResult(childNode));
            break;
          case 'ConsoleStreamOutput':
            resultRecord.consoleStreamOutput = childNode.text;
            break;
          case 'LogStreamOutput':
            resultRecord.logStreamOutput = childNode.text;
            break;
          default:
            break;
        }
      }
    }

    return resultRecord;
  }

  /**
   * Parses a given SyntaxNode to extract a GDB/MI Out-Of-Band Record.
   *
   * This method iterates over the child nodes of the provided SyntaxNode and
   * determines the type of Out-Of-Band Record based on the child node type.
   * It supports parsing of 'AsyncRecord' and 'StreamRecord' types.
   *
   * @param node - The SyntaxNode to be parsed.
   * @returns A GDBMIOutOfBandRecord object containing the parsed information.
   */
  private parseOutOfBandRecord(node: Parser.SyntaxNode): GDBMIOutOfBandRecord {
    const outOfBandRecord: GDBMIOutOfBandRecord = {};

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'AsyncRecord':
            outOfBandRecord.miAsyncRecord = this.parseAsyncRecord(childNode);
            break;
          case 'StreamRecord':
            outOfBandRecord.miStreamRecord = this.parseStreamRecord(childNode);
            break;
          default:
            break;
        }
      }
    }

    return outOfBandRecord;
  }

  /**
   * Parses a GDB/MI async record from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIAsyncRecord` object containing the parsed async record.
   *
   * The function iterates over the child nodes of the provided syntax node and
   * sets the `type` and corresponding output properties of the `GDBMIAsyncRecord` object
   * based on the type of each child node. The possible types are 'ExecAsyncOutput',
   * 'StatusAsyncOutput', and 'NotifyAsyncOutput'.
   */
  private parseAsyncRecord(node: Parser.SyntaxNode): GDBMIAsyncRecord {
    const asyncRecord: GDBMIAsyncRecord = {};

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'ExecAsyncOutput':
            asyncRecord.miExecAsyncOutput = this.parseExecAsynOutput(childNode);
            break;
          case 'StatusAsyncOutput':
            asyncRecord.miStatusAsyncOutput = this.parseStatusAsyncOutput(childNode);
            break;
          case 'NotifyAsyncOutput':
            asyncRecord.miNotifyAsyncOutput = this.parseNotifyAsyncOutput(childNode);
            break;
          default:
            break;
        }
      }
    }

    return asyncRecord;
  }

  /**
   * Parses a GDB/MI exec async output from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIExecAsyncOutput` object containing the parsed exec async output.
   */
  private parseExecAsynOutput(node: Parser.SyntaxNode): GDBMIExecAsyncOutput {
    const execAsyncOutput: GDBMIExecAsyncOutput = {};

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'AsyncOutput':
            execAsyncOutput.miAsyncOutput = this.parseAsyncOutput(childNode);
            break;
          default:
            break;
        }
      }
    }

    return execAsyncOutput;
  }

  /**
   * Parses a GDB/MI status async output from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIStatusAsyncOutput` object containing the parsed status async output.
   */
  private parseStatusAsyncOutput(node: Parser.SyntaxNode): GDBMIStatusAsyncOutput {
    const statusAsyncOutput: GDBMIStatusAsyncOutput = {};

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'AsyncOutput':
            statusAsyncOutput.miAsyncOutput = this.parseAsyncOutput(childNode);
            break;
          default:
            break;
        }
      }
    }

    return statusAsyncOutput;
  }

  /**
   * Parses a GDB/MI notify async output from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMINotifyAsyncOutput` object containing the parsed notify async output.
   */
  private parseNotifyAsyncOutput(node: Parser.SyntaxNode): GDBMINotifyAsyncOutput {
    const notifyAsyncOutput: GDBMINotifyAsyncOutput = {};

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'AsyncOutput':
            notifyAsyncOutput.miAsyncOutput = this.parseAsyncOutput(childNode);
            break;
          default:
            break;
        }
      }
    }

    return notifyAsyncOutput;
  }

  /**
   * Parses a GDB/MI async output from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIAsyncOutput` object containing the parsed async output.
   */
  private parseAsyncOutput(node: Parser.SyntaxNode): GDBMIAsyncOutput {
    const asyncOutput: GDBMIAsyncOutput = {
      asyncClass: '',
      miResult: []
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'AsyncClass':
            asyncOutput.asyncClass = childNode.text;
            break;
          case 'Result':
            asyncOutput.miResult.push(this.parseResult(childNode));
            break;
          default:
            break;
        }
      }
    }

    return asyncOutput;
  }

   /**
   * Parses a given syntax node to extract a GDBMIResult.
   *
   * This method iterates over the children of the provided syntax node and
   * extracts the variable and value information to construct a GDBMIResult object.
   *
   * @param node - The syntax node to parse.
   * @returns A GDBMIResult object containing the parsed variable and value.
   */
  private parseResult(node: Parser.SyntaxNode): GDBMIResult {
    const result: GDBMIResult = {
      variable: '',
      miValue: {
        value: ''
      }
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'Variable':
            result.variable = childNode.text;
            break;
          case 'Value':
            result.miValue = this.parseValue(childNode);
            break;
          default:
            break;
        }
      }
    }

    return result;
  }

  /**
   * Parses a given syntax node and returns a GDBMIValue object.
   *
   * This method iterates over the children of the provided syntax node and
   * determines the type of value based on the child node's type. It supports
   * parsing of 'Constant', 'Tuple', and 'List' types.
   *
   * @param node - The syntax node to parse.
   * @returns A GDBMIValue object representing the parsed value.
   */
  private parseValue(node: Parser.SyntaxNode): GDBMIValue {
    const value: GDBMIValue = {
      value: ''
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'Const':
            value.value = childNode.text.replace(/^"(.*)"$/, '$1');
            break;
          case 'Tuple':
            value.miTuple = this.parseTuple(childNode);
            break;
          case 'List':
            value.miList = this.parseList(childNode);
            break;
          default:
            break;
        }
      }
    }

    return value;
  }

  /**
   * Parses a given SyntaxNode representing a GDB/MI tuple and converts it into a GDBMITuple object.
   *
   * @param node - The SyntaxNode to parse, which should represent a GDB/MI tuple.
   * @returns A GDBMITuple object containing the parsed results.
   */
  private parseTuple(node: Parser.SyntaxNode): GDBMITuple {
    const tuple: GDBMITuple = {
      miResultsList: []
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode && childNode.type === 'Result') {
        tuple.miResultsList.push(this.parseResult(childNode));
      }
    }

    return tuple;
  }

  /**
   * Parses a list node from the GDB/MI output and returns a GDBMIList object.
   *
   * @param node - The syntax node representing the list to be parsed.
   * @returns A GDBMIList object containing the parsed values and results.
   */
  private parseList(node: Parser.SyntaxNode): GDBMIList {
    const list: GDBMIList = {
      miValuesList: [],
      miResultsList: []
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'Value':
            list.miValuesList.push(this.parseValue(childNode));
            break;
          case 'Result':
            list.miResultsList.push(this.parseResult(childNode));
            break;
          default:
            break;
        }
      }
    }

    return list;
  }

  /**
   * Parses a GDB/MI stream record from the given syntax node.
   *
   * @param node - The syntax node to parse.
   * @returns A `GDBMIStreamRecord` object containing the parsed stream record.
   *
   * The function iterates over the child nodes of the provided syntax node and
   * sets the `type` and `value` properties of the `GDBMIStreamRecord` object
   * based on the type of each child node. The possible types are 'ConsoleStream',
   * 'TargetStream', and 'LogStream'.
   */
  private parseStreamRecord(node: Parser.SyntaxNode): GDBMIStreamRecord {
    const streamRecord: GDBMIStreamRecord = {
      type: GDBMIStreamRecordType.consoleStream,
      value: ''
    };

    for (let i = 0; i < node.childCount; i++) {
      const childNode = node.child(i);
      if (childNode) {
        switch (childNode.type) {
          case 'ConsoleStream':
            streamRecord.type = GDBMIStreamRecordType.consoleStream;
            streamRecord.value = childNode.text;
            break;
          case 'TargetStream':
            streamRecord.type = GDBMIStreamRecordType.targetStream;
            streamRecord.value = childNode.text;
            break;
          case 'LogStream':
            streamRecord.type = GDBMIStreamRecordType.logStream;
            streamRecord.value = childNode.text;
            break;
          default:
            break;
        }
      }
    }

    return streamRecord;
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

