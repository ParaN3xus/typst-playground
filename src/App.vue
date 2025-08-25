<template>
  <LoadingScreen />

  <div v-show="resourcesLoaded" class="flex flex-col h-screen w-full">
    <div class="hidden">
      <button @click="doPreview">do preview</button>
      <button @click="printMain">print main</button>
    </div>
    <div class="flex justify-between bg-base">
      <div class="mx-2 flex">
        <button v-if="isMobile" class="menu-btn" @click="toggleSidebar">
          <Icon icon="heroicons:archive-box" class="text-lg" />
        </button>
        <button class="menu-btn" @click="handleEmptyClicked">
          <Icon icon="heroicons:trash" class="text-lg" />
        </button>
      </div>
      <div class="mx-2">
        <button class="menu-btn" :class="{ 'opacity-50 cursor-not-allowed': isSharing }" :disabled="isSharing"
          @click="handleShareClicked">
          <Icon v-if="!shareButtonText" icon="heroicons:share" class="text-lg" />
          <span v-else>{{ shareButtonText }}</span>
        </button>
      </div>
    </div>
    <Splitpanes :maximize-panes="false">
      <Pane :size="isSidebarOpen ? (isMobile ? 50 : 20) : 0" :min-size="isMobile ? 0 : 15"
        :max-size="isSidebarOpen ? 50 : 0">
        <div ref="sidebarContainer" class="h-full">
        </div>
      </Pane>
      <Pane :size="isSidebarOpen ? 80 : 100" min-size="15">
        <Splitpanes :horizontal="isMobile" :maximize-panes="false">
          <Pane :size="40">
            <Splitpanes :horizontal="true" :maximize-panes="false">
              <Pane :size="isMobile ? 100 : 65" min-size="30">
                <div ref="editorsContainer" class="h-full">
                </div>
              </Pane>
              <Pane :size="35" :min-size="isMobile ? 0 : 20" :max-size="isMobile ? 0 : 50">
                <div ref="panelContainer" class="h-full"></div>
              </Pane>
            </Splitpanes>
          </Pane>
          <Pane :size="40" min-size="20" max-size="50">
            <TypstPreview ref="preview" :reader="reader" :writer="writer" />
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>
  </div>
</template>
<script setup>

import { ref, onMounted, onUnmounted } from 'vue'
import { resolve } from 'pathe';

import { Icon } from "@iconify/vue";
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

import tinymistPackage from './assets/tinymist-assets/package.json';

import TypstPreview from './typst-preview/TypstPreview.vue';
import LoadingScreen from './LoadingScreen.vue';
import { createFileSystemProvider, defaultEntryFilePath, defaultEntryFileUri, defaultWorkspacePath, defaultWorkspaceUri } from "./fs-provider.mts";
import resourceLoader from "./resource-loader.mjs"
import { TinymistLSPWorker } from "./lsp-worker.mjs"
import { uploadToPastebin } from './pastebin';
import { AutoSaveConfiguration } from '@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files';

const isMobile = ref(false)
const isSidebarOpen = ref(true)
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const checkMobile = () => {
  const before = isMobile.value
  const after = window.innerWidth < 768
  if (!before && after) {
    isSidebarOpen.value = false
  } else if (before && !after) {
    isSidebarOpen.value = true
  }
  isMobile.value = after
}

const sidebarContainer = ref(null)
const editorsContainer = ref(null)
const panelContainer = ref(null)
const preview = ref(null)
const resourcesLoaded = ref(false);

let worker = null
const reader = ref(null)
const writer = ref(null)

let wrapper = null;
let fileSystemProvider = null

async function printMain() {
  const decoder = new TextDecoder('utf-8');
  console.log(decoder.decode(await fileSystemProvider.readFile(defaultEntryFileUri)))
}

async function doPreview() {
  preview.value.initPreview(defaultEntryFilePath)
}

