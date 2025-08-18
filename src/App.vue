<template>
  <div id="workbench-container" ref="workbenchContainer">
    <Splitpanes :maximize-panes="false">
      <Pane :size="24" min-size="15" max-size="50">
        <div id="sidebar" ref="sidebarContainer">
        </div>
      </Pane>

      <Pane>
        <Splitpanes :horizontal="true" :maximize-panes="false">
          <Pane :size="65" min-size="30">
            <div id="editors" ref="editorsContainer">
            </div>
          </Pane>

          <Pane :size="35" min-size="20" max-size="50">
            <div id="panel" ref="panelContainer">
            </div>
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import * as vscode from "vscode";
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser';
import { LogLevel } from '@codingame/monaco-vscode-api';

import { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';
import { configureDefaultWorkerFactory } from 'monaco-editor-wrapper/workers/workerLoaders';

import { Parts, attachPart, onDidChangeSideBarPosition } from "@codingame/monaco-vscode-views-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getExplorerServiceOverride from "@codingame/monaco-vscode-explorer-service-override";

import { createFileSystemProvider } from "./fs-provider.js";

import workerUrl from './lsp-worker.js?worker&url';

import typstLanguageConfig from './assets/typst-configuration.json?raw';
import typstTextmateGrammar from './assets/typst-textmate-grammar.json?raw';
import tinymistPackage from './assets/tinymist-package.json';

const workbenchContainer = ref(null)
const sidebarContainer = ref(null)
const editorsContainer = ref(null)
const panelContainer = ref(null)

let wrapper = null;

const workspaceUri = vscode.Uri.file("/workspace");
const defaultFilePath = "/workspace/main.typ"

async function getClientConfig(
  worker,
  messageTransports
) {
  const extensionFilesOrContents = new Map();
  extensionFilesOrContents.set('/typst-textmate-grammar.json', typstTextmateGrammar);
  extensionFilesOrContents.set('/typst-configuration.json', typstLanguageConfig);

  const config = {
    $type: 'extended',
    logLevel: LogLevel.Debug,
    htmlContainer: workbenchContainer.value,
    automaticallyDispose: true,
    vscodeApiConfig: {
      serviceOverrides: {
        ...getKeybindingsServiceOverride(),
        ...getExplorerServiceOverride(),
        ...getMarkersServiceOverride(),
      },
      userConfiguration: {
        json: JSON.stringify({
          'workbench.colorTheme': 'Default Dark Modern',
          'editor.guides.bracketPairsHorizontal': 'active',
          'editor.wordBasedSuggestions': 'off',
          'editor.experimental.asyncTokenization': false,
          'vitest.disableWorkspaceWarning': true,
          "editor.codeLens": false
        })
      },
      viewsConfig: {
        viewServiceType: 'ViewsService',
        viewsInitFunc: viewsInit,
      },
      workspaceConfig: {
        enableWorkspaceTrust: true,
        workspaceProvider: {
          trusted: true,
          async open() {
            window.open(window.location.href);
            return true;
          },
          workspace: {
            folderUri: workspaceUri,
          },
        },
      }
    },
    extensions: [{
      config: {
        name: 'tinymist-wasm',
        publisher: 'Myriad-Dreamin',
        version: '1.0.0',
        engines: {
          vscode: '*'
        },
        contributes: {
          configuration: tinymistPackage.contributes.configuration,
          configurationDefaults: tinymistPackage.contributes.configurationDefaults,
          languages: [{
            id: 'typst',
            configuration: './typst-configuration.json',
            extensions: ['.typ'],
            aliases: [
              "Typst",
              "typst",
              "typ"
            ],
          }],
          grammars: [{
            language: 'typst',
            scopeName: 'source.typst',
            path: './typst-textmate-grammar.json',
            tokenTypes: tinymistPackage.contributes.grammars[0].tokenTypes,
            balancedBracketScopes: tinymistPackage.contributes.grammars[0].balancedBracketScopes,
            unbalancedBracketScopes: tinymistPackage.contributes.grammars[0].unbalancedBracketScopes,
          }],
          // semanticTokenTypes: tinymistPackage.contributes.semanticTokenTypes,
          // semanticTokenModifiers: tinymistPackage.contributes.semanticTokenModifiers,
          semanticTokenScopes: tinymistPackage.contributes.semanticTokenScopes,
        }
      },
      filesOrContents: extensionFilesOrContents
    }],
    editorAppConfig: {
      monacoWorkerFactory: configureDefaultWorkerFactory,
    },
    languageClientConfigs: {
      configs: {
        typst: {
          clientOptions: {
            documentSelector: [
              'typst'
            ]
          },
          connection: {
            options: {
              $type: 'WorkerDirect',
              worker: worker
            },
            messageTransports: messageTransports
          }
        }
      }
    }
  };

  return config;
};

const viewsInit = async () => {
  for (const config of [
    {
      part: Parts.SIDEBAR_PART,
      get element() {
        return sidebarContainer.value
      },
      onDidElementChange: onDidChangeSideBarPosition,
    },
    { part: Parts.EDITOR_PART, element: editorsContainer.value },
    { part: Parts.PANEL_PART, element: panelContainer.value },
  ]) {
    attachPart(
      config.part,
      config.element,
    );

    config.onDidElementChange?.(() => {
      attachPart(
        config.part,
        config.element,
      );
    });
  }
};

async function loadDefaultWorkspace(fileSystemProvider) {
  await fileSystemProvider.createDirectory(workspaceUri);
  const defaultUri = await fileSystemProvider.addFileToWorkspace(
    defaultFilePath,
    `
= Test
Welcome to the \`tinymist-wasm\` playground!

This is a *test*.

#let x = 1

#let f(x, y) = x + y

#f(1, 2)
`,
  );

  return defaultUri;
}

async function startTinymistClient() {
  let worker = new Worker(workerUrl, {
    type: 'module',
    name: 'Tinymist LS',
  });

  /// Waits for the server worker to be ready before returning the client
  await new Promise((resolve, reject) => {
    function onReady(e) {
      if (e.data.method !== "serverWorkerReady") return;
      worker.removeEventListener("message", onReady);
      resolve(true);
      clearTimeout(workerTimeout);
    }

    const workerTimeout = setTimeout(() => {
      worker.removeEventListener("message", onReady);
      reject(new Error("failed to initialize server worker: timeout"));
    }, 60000 * 5);

    worker.addEventListener("message", onReady);
  });

  const reader = new BrowserMessageReader(worker);
  const writer = new BrowserMessageWriter(worker);
  reader.listen((message) => {
    if ('method' in message && message.method == 'tmLog') {
      console.log('[Tinymist WASM Log]', message.params.data)
      return
    }
    console.log('LSP -> Editor:', message);
  });

  const config = await getClientConfig(
    worker,
    { reader: reader, writer: writer }
  );

  wrapper = new MonacoEditorLanguageClientWrapper();
  const fileSystemProvider = await createFileSystemProvider();
  await wrapper.init(config);

  let defaultUri = await loadDefaultWorkspace(fileSystemProvider);
  await wrapper.startLanguageClients();
  await vscode.window.showTextDocument(defaultUri, { preserveFocus: true });
};

onMounted(async () => {
  startTinymistClient()
})

onUnmounted(() => {
  wrapper.dispose();
})
</script>

<style>
#workbench-container {
  display: flex;
  height: 100vh;
  width: 100%;
}
</style>