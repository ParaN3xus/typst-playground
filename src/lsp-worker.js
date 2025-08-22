import {
    createConnection,
    BrowserMessageReader,
    BrowserMessageWriter,
} from "vscode-languageserver/browser";
import { InitializeRequest } from "vscode-languageserver";
import init, { TinymistLanguageServer, ProxyContext } from "tinymist";
import { Buffer } from 'buffer';
import { normalize } from 'pathe';
import fonts from 'virtual:fonts'

class VFS {
    constructor() {
        this.files = new Map();
    }

    normalizePath(filePath) {
        let normalized = normalize(filePath);
        if (!normalized.startsWith('/')) {
            normalized = '/' + normalized;
        }
        return normalized;
    }

    set(filePath, content, mtime) {
        const normalizedPath = this.normalizePath(filePath);
        this.files.set(normalizedPath, {
            content: content,
            mtime: mtime,
            size: content.length
        });
    }

    get(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        return this.files.get(normalizedPath);
    }

    has(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        return this.files.has(normalizedPath);
    }

    delete(filePath) {
        const normalizedPath = this.normalizePath(filePath);
        return this.files.delete(normalizedPath);
    }

    keys() {
        return Array.from(this.files.keys());
    }

    clear() {
        this.files.clear();
    }

    size() {
        return this.files.size;
    }
}
class TinymistServer {
    constructor(fonts) {
        const reader = new BrowserMessageReader(self);
        const writer = new BrowserMessageWriter(self);
        this.connection = createConnection(
            reader,
            writer,
        );

        reader.listen((message) => {
            console.log('Editor -> LSP:', message);
        });
        this.bridge = null;
        this.events = [];
        this.vfs = new VFS();
        this.packageRegistry = null;
        this.proxyContext = null;
        this.resolvePackage = null;
        this.fonts = fonts;
        this.packageResolveCache = new Map();
    }

    async start() {
        await init();
        console.log(`tinymist ${TinymistLanguageServer.version()} wasm is loaded!`);

        this.initializePackageRegistry();
        this.initializeBridge();
        this.setupConnectionHandlers();

        this.connection.sendNotification("serverWorkerReady");
        this.connection.listen();
    }

    initializePackageRegistry() {
        this.resolvePackage = (spec) => {
            const packageKey = `${spec.namespace}/${spec.name}-${spec.version}`;
            const packageRoot = `/packages/${spec.namespace}/${spec.name}/${spec.version}`;

            if (this.vfs.has(`${packageRoot}/.resolved`)) {
                console.log(`Package ${packageKey} already resolved, returning cached result`);
                return packageRoot;
            }

            if (this.packageResolveCache.has(packageKey)) {
                console.log(`Package ${packageKey} is being resolved, waiting...`);
                throw new Error(`Package ${packageKey} is being downloaded, please retry`);
            }

            const url = `https://packages.typst.org/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;
            console.log(`Downloading: ${url}`);

            const resolvePromise = this.downloadAndExtractPackage(url, packageRoot);
            this.packageResolveCache.set(packageKey, resolvePromise);

            resolvePromise.finally(() => {
                this.packageResolveCache.delete(packageKey);
            });

            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, false);
                xhr.responseType = 'arraybuffer';
                xhr.send();

                if (xhr.status !== 200) {
                    this.packageResolveCache.delete(packageKey);
                    throw new Error(`Download failed: ${xhr.status} ${xhr.statusText}`);
                }

                const tarGzData = new Uint8Array(xhr.response);
                console.log(`Downloaded: ${tarGzData.length} bytes`);

                const callback = (filename, fileContent, mtime) => {
                    const vfsPath = `${packageRoot}/${filename}`;
                    this.vfs.set(vfsPath, fileContent, mtime);
                };

                this.proxyContext.untar(tarGzData, callback);

                this.vfs.set(`${packageRoot}/.resolved`, new Uint8Array(0), Date.now());

                console.log(`Package ${packageKey} resolved successfully`);
                return packageRoot;

            } catch (error) {
                this.packageResolveCache.delete(packageKey);
                throw error;
            }
        };

        this.proxyContext = new ProxyContext({});
    }

    async downloadAndExtractPackage(url, packageRoot) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';

            xhr.onload = () => {
                if (xhr.status !== 200) {
                    reject(new Error(`Download failed: ${xhr.status} ${xhr.statusText}`));
                    return;
                }

                try {
                    const tarGzData = new Uint8Array(xhr.response);
                    console.log(`Downloaded: ${tarGzData.length} bytes`);

                    const callback = (filename, fileContent, mtime) => {
                        const vfsPath = `${packageRoot}/${filename}`;
                        this.vfs.set(vfsPath, fileContent, mtime);
                    };

                    this.proxyContext.untar(tarGzData, callback);

                    this.vfs.set(`${packageRoot}/.resolved`, new Uint8Array(0), Date.now());

                    resolve(packageRoot);
                } catch (error) {
                    reject(error);
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error'));
            };

            xhr.send();
        });
    }

    initializeBridge() {
        this.bridge = new TinymistLanguageServer({
            sendEvent: (event) => {
                this.events.push(event)
            },
            sendRequest: ({ id, method, params }) => {
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
                this.connection.sendNotification(method, params)
            },
            resolveFn: this.resolvePackage,
            extraFonts: this.fonts
        });
    }

    getFsContent(path) {
        console.log("Reading file", path);

        try {
            console.log("file exists, returning", path);
            if (this.vfs.has(path)) {
                const content = this.vfs.get(path).content;
                const base64String = Buffer.from(content).toString('base64');

                return {
                    content: base64String,
                    exists: true
                };
            }
        }
        catch (e) {
            console.error("err when reading file: ", e)
            return { content: '' }
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

const server = new TinymistServer(await Promise.all(fonts.map(font => font.getData())));
server.start();
