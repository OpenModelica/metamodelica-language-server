/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * activateMockDebug.ts contains the shared extension code that can be executed both in node.js and the browser.
 */

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { MetaModelicaDebugSession } from './metaModelicaDebug';
import { FileAccessor } from './mockRuntime';

export function activateMetaModelicaDebug(context: vscode.ExtensionContext, factory?: vscode.DebugAdapterDescriptorFactory) {

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.metamodelica-language-server.runEditorContents', (resource: vscode.Uri) => {
      let targetResource = resource;
      if (!targetResource && vscode.window.activeTextEditor) {
        targetResource = vscode.window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        vscode.debug.startDebugging(undefined, {
          type: 'metamodelica-dbg',
          name: 'Run Script',
          request: 'launch',
          program: targetResource.fsPath
        },
          { noDebug: true }
        );
      }
    }),
    vscode.commands.registerCommand('extension.metamodelica-language-server.debugEditorContents', (resource: vscode.Uri) => {
      let targetResource = resource;
      if (!targetResource && vscode.window.activeTextEditor) {
        targetResource = vscode.window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        vscode.debug.startDebugging(undefined, {
          type: 'metamodelica-dbg',
          name: 'Debug Script',
          request: 'launch',
          program: targetResource.fsPath,
          stopOnEntry: true
        });
      }
    }),
    // TODO AHeu: What is this doing?
    vscode.commands.registerCommand('extension.metamodelica-language-server.toggleFormatting', (variable) => {
      const ds = vscode.debug.activeDebugSession;
      if (ds) {
        ds.customRequest('toggleFormatting');
      }
    })
  );

  // register a configuration provider for 'metamodelica' debug type
  const provider = new MetaModelicaConfigurationProvider();
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('metamodelica', provider));

  // register a dynamic configuration provider for 'metamodelica' debug type
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('metamodelica', {
    provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
      return [
        {
          name: "Dynamic Launch",
          request: "launch",
          type: "metamodelica-dbg",
          program: "${file}"
        },
        {
          name: "Another Dynamic Launch",
          request: "launch",
          type: "metamodelica-dbg",
          program: "${file}"
        },
        {
          name: "Mock Launch",
          request: "launch",
          type: "metamodelica-dbg",
          program: "${file}"
        }
      ];
    }
  }, vscode.DebugConfigurationProviderTriggerKind.Dynamic));

  if (!factory) {
    factory = new InlineDebugAdapterFactory();
  }
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('metamodelica-dbg', factory));
  if ('dispose' in factory) {
    context.subscriptions.push(factory as any);
  }

  // override VS Code's default implementation of the debug hover
  // here we match only Mock "variables", that are words starting with an '$'
  context.subscriptions.push(vscode.languages.registerEvaluatableExpressionProvider('metamodelica-dbg', {
    provideEvaluatableExpression(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.EvaluatableExpression> {

      const VARIABLE_REGEXP = /\$[a-z][a-z0-9]*/ig;
      const line = document.lineAt(position.line).text;

      let m = VARIABLE_REGEXP.exec(line);
      while (m) {
        const varRange = new vscode.Range(position.line, m.index, position.line, m.index + m[0].length);

        if (varRange.contains(position)) {
          return new vscode.EvaluatableExpression(varRange);
        }

        m = VARIABLE_REGEXP.exec(line);
      }
      return undefined;
    }
  }));

  // override VS Code's default implementation of the "inline values" feature"
  context.subscriptions.push(vscode.languages.registerInlineValuesProvider('metamodelica-dbg', {

    provideInlineValues(document: vscode.TextDocument, viewport: vscode.Range, context: vscode.InlineValueContext) : vscode.ProviderResult<vscode.InlineValue[]> {

      const allValues: vscode.InlineValue[] = [];

      for (let l = viewport.start.line; l <= context.stoppedLocation.end.line; l++) {
        const line = document.lineAt(l);
        const regExp = /\$([a-z][a-z0-9]*)/ig;  // variables are words starting with '$'
        let m: RegExpExecArray | null;
        do {
          m = regExp.exec(line.text);
          if (m) {
            const varName = m[1];
            const varRange = new vscode.Range(l, m.index, l, m.index + varName.length);

            // some literal text
            //allValues.push(new vscode.InlineValueText(varRange, `${varName}: ${viewport.start.line}`));

            // value found via variable lookup
            allValues.push(new vscode.InlineValueVariableLookup(varRange, varName, false));

            // value determined via expression evaluation
            //allValues.push(new vscode.InlineValueEvaluatableExpression(varRange, varName));
          }
        } while (m);
      }

      return allValues;
    }
  }));
}

class MetaModelicaConfigurationProvider implements vscode.DebugConfigurationProvider {

  /**
   * Massage a debug configuration just before a debug session is being launched,
   * e.g. add all missing attributes to the debug configuration.
   */
  resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

    // if launch.json is missing or empty
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'openmodelica-scripting') {
        config.type = 'metamodelica-dbg';
        config.name = '(omc) Launch';
        config.request = 'launch';
        config.program = 'omc';
        config.stopOnEntry = false;
        config.gdb = 'gdb';
        config.mosFile = '${file}';
      }
    }

    if (!config.program) {
      return vscode.window.showInformationMessage("Path to OpenModelica Compiler not specified").then(_ => {
        return undefined;  // abort launch
      });
    }

    return config;
  }
}

export const workspaceFileAccessor: FileAccessor = {
  isWindows: typeof process !== 'undefined' && process.platform === 'win32',
  async readFile(path: string): Promise<Uint8Array> {
    let uri: vscode.Uri;
    try {
      uri = pathToUri(path);
    } catch (e) {
      return new TextEncoder().encode(`cannot read '${path}'`);
    }

    return await vscode.workspace.fs.readFile(uri);
  },
  async writeFile(path: string, contents: Uint8Array) {
    await vscode.workspace.fs.writeFile(pathToUri(path), contents);
  }
};

function pathToUri(path: string) {
  try {
    return vscode.Uri.file(path);
  } catch (e) {
    return vscode.Uri.parse(path);
  }
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

  createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new MetaModelicaDebugSession(workspaceFileAccessor));
  }
}
