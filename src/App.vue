<template>
    <div id="app">
        <h1>Tinymist WASM Playground</h1>
        <div class="status">
            <span :class="['status-indicator', statusClass]"></span>
            LSP Status: {{ lspStatus }}
        </div>
        <div id="editor" ref="editorContainer"></div>
    </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as monaco from 'monaco-editor'

import { TokensProviderCache, convertTheme } from './textmate/index';
import darkPlusTheme from './textmate/themes/dark-plus.json';
import languageConfiguration from "./assets/language-configuration.json";



const editorContainer = ref(null)
const lspStatus = ref('initializing')
const statusClass = ref('status-connecting')

let editor = null
let worker = null
let requestId = 0

const documentUri = 'file:///workspace/example.typ'

let documentVersion = 0


// lsp utils
function createLSPRequest(method, params = {}) {
    return {
        jsonrpc: '2.0',
        id: ++requestId,
        method,
        params
    }
}

function sendLSPNotification(method, params = {}) {
    if (worker) {
        worker.postMessage({
            jsonrpc: '2.0',
            method,
            params
        })
    }
}

function sendLSPRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
        if (!worker) {
            reject(new Error('Worker not available'))
            return
        }

        const request = createLSPRequest(method, params)
        const timeoutId = setTimeout(() => {
            reject(new Error('Request timeout'))
        }, 10000)

        const handler = (event) => {
            const { data } = event
            if (data.jsonrpc === '2.0' && data.id === request.id) {
                clearTimeout(timeoutId)
                worker.removeEventListener('message', handler)

                if (data.error) {
                    reject(new Error(data.error.message))
                } else {
                    resolve(data.result)
                }
            }
        }

        worker.addEventListener('message', handler)
        worker.postMessage(request)
    })
}


async function initializeLSPWorker() {
    try {
        worker = new Worker(new URL('./lsp-worker.js', import.meta.url), { type: 'module' })

        worker.onmessage = (event) => {
            const { data } = event

            if (data.type === 'status') {
                if (data.status === 'ready') {
                    lspStatus.value = 'ready'
                    statusClass.value = 'status-ready'
                    initializeLSPServer()
                }
            } else if (data.type === 'error') {
                console.error('Worker error:', data.error)
                lspStatus.value = 'error'
                statusClass.value = 'status-error'
            } else if (data.type === 'notification') {
                console.log('Received notification:', data.method, data.params)
            } else if (data.type === 'request') {
                handleServerRequest(data)
            }
        }

        worker.onerror = (error) => {
            console.error('Worker error:', error)
            lspStatus.value = 'error'
            statusClass.value = 'status-error'
        }

    } catch (error) {
        console.error('Failed to create worker:', error)
        lspStatus.value = 'error'
        statusClass.value = 'status-error'
    }
}

async function initializeLSPServer() {
    if (!worker) return

    try {
        const initParams = {
            processId: null,
            clientInfo: { name: 'Monaco Typst Editor', version: '1.0.0' },
            rootUri: 'file:///workspace/',
            capabilities: {
                textDocument: {
                    publishDiagnostics: { relatedInformation: true },
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            insertReplaceSupport: true,
                            resolveSupport: {
                                properties: ['documentation', 'detail']
                            }
                        }
                    },
                    hover: { contentFormat: ['markdown', 'plaintext'] },
                    formatting: {},
                    onTypeFormatting: {
                        firstTriggerCharacter: '}',
                        moreTriggerCharacter: [']', ')']
                    }
                }
            },
            initializationOptions: {
                formatterMode: 'typstyle',
                formatterPrintWidth: 120,
                formatterIndentSize: 2,
                onEnterEvent: true,
                typingContinueCommentsOnNewline: true,
                completion: {
                    triggerOnSnippetPlaceholders: false,
                    symbol: 'step',
                    postfix: true
                }
            }
        }

        await sendLSPRequest('initialize', initParams)
        sendLSPNotification('initialized', {})

        lspStatus.value = 'connected'
        statusClass.value = 'status-connected'

        openDocument()
        setupDocumentSync()
    } catch (error) {
        console.error('LSP initialization failed:', error)
        lspStatus.value = 'error'
        statusClass.value = 'status-error'
    }
}


async function handleServerRequest(data) {
    const { id, method, params } = data
    let result = null
    let error = null

    try {
        switch (method) {
            case 'client/registerCapability':
                result = null
                break
            case 'window/showMessage':
                console.log('Server message:', params.message)
                result = null
                break
            default:
                console.warn('Unhandled server request:', method)
                result = null
        }
    } catch (err) {
        error = { code: -32603, message: err.message }
    }

    worker.postMessage({
        type: 'response',
        id,
        result,
        error
    })
}


