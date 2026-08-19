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

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, sleep } from './helper';

suite('Clear Problems', () => {
  const docUri = getDocUri('BrokenLibrary.mo');

  test('metamodelica.clearProblems', async () => {
    await activate(docUri);
    await waitForDiagnostics(docUri);

    await vscode.commands.executeCommand('metamodelica.clearProblems');

    assert.deepStrictEqual(vscode.languages.getDiagnostics(docUri), []);
  });

  test('metamodelica.clearAllProblems', async () => {
    await activate(docUri);
    // Trigger a new analysis, the previous test cleared the diagnostics.
    await touchDocument(docUri);
    await waitForDiagnostics(docUri);

    await vscode.commands.executeCommand('metamodelica.clearAllProblems');

    assert.deepStrictEqual(vscode.languages.getDiagnostics(docUri), []);
  });
});

/**
 * Wait until diagnostics are reported for the given document.
 */
async function waitForDiagnostics(docUri: vscode.Uri, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (vscode.languages.getDiagnostics(docUri).length > 0) {
      return;
    }
    await sleep(200);
  }

  assert.fail(`No diagnostics reported for ${docUri.toString()} within ${timeoutMs} ms.`);
}

/**
 * Change and revert the document to make the server analyze it again.
 */
async function touchDocument(docUri: vscode.Uri): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(docUri, new vscode.Position(0, 0), '\n');
  await vscode.workspace.applyEdit(edit);

  const undo = new vscode.WorkspaceEdit();
  undo.delete(docUri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)));
  await vscode.workspace.applyEdit(undo);
}
