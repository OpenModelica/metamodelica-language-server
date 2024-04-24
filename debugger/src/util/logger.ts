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

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to MetaModelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/parser.ts
 * -----------------------------------------------------------------------------
 */

// TODO: Use connection and LSP stuff from VS Code
export enum MessageType {
  error = 1,
  warning = 2,
  info = 3,
  log = 4,
  debug = 5
}

export const LOG_LEVEL_ENV_VAR = 'METAMODELICA_IDE_LOG_LEVEL';
export const LOG_LEVELS = ['debug', 'log', 'info', 'warning', 'error'] as const;
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_LEVELS_TO_MESSAGE_TYPES: {
  [logLevel in LogLevel]: MessageType
} = {
  debug: MessageType.debug,
  log: MessageType.log,
  info: MessageType.info,
  warning: MessageType.warning,
  error: MessageType.error,
} as const;

// Singleton madness to allow for logging from anywhere in the codebase
let _logLevel: MessageType = getLogLevelFromEnvironment();

/**
 * Set the minimum log level.
 */
export function setLogLevel(logLevel: LogLevel) {
  _logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevel];
}

export class Logger {
  private prefix: string;

  constructor({ prefix = '' }: { prefix?: string } = {}) {
    this.prefix = prefix;
  }

  static messageTypeToLogLevelMsg: Record<MessageType, string> = {
    [MessageType.error]: 'ERROR ⛔️',
    [MessageType.warning]: 'WARNING ⛔️',
    [MessageType.info]: 'INFO',
    [MessageType.log]: 'LOG',
    [MessageType.debug]: 'DEBUG'
  };

  public log(severity: MessageType, messageObjects: any[]) {
    if (_logLevel < severity) {
      return;
    }

    const formattedMessage = messageObjects
      .map((p) => {
        if (p instanceof Error) {
          return p.stack || p.message;
        }

        if (typeof p === 'object') {
          return JSON.stringify(p, null, 2);
        }

        return p;
      })
      .join(' ');

    const level = Logger.messageTypeToLogLevelMsg[severity];
    const prefix = this.prefix ? `${this.prefix} - ` : '';
    const time = new Date().toISOString().substring(11, 23);
    const message = `${time} ${level} ${prefix}${formattedMessage}`;

    console.log(message);
  }

  public debug(message: string, ...additionalArgs: any[]) {
    this.log(MessageType.debug, [message, ...additionalArgs]);
  }
  public info(message: string, ...additionalArgs: any[]) {
    this.log(MessageType.info, [message, ...additionalArgs]);
  }
  public warn(message: string, ...additionalArgs: any[]) {
    this.log(MessageType.warning, [message, ...additionalArgs]);
  }
  public error(message: string, ...additionalArgs: any[]) {
    this.log(MessageType.error, [message, ...additionalArgs]);
  }
}

/**
 * Default logger.
 */
export const logger = new Logger();

/**
 * Get the log level from the environment, before the server initializes.
 * Should only be used internally.
 */
export function getLogLevelFromEnvironment(): MessageType {
  const logLevelFromEnvironment = process.env[LOG_LEVEL_ENV_VAR] as LogLevel | undefined;
  if (logLevelFromEnvironment) {
    const logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevelFromEnvironment];
    if (logLevel) {
      return logLevel;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `Invalid ${LOG_LEVEL_ENV_VAR} "${logLevelFromEnvironment}", expected one of: ${Object.keys(
        LOG_LEVELS_TO_MESSAGE_TYPES,
      ).join(', ')}`,
    );
  }

  return LOG_LEVELS_TO_MESSAGE_TYPES[DEFAULT_LOG_LEVEL];
}