function openDocument() {
    const content = editor.getValue()
    documentVersion = 1

    if (worker) {
        worker.postMessage({
            type: 'openDocument',
            content: content
        })
    }

    sendLSPNotification('textDocument/didOpen', {
        textDocument: {
            uri: documentUri,
            languageId: 'typst',
            version: documentVersion,
            text: content
        }
    })
}

function setupDocumentSync() {
    if (!editor) return
    editor.onDidChangeModelContent((event) => {
        documentVersion++
        const currentContent = editor.getValue()

        const changes = event.changes.map(change => ({
            range: {
                start: {
                    line: change.range.startLineNumber - 1,
                    character: change.range.startColumn - 1
                },
                end: {
                    line: change.range.endLineNumber - 1,
                    character: change.range.endColumn - 1
                }
            },
            text: change.text
        }))
        if (worker) {
            worker.postMessage({
                type: 'updateFileContent',
                uri: documentUri,
                content: currentContent
            })
        }
        sendLSPNotification('textDocument/didChange', {
            textDocument: {
                uri: documentUri,
                version: documentVersion
            },
            contentChanges: changes
        })
    })
}


async function getHover(position) {
    try {
        const result = await sendLSPRequest('textDocument/hover', {
            textDocument: { uri: documentUri },
            position: {
                line: position.lineNumber - 1,
                character: position.column - 1
            }
        })
        return result
    } catch (error) {
        console.error('Hover failed:', error)
        return null
    }
}

async function getCompletions(position, context) {
    if (lspStatus.value !== 'connected') return null

    try {
        const params = {
            textDocument: { uri: documentUri },
            position: {
                line: position.lineNumber - 1,
                character: position.column - 1
            }
        }

        // add context
        if (context) {
            params.context = {
                triggerKind: context.triggerKind,
                triggerCharacter: context.triggerCharacter
            }
        }

        return await sendLSPRequest('textDocument/completion', params)
    } catch (error) {
        console.error('Completion request failed:', error)
        return null
    }
}


async function initializeEditor() {
    monaco.languages.register({ id: 'typst' })
    monaco.languages.setLanguageConfiguration(
        'typst',
        languageConfiguration,
    );

    const theme = convertTheme(darkPlusTheme);
    monaco.editor.defineTheme('dark-plus', theme);

    editor = monaco.editor.create(editorContainer.value, {
        value: '= Hello Typst\n\nThis is a *bold* text and _italic_ text.\n\n== Math\n\n$ sum_(i=1)^n i = (n(n+1))/2 $\n\n#lorem(50)',
        language: 'typst',
        theme: 'dark-plus',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        tabSize: 2,
        insertSpaces: true,
        detectIndentation: false,
        autoIndent: 'advanced',
        formatOnType: true,
        formatOnPaste: true,
        matchBrackets: 'always',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        folding: true,
        foldingStrategy: 'indentation',
        'semanticHighlighting.enabled': true,
    })

    const cache = new TokensProviderCache(editor);
    cache.getTokensProvider('source.typst').then((tokensProvider) => {
        monaco.languages.setTokensProvider('typst', tokensProvider);
    });

    monaco.languages.registerCompletionItemProvider('typst', {
        triggerCharacters: ['.', '#', '@', '$', '\\', '/', ' '],
        provideCompletionItems: async (model, position, context) => {
            const completions = await getCompletions(position, context)

            if (!completions || !completions.items) {
                return { suggestions: [] }
            }

            const suggestions = completions.items.map(item => {
                const suggestion = {
                    label: item.label,
                    kind: getCompletionItemKind(item.kind),
                    detail: item.detail,
                    documentation: item.documentation,
                    filterText: item.filterText,
                    sortText: item.sortText,
                    preselect: item.preselect
                }

                // box[123].|  ->  block(
                if (item.textEdit) {
                    suggestion.range = new monaco.Range(
                        item.textEdit.range.start.line + 1,
                        item.textEdit.range.start.character + 1,
                        item.textEdit.range.end.line + 1,
                        item.textEdit.range.end.character + 1
                    )
                    suggestion.insertText = item.textEdit.newText
                } else {
                    // common edit
                    suggestion.insertText = item.insertText || item.label

                    if (item.insertTextMode === 2) {
                        suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.KeepWhitespace
                    }
                }

                // code snippets
                if (item.insertTextFormat === 2) {
                    suggestion.insertTextRules = (suggestion.insertTextRules || 0) |
                        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                }

                // extra edits
                if (item.additionalTextEdits && item.additionalTextEdits.length > 0) {
                    suggestion.additionalTextEdits = item.additionalTextEdits.map(edit => ({
                        range: new monaco.Range(
                            edit.range.start.line + 1,
                            edit.range.start.character + 1,
                            edit.range.end.line + 1,
                            edit.range.end.character + 1
                        ),
                        text: edit.newText
                    }))
                }

                // commands
                if (item.command) {
                    suggestion.command = {
                        id: item.command.command,
                        title: item.command.title,
                        arguments: item.command.arguments
                    }
                }

                return suggestion
            })

            return { suggestions }
        }
    })


    monaco.languages.registerHoverProvider('typst', {
        provideHover: async (model, position) => {
            const hoverInfo = await getHover(position)

            if (!hoverInfo || !hoverInfo.contents) {
                return null
            }
            return {
                range: hoverInfo.range ? new monaco.Range(
                    hoverInfo.range.start.line + 1,
                    hoverInfo.range.start.character + 1,
                    hoverInfo.range.end.line + 1,
                    hoverInfo.range.end.character + 1
                ) : undefined,
                contents: Array.isArray(hoverInfo.contents)
                    ? hoverInfo.contents.map(content => ({ value: content.value || content }))
                    : [{ value: hoverInfo.contents.value || hoverInfo.contents }]
            }
        }
    })

    monaco.languages.registerDefinitionProvider('typst', {
        provideDefinition: async (model, position) => {
            try {
                const result = await sendLSPRequest('textDocument/definition', {
                    textDocument: { uri: documentUri },
                    position: {
                        line: position.lineNumber - 1,
                        character: position.column - 1
                    }
                })
                if (!result || !Array.isArray(result)) {
                    return []
                }
                return result.map(location => ({
                    uri: monaco.Uri.parse(location.uri),
                    range: new monaco.Range(
                        location.range.start.line + 1,
                        location.range.start.character + 1,
                        location.range.end.line + 1,
                        location.range.end.character + 1
                    )
                }))
            } catch (error) {
                console.error('Definition failed:', error)
                return []
            }
        }
    })

    monaco.languages.registerDocumentFormattingEditProvider('typst', {
        provideDocumentFormattingEdits: async (model) => {
            try {
                const result = await sendLSPRequest('textDocument/formatting', {
                    textDocument: { uri: documentUri },
                    options: {
                        tabSize: 2,
                        insertSpaces: true
                    }
                })
                if (!result || !Array.isArray(result)) {
                    return []
                }
                return result.map(edit => ({
                    range: new monaco.Range(
                        edit.range.start.line + 1,
                        edit.range.start.character + 1,
                        edit.range.end.line + 1,
                        edit.range.end.character + 1
                    ),
                    text: edit.newText
                }))
            } catch (error) {
                console.error('Formatting failed:', error)
                return []
            }
        }
    })
}

