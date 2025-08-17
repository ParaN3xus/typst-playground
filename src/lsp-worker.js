import {
    createConnection,
    BrowserMessageReader,
    BrowserMessageWriter,
} from "vscode-languageserver/browser";
import { InitializeRequest } from "vscode-languageserver";
import init, { TinymistLanguageServer } from "tinymist";

class TinymistServer {
    constructor() {
        this.connection = createConnection(
            new BrowserMessageReader(self),
            new BrowserMessageWriter(self),
        );
        this.bridge = null;
        this.events = [];
        this.fileCache = new Map();
    }

    async start() {
        await init();
        console.log(`tinymist ${TinymistLanguageServer.version()} wasm is loaded...`);

        this.initializeBridge();
        this.setupConnectionHandlers();

        this.connection.sendNotification("serverWorkerReady");
        this.connection.listen();
    }

    initializeBridge() {
        this.bridge = new TinymistLanguageServer({
            sendEvent: (event) => {
                console.log("do sendEvent", event);
                this.events.push(event)
            },
            sendRequest: ({ id, method, params }) => {
                console.log("do sendRequest", id, method, params);
                this.connection
                    .sendRequest(method, params)
                    .then((result) => this.bridge?.on_response({ id, result }))
                    .catch((err) =>
                        this.bridge?.on_response({
                            id,
                            error: { code: -32603, message: err.toString() }
                        }),
                    );
            },
            fsContent: (path) => this.getFsContent(path),
            sendNotification: ({ method, params }) => {
                console.log("do sendNotification", method, params);
                this.connection.sendNotification(method, params)
            },
        });
    }

    getFsContent(path) {
        console.log("do fsContent", path);

        if (this.fileCache.has(path)) {
            console.log("File content found in cache:", path);
            return this.fileCache.get(path);
        }

        return { content: '', exists: false };
    }

    setupConnectionHandlers() {
        const handleResponse = (res) => {
            for (const event of this.events.splice(0)) {
                this.bridge?.on_event(event);
            }
            return res;
        };

        this.connection.onInitialize((params) =>
            handleResponse(this.bridge?.on_request(InitializeRequest.method, params))
        );

        this.connection.onRequest((method, params) =>
            handleResponse(this.bridge?.on_request(method, params))
        );

        this.connection.onNotification((method, params) =>
            handleResponse(this.bridge?.on_notification(method, params))
        );
    }
}

const server = new TinymistServer();
server.start();
