import workerUrl from "./lsp-worker-server.mjs?worker&url";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageclient/browser";

export class TinymistLSPWorker {
  constructor() {
    this.worker = null;
    this.reader = null;
    this.writer = null;
  }
  async startWorker() {
    this.worker = new Worker(workerUrl, {
      type: "module",
      name: "Tinymist LS",
    });
    await this.waitWorkerMessage("serverWorkerInited", 1000 * 60);
    return this.worker;
  }
  async loadWasm() {
    this.sendWorkerMessage("loadWASM", null);
    await this.waitWorkerMessage("WASMLoaded", 1000 * 60 * 3);
  }
  async loadFonts(fonts) {
    this.sendWorkerMessage("loadFonts", {
      fonts: fonts,
    });
    await this.waitWorkerMessage("fontsLoaded");
  }
  async startTinymistServer() {
    this.reader = new BrowserMessageReader(this.worker);
    this.writer = new BrowserMessageWriter(this.worker);
    this.reader.listen((message) => {
      if ("method" in message && message.method == "tmLog") {
        console.log("[Tinymist WASM Log]", message.params.data);
        return;
      }
      console.log("LSP -> Editor:", message);
    });

    this.sendWorkerMessage("start", null);
    await this.waitWorkerMessage("serverWorkerReady", 1000 * 60);

    return { reader: this.reader, writer: this.writer };
  }
  sendWorkerMessage(type, content) {
    this.worker.postMessage({
      method: "worker",
      params: {
        type: type,
        content: content,
      },
    });
  }
  _waitWorkerMessageInner(condition, timeout, errorMessage) {
    return new Promise((resolve, reject) => {
      const onMessage = (e) => {
        if (!condition(e.data)) return;

        this.worker.removeEventListener("message", onMessage);
        resolve(e.data);
        clearTimeout(workerTimeout);
      };

      const workerTimeout = setTimeout(() => {
        this.worker.removeEventListener("message", onMessage);
        reject(
          new Error(
            errorMessage || "Waiting for worker message failed: timeout"
          )
        );
      }, timeout);

      this.worker.addEventListener("message", onMessage);
    });
  }
  waitWorkerMessage(type, timeout = 5000) {
    const condition = (data) => {
      return (
        data.method === "worker" && data.params && data.params.type === type
      );
    };

    const errorMessage = `Waiting for worker message ${type} failed: timeout`;

    return this._waitWorkerMessageInner(condition, timeout, errorMessage);
  }
}
