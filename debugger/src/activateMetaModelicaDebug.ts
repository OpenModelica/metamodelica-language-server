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

export function activateMetaModelicaDebug(context: vscode.ExtensionContext, factory?: vscode.DebugAdapterDescriptorFactory) {
  // register a configuration provider for 'metamodelica' debug type
  const provider = new MetaModelicaConfigurationProvider();
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('metamodelica-dbg', provider));

  if (!factory) {
    factory = new InlineDebugAdapterFactory();
  }
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('metamodelica-dbg', factory));
  if ('dispose' in factory) {
    context.subscriptions.push(factory as any);
  }
}

class MetaModelicaConfigurationProvider implements vscode.DebugConfigurationProvider {

  /**
   * Massage a debug configuration just before a debug session is being launched,
   * e.g. add all missing attributes to the debug configuration.
   */
  resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

    // if launch.json is missing or empty
    // if (!config.type && !config.request && !config.name) {
    //   const editor = vscode.window.activeTextEditor;
    //   if (editor && editor.document.languageId === 'openmodelica-scripting') {
    //     config.type = 'metamodelica-dbg';
    //     config.name = '(omc) Launch';
    //     config.request = 'launch';
    //     config.program = 'omc';
    //     config.stopOnEntry = false;
    //     config.gdb = 'gdb';
    //     config.mosFile = '${file}';
    //   }
    // }

    if (!config.program) {
      return vscode.window.showInformationMessage("Path to OpenModelica Compiler not specified").then(_ => {
        return undefined;  // abort launch
      });
    }

    return config;
  }
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

  createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new MetaModelicaDebugSession());
  }
}
