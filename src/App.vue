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
import { configureDefaultWorkerFactory } from 'monaco-editor-wrapper/workers/workerLoaders';

import workerUrl from './lsp-worker.js?worker&url';

import typstLanguageConfig from './assets/typst-configuration.json?raw';
import typstTextmateGrammar from './assets/typst-textmate-grammar.json?raw';
import tinymistPackage from './assets/tinymist-package.json';

const editorContainer = ref(null)
let wrapper = null;

let text = `
#fff

= Test
Welcome to the \`tinymist-wasm\` playground!

This is a *test*.

#let x = 1

#let f(x, y) = x + y

#f(1, 2)

`

const documentUri = '/workspace/main.typ'


async function setupClient(
    worker,
    messageTransports
) {
    const extensionFilesOrContents = new Map();
    extensionFilesOrContents.set('/typst-textmate-grammar.json', typstTextmateGrammar);
    extensionFilesOrContents.set('/typst-configuration.json', typstLanguageConfig);

    const config = {
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
                    'vitest.disableWorkspaceWarning': true,
                    "editor.codeLens": false
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

    // console.log(config)
    return config;
};

async function startTinymistClient() {
    let worker = new Worker(workerUrl, {
        type: 'module',
        name: 'Tinymist LS',
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
    wrapper.dispose();
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