const isSharing = ref(false);
const shareButtonText = ref(null);
async function handleShareClicked() {
  if (isSharing.value) return;

  try {
    isSharing.value = true;
    shareButtonText.value = 'Sharing...';

    let code = await uploadToPastebin(fileSystemProvider);

    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${code}`;
    await navigator.clipboard.writeText(shareUrl);

    shareButtonText.value = 'URL Copied!';

    setTimeout(() => {
      isSharing.value = false;
      shareButtonText.value = null;
    }, 2000);

  } catch (error) {
    console.error('Share failed:', error);

    shareButtonText.value = 'Failed';
    setTimeout(() => {
      isSharing.value = false;
      shareButtonText.value = null;
    }, 2000);
  }
}

async function handleEmptyClicked() {
  if (confirm(`Are you sure to empty current workspace? This cannot be reverted.`)) {
    await fileSystemProvider.empty()
  }
}

async function loadExtensionAssets() {
  const assetMap = {
    './syntaxes/language-configuration.json': () => import('./assets/tinymist-assets/syntaxes/language-configuration.json?raw'),
    './syntaxes/typst-markdown-injection.json': () => import('./assets/tinymist-assets/syntaxes/typst-markdown-injection.json?raw'),
    './out/typst.tmLanguage.json': () => import('./assets/tinymist-assets/out/typst.tmLanguage.json?raw'),
    './out/typst-code.tmLanguage.json': () => import('./assets/tinymist-assets/out/typst-code.tmLanguage.json?raw'),
    // './icons/ti-white.png': () => import('./assets/tinymist-assets/icons/ti-white.png?raw'),
    // './icons/ti.png': () => import('./assets/tinymist-assets/icons/ti.png?raw'),
    // './icons/typst-small.png': () => import('./assets/tinymist-assets/icons/typst-small.png?raw'),
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

async function getClientConfig() {
  const extensionFilesOrContents = await loadExtensionAssets();
  const config = {
    $type: 'extended',
    logLevel: LogLevel.Debug,
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
          'files.autoSave': AutoSaveConfiguration.OFF
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
            folderUri: defaultWorkspaceUri,
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
            ],
            initializationOptions: {
              formatterMode: "typstyle"
            }
          },
          connection: {
            options: {
              $type: 'WorkerDirect',
              worker: worker.worker
            },
            messageTransports: {
              reader: reader.value,
              writer: writer.value
            }
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

async function loadWorkspace(fileSystemProvider) {
  await fileSystemProvider.createDirectory(defaultWorkspaceUri);
  let res = null;
  for (const workspaceFile of resourceLoader.getWorkspaceFiles()) {
    let doc = await fileSystemProvider.addFileToWorkspace(
      resolve(defaultWorkspacePath, workspaceFile.path),
      workspaceFile.data
    );
    if (workspaceFile.path === defaultEntryFilePath) {
      res = doc
    }
  }

  if (!res) {
    return await fileSystemProvider.empty()
  }

  return res
}

async function startTinymistClient() {
  const { reader: tmpReader, writer: tmpWriter } = await worker.startTinymistServer();
  reader.value = tmpReader;
  writer.value = tmpWriter

  const config = await getClientConfig();

  wrapper = new MonacoEditorLanguageClientWrapper();
  fileSystemProvider = await createFileSystemProvider();

  await wrapper.init(config);

  let defaultDocument = await loadWorkspace(fileSystemProvider);
  await vscode.window.showTextDocument(defaultDocument, { preserveFocus: true });

  await wrapper.startLanguageClients();

  await worker.waitRegisterCapability();
  await worker.waitRegisterCapability();
  await worker.waitRegisterCapability();

  await doPreview();
};

function handleBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
  return 'Are you sure to leave? You changes won\'t be saved.'
}

const urlParams = new URLSearchParams(window.location.search)
const code = urlParams.get('code')
onMounted(async () => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('beforeunload', handleBeforeUnload)
  worker = new TinymistLSPWorker()
  worker.startWorker();
  try {
    await resourceLoader.loadAll(worker, code);
    resourcesLoaded.value = true;
  } catch (error) {
    console.error('Failed to load resources:', error);
  }
  startTinymistClient()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  wrapper.dispose();
})
</script>
