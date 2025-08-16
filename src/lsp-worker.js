import init, { TinymistLanguageServer } from "tinymist";

class TinymistLSPWorker {
    constructor() {
        this.server = null;
        this.requestHandlers = new Map();
        this.initialized = false;
        this.events = [];
        this.fileCache = new Map();
        this.currentDocumentContent = '';
    }

    async initialize() {
        try {
            await init();
            console.log('Tinymist WASM initialized');

            this.server = new TinymistLanguageServer({
                sendEvent: (event) => {
                    this.events.push(event);
                },
                sendRequest: async ({ id, method, params }) => {
                    try {
                        const response = await this.sendRequestToMain(method, params);
                        this.server.on_response({ id, result: response });
                    } catch (error) {
                        this.server.on_response({
                            id,
                            error: {
                                code: -32603,
                                message: error.toString()
                            }
                        });
                    }
                },
                sendNotification: ({ method, params }) => {
                    this.postMessage({
                        type: 'notification',
                        method,
                        params
                    });
                },
                fsContent: (path) => {
                    console.log('Requesting file content:', path);
                    return this.getFileContent(path);
                }
            });

            this.postMessage({ type: 'status', status: 'ready' });

        } catch (error) {
            console.error('Failed to initialize Tinymist:', error);
            this.postMessage({ type: 'error', error: error.message });
        }
    }
    getFileContent(path) {
        console.log('Getting file content for:', path);

        if (this.fileCache.has(path)) {
            const cached = this.fileCache.get(path);
            return cached;
        }

        // main document
        if (path === 'file:///workspace/example.typ') {
            const content = {
                content: this.currentDocumentContent,
                exists: true
            };
            return content;
        }

        // others
        if (path.startsWith('file:///workspace/')) {
            const content = { content: '', exists: false };
            this.fileCache.set(path, content);
            return content;
        }

        // others
        const content = { content: '', exists: false };
        this.fileCache.set(path, content);
        return content;
    }


    sendRequestToMain(method, params) {
        return new Promise((resolve, reject) => {
            const id = Date.now() + Math.random();
            const timeout = setTimeout(() => {
                this.requestHandlers.delete(id);
                reject(new Error('Request timeout'));
            }, 10000);

            this.requestHandlers.set(id, { resolve, reject, timeout });

            this.postMessage({
                type: 'request',
                id,
                method,
                params
            });
        });
    }

    async handleMessage(event) {
        const { data } = event;

        try {
            if (data.type === 'response') {
                const handler = this.requestHandlers.get(data.id);
                if (handler) {
                    clearTimeout(handler.timeout);
                    this.requestHandlers.delete(data.id);

                    if (data.error) {
                        handler.reject(new Error(data.error.message));
                    } else {
                        handler.resolve(data.result);
                    }
                }
                return;
            }

            if (data.type === 'updateFileContent') {
                this.updateFileContent(data.uri, data.content);
                return;
            }

            if (data.type === 'openDocument') {
                this.currentDocumentContent = data.content;
                this.fileCache.delete('file:///workspace/example.typ'); // clear cache
                console.log('Document opened, content length:', data.content.length);
                return;
            }

            if (!this.server) {
                console.warn('Server not initialized, ignoring message:', data);
                return;
            }

            let result = null;

            // handle msg
            if (data.method) {
                if (data.id !== undefined) {
                    // request -> wait for results
                    try {
                        result = await Promise.resolve(
                            this.server.on_request(data.method, data.params || {})
                        );
                    } catch (error) {
                        console.error('Error in on_request:', error);
                        this.postMessage({
                            jsonrpc: '2.0',
                            id: data.id,
                            error: {
                                code: -32603,
                                message: error.message
                            }
                        });
                        return;
                    }
                } else {
                    // notification -> no need to wait
                    try {
                        await Promise.resolve(
                            this.server.on_notification(data.method, data.params || {})
                        );
                    } catch (error) {
                        console.error('Error in on_notification:', error);
                        return;
                    }
                }
            }

            await this.processEvents();

            // request -> send response
            if (data.id !== undefined) {
                this.postMessage({
                    jsonrpc: '2.0',
                    id: data.id,
                    result: result
                });
            }

        } catch (error) {
            console.error('Error handling message:', error);

            if (data.id !== undefined) {
                this.postMessage({
                    jsonrpc: '2.0',
                    id: data.id,
                    error: {
                        code: -32603,
                        message: error.message
                    }
                });
            }
        }
    }

    async processEvents() {
        const events = this.events.splice(0);
        for (const event of events) {
            try {
                await Promise.resolve(this.server.on_event(event));
            } catch (error) {
                console.error('Error processing event:', error);
            }
        }
    }

    updateFileContent(uri, content) {
        if (uri === 'file:///workspace/example.typ') {
            this.currentDocumentContent = content;
        }

        this.fileCache.set(uri, {
            content: content,
            exists: true
        });
    }

    postMessage(message) {
        try {
            JSON.parse(JSON.stringify(message));
            self.postMessage(message);
        } catch (error) {
            console.error('Message not serializable:', message, error);
            self.postMessage({
                type: 'error',
                error: 'Message serialization failed: ' + error.message
            });
        }
    }
}

const worker = new TinymistLSPWorker();

self.onmessage = async (event) => {
    await worker.handleMessage(event);
};

worker.initialize();
