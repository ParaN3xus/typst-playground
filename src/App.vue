<template>
    <div id="app">
        <h1>Tinymist WASM Playground</h1>
        <div id="editor" ref="editorContainer"></div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import { LogLevel } from '@codingame/monaco-vscode-api';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageclient/browser';
import workerUrl from './lsp-worker.js?worker&url';
import { configureDefaultWorkerFactory } from 'monaco-editor-wrapper/workers/workerLoaders';

import typstLanguageConfig from './assets/typst.configuration.json?raw';
import typstTextmateGrammar from './assets/typst.tmLanguage.json?raw';

const editorContainer = ref(null)
let wrapper = null;

let text = '= Hello Tinymist\n\nThis is a *test* document with some content.\n\n= Section\n\nLet me write some code:\n\n```typst\nlet x = 1\n#x\n```\n\nHover over any text to see LSP features work.'
const documentUri = 'file:///workspace/example.typ'

const checkStarted = () => {
    if (wrapper?.isStarted() ?? false) {
        alert('Editor was already started!\nPlease reload the page to test the alternative editor.');
        return true;
    }
    return false;
};

async function setupClient(
    worker,
    messageTransports
) {
    const extensionFilesOrContents = new Map();
    extensionFilesOrContents.set('/typst-textmate-grammar.json', typstTextmateGrammar);
    extensionFilesOrContents.set('/typst-configuration.json', typstLanguageConfig);

    return {
        $type: 'extended',
        htmlContainer: editorContainer.value,
        logLevel: LogLevel.Debug,
        vscodeApiConfig: {
            serviceOverrides: {
                ...getKeybindingsServiceOverride()
            },
            userConfiguration: {
                json: JSON.stringify({
                    'workbench.colorTheme': 'Default Dark Modern',
                    'editor.guides.bracketPairsHorizontal': 'active',
                    'editor.wordBasedSuggestions': 'off',
                    'editor.experimental.asyncTokenization': false,
                    'vitest.disableWorkspaceWarning': true
                })
            }
        },
        extensions: [{
            config: {
                name: 'tinymist-wasm',
                publisher: 'paran3xus',
                version: '1.0.0',
                engines: {
                    vscode: '*'
                },
                contributes: {
                    languages: [{
                        id: 'typst',
                        extensions: ['.typ'],
                        aliases: ['typst', 'Typst'],
                        configuration: './typst-configuration.json'
                    }],
                    grammars: [{
                        language: 'typst',
                        scopeName: 'source.typst',
                        path: './typst-textmate-grammar.json'
                    }]
                }
            },
            filesOrContents: extensionFilesOrContents
        }],
        editorAppConfig: {
            codeResources: {
                modified: {
                    text,
                    uri: documentUri
                }
            },
            monacoWorkerFactory: configureDefaultWorkerFactory,
        },
        languageClientConfigs: {
            configs: {
                typst: {
                    clientOptions: {
                        documentSelector: [
                            'typst'
                        ],
                        synchronize: {
                            fileEvents: []
                        }
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
};


async function startTinymistClient() {
    if (checkStarted()) return;
    let worker = new Worker(workerUrl, {
        type: 'module',
        name: 'Tinymist LS',
    });
    const reader = new BrowserMessageReader(worker);
    const writer = new BrowserMessageWriter(worker);
    reader.listen((message) => {
        console.log('Received message from worker:', message);
    });

    const config = await setupClient(
        worker,
        { reader: reader, writer: writer }
    );

    wrapper = new MonacoEditorLanguageClientWrapper();
    await wrapper.initAndStart(config);
};

onMounted(async () => {
    startTinymistClient()
})

onUnmounted(() => {
})
</script>

<style>
#app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: Arial, sans-serif;
}

h1 {
    margin: 0;
    padding: 1rem;
    background: #1e1e1e;
    color: white;
    text-align: center;
}


#editor {
    flex: 1;
    min-height: 0;
}
</style>
