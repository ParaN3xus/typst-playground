import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageserver/browser";
import { InitializeRequest } from "vscode-languageserver";
import init, { TinymistLanguageServer } from "tinymist";
import { defaultPackagePath } from "@/fs-provider/path-constants.mjs";

function sendWorkerMessage(type, content) {
  self.postMessage({
    method: "worker",
    params: {
      type: type,
      content: content,
    },
  });
}

class TinymistServer {
  constructor() {
    this.bridge = null;
    this.events = [];
    this.packageRegistry = null;
    this.proxyContext = null;
    this.resolvePackage = null;
    this.connection = null;
    this.fonts = [];

    self.addEventListener("message", (event) =>
      this.handleWorkerMessages(event)
    );
  }

  async handleWorkerMessages(event) {
    if (event.data.method !== "worker") {
      return;
    }

    const params = event.data.params;
    const type = params.type;
    const content = params.content;
    switch (type) {
      case "loadFonts":
        this.fonts = content.fonts;
        console.log(`${this.fonts.length} fonts were loaded to worker!`);
        sendWorkerMessage("fontsLoaded", null);
        break;
      case "start":
        await this.start();
        console.log(`Worker started!`);
        break;
      case "loadWASM":
        await this.loadWasm();
        break;
      case "scheduleAsync":
        this.bridge.schedule_async();
        console.warn("schedule_async");
        break;
    }
  }

  async start() {
    this.initializePackageRegistry();
    this.setupConnection();
    this.initializeBridge();
    this.setupConnectionHandlers();

    sendWorkerMessage("serverWorkerReady", null);
    this.connection.listen();
  }

  async loadWasm() {
    try {
      await init();
      console.log(
        `tinymist ${TinymistLanguageServer.version()} wasm is loaded!`
      );
      sendWorkerMessage("WASMLoaded", null);
    } catch (e) {
      console.error(e);
    }
  }

  initializePackageRegistry() {
    this.resolvePackage = (spec) => {
      console.log("resolving package", spec);
      const packageRoot = `${defaultPackagePath}/${spec.namespace}/${spec.name}/${spec.version}`;
      const url = `https://packages.typst.org/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;

      sendWorkerMessage("resolvePackage", {
        url: url,
        packageRoot: packageRoot,
      });

      return packageRoot;
    };
  }

  setupConnection() {
    const reader = new BrowserMessageReader(self);
    const writer = new BrowserMessageWriter(self);
    this.connection = createConnection(reader, writer);

    reader.listen((message) => {
      console.debug("Editor -> LSP:", message);
    });
  }

  handleEvents = (res) => {
    while (this.events.length > 0) {
      const event = this.events.shift();
      this.bridge?.on_event(event);
    }
    return res;
  };

  initializeBridge() {
    this.bridge = new TinymistLanguageServer({
      sendEvent: (event) => {
        this.events.push(event);
        queueMicrotask(() => {
          this.handleEvents(null);
          this.bridge.schedule_async();
        });
      },
      sendRequest: ({ id, method, params }) => {
        this.connection
          .sendRequest(method, params)
          .then((result) => this.bridge?.on_response({ id, result }))
          .catch((err) =>
            this.bridge?.on_response({
              id,
              error: { code: -32603, message: err.toString() },
            })
          );
      },
      sendNotification: ({ method, params }) => {
        this.connection.sendNotification(method, params);
      },
      resolveFn: this.resolvePackage,
      extraFonts: this.fonts,
    });
  }

  setupConnectionHandlers() {
    this.connection.onInitialize((params) =>
      this.handleEvents(
        this.bridge?.on_request(InitializeRequest.method, params)
      )
    );

    this.connection.onRequest((method, params) => {
      return this.handleEvents(this.bridge?.on_request(method, params));
    });

    this.connection.onNotification((method, params) => {
      if (method === "workspace/didChangeConfiguration") {
        console.log("didChangeCOnfiguration, skipping");
        return;
      }
      if (method === "worker") {
        console.log("worker msg, skipping");
        return;
      }
      return this.handleEvents(this.bridge?.on_notification(method, params));
    });
  }
}

new TinymistServer();
sendWorkerMessage("serverWorkerInited", null);