// LSP CompletionItemKind -> Monaco CompletionItemKind
function getCompletionItemKind(lspKind) {
    const kindMap = {
        1: monaco.languages.CompletionItemKind.Text,
        2: monaco.languages.CompletionItemKind.Method,
        3: monaco.languages.CompletionItemKind.Function,
        4: monaco.languages.CompletionItemKind.Constructor,
        5: monaco.languages.CompletionItemKind.Field,
        6: monaco.languages.CompletionItemKind.Variable,
        7: monaco.languages.CompletionItemKind.Class,
        8: monaco.languages.CompletionItemKind.Interface,
        9: monaco.languages.CompletionItemKind.Module,
        10: monaco.languages.CompletionItemKind.Property,
        11: monaco.languages.CompletionItemKind.Unit,
        12: monaco.languages.CompletionItemKind.Value,
        13: monaco.languages.CompletionItemKind.Enum,
        14: monaco.languages.CompletionItemKind.Keyword,
        15: monaco.languages.CompletionItemKind.Snippet,
        16: monaco.languages.CompletionItemKind.Color,
        17: monaco.languages.CompletionItemKind.File,
        18: monaco.languages.CompletionItemKind.Reference,
        19: monaco.languages.CompletionItemKind.Folder,
        20: monaco.languages.CompletionItemKind.EnumMember,
        21: monaco.languages.CompletionItemKind.Constant,
        22: monaco.languages.CompletionItemKind.Struct,
        23: monaco.languages.CompletionItemKind.Event,
        24: monaco.languages.CompletionItemKind.Operator,
        25: monaco.languages.CompletionItemKind.TypeParameter
    }
    return kindMap[lspKind] || monaco.languages.CompletionItemKind.Text
}
onMounted(async () => {
    await initializeEditor()
    await initializeLSPWorker()
})
onUnmounted(() => {
    if (worker) {
        sendLSPNotification('textDocument/didClose', {
            textDocument: { uri: documentUri }
        })

        sendLSPNotification('shutdown', {})
        sendLSPNotification('exit', {})

        worker.terminate()
    }
    if (editor) {
        editor.dispose()
    }
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

.status {
    padding: 0.5rem 1rem;
    background: #2d2d30;
    color: white;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.status-connecting {
    background-color: #ffa500;
}

.status-ready {
    background-color: #90EE90;
}

.status-connected {
    background-color: #00ff00;
}

.status-error {
    background-color: #ff0000;
}

#editor {
    flex: 1;
    min-height: 0;
}
</style>
