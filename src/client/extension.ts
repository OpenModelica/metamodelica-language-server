/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
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

import * as path from 'path';
import * as fs from 'fs';
import { languages, workspace, ExtensionContext, TextDocument } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import * as DebuggerExtension from '../debugger/extension';

let client: LanguageClient;

/**
 * Language IDs that a '.mo' file can be opened with and that may be switched to
 * 'metamodelica'. Anything else (C, Python, OpenModelica script, ...) is left alone,
 * as is 'base-modelica', which the Modelica extension only sets after inspecting the
 * file contents.
 */
const RELABELED_LANGUAGE_IDS = ['modelica', 'plaintext'];

/**
 * Check if a document should be switched to the 'metamodelica' language.
 *
 * Only '.mo' files that VS Code didn't already recognize as MetaModelica are
 * candidates, so opening files of any other type doesn't change their language mode.
 *
 * @param fileName    File name of the document, see `TextDocument.fileName`.
 * @param languageId  Current language ID of the document, see `TextDocument.languageId`.
 * @returns `true` if the language of the document should be set to 'metamodelica'.
 */
export function isMetaModelicaCandidate(fileName: string, languageId: string): boolean {
  return fileName.endsWith('.mo') && RELABELED_LANGUAGE_IDS.includes(languageId);
}

export async function activate(context: ExtensionContext) {
  // Activate Debugger
  DebuggerExtension.initialize(context);
  // Register event listener to set language for '.mo' files.
  const checkedFiles: { [id: string]: boolean} = {};
  context.subscriptions.push(workspace.onDidOpenTextDocument((document: TextDocument) => {
    if (!isMetaModelicaCandidate(document.fileName, document.languageId)) {
      return;
    }

    if (checkedFiles[document.fileName]) {
      return;
    }

    checkedFiles[document.fileName] = true;
    languages.setTextDocumentLanguage(document, 'metamodelica');
  }));

  // The server is implemented in node, point to packed module
  const serverModule = context.asAbsolutePath(
    path.join('out', 'server.js')
  );
  if (!fs.existsSync(serverModule)) {
    throw new Error(`Can't find server module in ${serverModule}`);
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for metamodelica text documents
    documentSelector: [
      {
        language: 'metamodelica',
        scheme: 'file'
      }
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    'metamodelicaLanguageServer',
    'MetaModelica Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
