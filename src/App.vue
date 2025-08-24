<template>
  <div id="workbench-container" ref="workbenchContainer">
    <div class="control-bar" style="display: none;">
      <button class="control-btn" @click="doPreview">do preview</button>
    </div>
    <Splitpanes :maximize-panes="false">
      <Pane :size="20" min-size="15" max-size="50">
        <div id="sidebar" ref="sidebarContainer">
        </div>
      </Pane>

      <Pane :size="40">
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

      <Pane :size="40" min-size="20" max-size="50">
        <TypstPreview ref="preview" :reader="reader" :writer="writer" />
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

import '@codingame/monaco-vscode-theme-defaults-default-extension';

import { Parts, attachPart, onDidChangeSideBarPosition } from "@codingame/monaco-vscode-views-service-override";
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override'
import getMarkersServiceOverride from '@codingame/monaco-vscode-markers-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override'

import workerUrl from './lsp-worker.mjs?worker&url';

import tinymistPackage from './assets/tinymist-assets/package.json';

import { createFileSystemProvider } from "./fs-provider.mts";
import TypstPreview from './typst-preview/TypstPreview.vue';
import defaultWorkspaceFiles from 'virtual:default-workspace'

import { resolve } from 'pathe';


const workbenchContainer = ref(null)
const sidebarContainer = ref(null)
const editorsContainer = ref(null)
const panelContainer = ref(null)
const preview = ref(null)

const reader = ref(null)
const writer = ref(null)

let wrapper = null;

const workspacePath = "/workspace"
const workspaceUri = vscode.Uri.file(workspacePath);
const defaultFilePath = "/workspace/main.typ"

async function doPreview() {
  preview.value.initPreview(defaultFilePath)
}

async function loadExtensionAssets() {
  const assetMap = {
    './syntaxes/language-configuration.json': () => import('./assets/tinymist-assets/syntaxes/language-configuration.json?raw'),
    './syntaxes/typst-markdown-injection.json': () => import('./assets/tinymist-assets/syntaxes/typst-markdown-injection.json?raw'),
    './out/typst.tmLanguage.json': () => import('./assets/tinymist-assets/out/typst.tmLanguage.json?raw'),
    './out/typst-code.tmLanguage.json': () => import('./assets/tinymist-assets/out/typst-code.tmLanguage.json?raw'),
    './icons/ti-white.png': () => import('./assets/tinymist-assets/icons/ti-white.png?raw'),
    './icons/ti.png': () => import('./assets/tinymist-assets/icons/ti.png?raw'),
    './icons/typst-small.png': () => import('./assets/tinymist-assets/icons/typst-small.png?raw'),
  };

  const extensionFilesOrContents = new Map();

  await Promise.all(
    Object.entries(assetMap).map(async ([key, importFn]) => {
      const { default: content } = await importFn();
      extensionFilesOrContents.set(key, content);
      // console.log("loaded", key)
    })
  );

  return extensionFilesOrContents;
}

async function getClientConfig(
  worker,
  messageTransports
) {
  const extensionFilesOrContents = await loadExtensionAssets();

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
          'workbench.iconTheme': 'vs-minimal',
          'editor.guides.bracketPairsHorizontal': 'active',
          'editor.wordBasedSuggestions': 'off',
          'editor.experimental.asyncTokenization': false,
          'vitest.disableWorkspaceWarning': true,
          'editor.codeLens': false,
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
        publisher: tinymistPackage.publisher,
        version: tinymistPackage.version,
        engines: {
          vscode: '*'
        },
        contributes: {
          configuration: tinymistPackage.contributes.configuration,
          configurationDefaults: tinymistPackage.contributes.configurationDefaults,
          languages: tinymistPackage.contributes.languages,
          grammars: tinymistPackage.contributes.grammars,
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
  let res = null;
  for (const defaultWorkspaceFile of defaultWorkspaceFiles) {
    let doc = await fileSystemProvider.addFileToWorkspace(
      resolve(workspacePath, defaultWorkspaceFile.path),
      await defaultWorkspaceFile.getData()
    );
    if (defaultWorkspaceFile.path === "main.typ") {
      res = doc
    }
  }
  return res
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

  reader.value = new BrowserMessageReader(worker);
  writer.value = new BrowserMessageWriter(worker);
  reader.value.listen((message) => {
    if ('method' in message && message.method == 'tmLog') {
      console.log('[Tinymist WASM Log]', message.params.data)
      return
    }
    console.log('LSP -> Editor:', message);
  });

  const config = await getClientConfig(
    worker,
    { reader: reader.value, writer: writer.value }
  );

  wrapper = new MonacoEditorLanguageClientWrapper();
  const fileSystemProvider = await createFileSystemProvider();

  await wrapper.init(config);

  let defaultDocument = await loadDefaultWorkspace(fileSystemProvider);
  await vscode.window.showTextDocument(defaultDocument, { preserveFocus: true });

  await wrapper.startLanguageClients();

  await new Promise((resolve, reject) => {
    let count = 0;
    function onReady(e) {
      if (e.data.method !== "client/registerCapability") return;
      count++;
      if (count >= 3) {
        worker.removeEventListener("message", onReady);
        resolve(true);
        clearTimeout(workerTimeout);
      }
    }

    const workerTimeout = setTimeout(() => {
      worker.removeEventListener("message", onReady);
      reject(new Error("failed to initialize preview: waiting for final registerCapability timeout"));
    }, 60000 * 5);

    worker.addEventListener("message", onReady);
  });
  await doPreview();
};

function handleBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
  return 'Are you sure to leave? You changes won\'t be saved.'
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)

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

#editors {
  height: 100%;
}

#panel {
  height: 100%;
}

#sidebar {
  height: 100%;
}
</style>