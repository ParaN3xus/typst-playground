/* eslint-disable no-unused-vars */

import {
  BrowserMessageReader,
  BrowserMessageWriter,
  MessageTransports,
} from "vscode-languageclient/browser";

export interface WorkerMessage {
  method: string;
  params?: {
    type?: string;
    content?: any;
    data?: any;
  };
}

export interface FontData {
  name?: string;
  data: ArrayBuffer | Uint8Array;
}

export declare class TinymistLSPWorker {
  public worker: Worker | null;
  private reader: BrowserMessageReader | null;
  private writer: BrowserMessageWriter | null;

  constructor();

  startWorker(): Promise<Worker>;

  loadWasm(): Promise<void>;

  loadFonts(fonts: FontData[]): Promise<void>;

  startTinymistServer(): Promise<MessageTransports>;

  sendWorkerMessage(type: string, content: any): void;

  private _waitWorkerMessageInner(
    condition: (data: WorkerMessage) => boolean,
    timeout: number,
    errorMessage?: string
  ): Promise<WorkerMessage>;

  waitWorkerMessage(type: string, timeout?: number): Promise<WorkerMessage>;
}
