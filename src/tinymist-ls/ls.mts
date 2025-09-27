import { TarFileType, TarReader } from "@gera2ld/tarjs";
import { Buffer } from "buffer";
import { MonacoLanguageClient } from "monaco-languageclient";
import pako from "pako";
import * as vscode from "vscode";
import {
	BrowserMessageReader,
	BrowserMessageWriter,
	RequestType,
} from "vscode-languageclient/browser";
import { FileSystemProvider } from "../fs-provider/fs-provider.mts";

export class TinymistLS {
	public worker: Worker | null = null;
	public lsClient: MonacoLanguageClient | null = null;
	public fsProvider: FileSystemProvider | null = null;
	public reader: BrowserMessageReader | null = null;
	public writer: BrowserMessageWriter | null = null;
	private watcher: vscode.FileSystemWatcher | null = null;
	private packagePromiseCache = new Map<string, Promise<void>>();
	constructor() {}
	async startWorker() {
		this.worker = new Worker(new URL("./ls-worker.mjs", import.meta.url), {
			type: "module",
			name: "Tinymist LS",
		});
		await this.waitWorkerMessage("serverWorkerInited", 1000 * 60);
		return this.worker;
	}
	async resolvePackage(url: string, packageRoot: string) {
		const existingPromise = this.packagePromiseCache.get(packageRoot);
		if (existingPromise) {
			return existingPromise;
		}
		const resolvePromise = this._doResolvePackage(url, packageRoot);
		this.packagePromiseCache.set(packageRoot, resolvePromise);

		return resolvePromise;
	}
	async _doResolvePackage(url: string, packageRoot: string) {
		console.log(`Downloading from: ${url}`);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		console.log(`Downloaded: ${arrayBuffer.byteLength} bytes`);

		const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
		const tarReader = await TarReader.load(decompressed.buffer);

		tarReader.fileInfos.forEach(async (fileInfo) => {
			if (fileInfo.type === TarFileType.Dir) {
				return; // dir will be created automatically when creating files inside
			}

			const fileUri = `${packageRoot}/${fileInfo.name}`;

			const blob = tarReader.getFileBlob(fileInfo.name);
			const fileContent = new Uint8Array(await blob.arrayBuffer());

			await this.fsProvider?.addFileToWorkspace(fileUri, fileContent, false);
		});

		console.log("Resolved!");
	}
	async loadWasm() {
		this.sendWorkerMessage("loadWASM", null);
		await this.waitWorkerMessage("WASMLoaded", 1000 * 60 * 3);
	}
	async loadFonts(fonts: any[]) {
		this.sendWorkerMessage("loadFonts", {
			fonts: fonts,
		});
		await this.waitWorkerMessage("fontsLoaded", 1000 * 60);
	}
	async startTinymistServer() {
		this.reader = new BrowserMessageReader(this.worker);
		this.writer = new BrowserMessageWriter(this.worker);
		this.reader.listen((message) => {
			if ("method" in message && message.method == "tmLog") {
				console.log("[Tinymist WASM Log]", message.params.data);
				return;
			}
			console.debug("LSP -> Editor:", message);
		});

		this.reader.listen(async (message) => {
			if (
				"method" in message &&
				message.method === "worker" &&
				"params" in message
			) {
				const params: any = message.params;
				if (params.type === "resolvePackage") {
					await this.resolvePackage(
						params.content.url,
						params.content.packageRoot,
					);
				}
			}
		});

		this.sendWorkerMessage("start", null);
		await this.waitWorkerMessage("serverWorkerReady", 1000 * 60);

		return { reader: this.reader, writer: this.writer };
	}
	async initWatcher() {
		const watches = new Set<string>();
		const hasRead = new Map<string, [number, FileResult | undefined]>();
		let watchClock = 0;

		const tryRead = async (uri: vscode.Uri) =>
			vscode.workspace.fs.readFile(uri).then(
				(data): FileResult => {
					return {
						type: "ok",
						content: Buffer.from(data).toString("base64"),
					} as const;
				},
				(err: any): FileResult => {
					console.error("Failed to read file", uri, err);
					return { type: "err", error: err.message as string } as const;
				},
			);
		const registerHasRead = (
			uri: string,
			currentClock: number,
			content?: FileResult,
		) => {
			const previous = hasRead.get(uri);
			if (previous && previous[0] >= currentClock) {
				return false;
			}
			hasRead.set(uri, [currentClock, content]);
			return true;
		};

		const registerWatcher = () => {
			if (this.watcher) {
				return this.watcher;
			}

			console.log("registering watcher");
			this.watcher = vscode.workspace.createFileSystemWatcher("**/*");

			const watchRead = async (currentClock: number, uri: vscode.Uri) => {
				// this.sendWorkerMessage("scheduleAsync", null);

				const uriStr = uri.toString();

				if (!watches.has(uriStr)) {
					return;
				}

				const content = await tryRead(uri);
				if (!registerHasRead(uriStr, currentClock, content)) {
					return;
				}

				const inserts: FileChange[] = [{ uri: uriStr, content }];
				const removes: string[] = [];

				this.lsClient?.sendRequest(fsChange, {
					inserts,
					removes,
					isSync: false,
				});
			};

			this.watcher?.onDidChange((uri) => {
				const currentClock = watchClock++;
				console.debug("fs change", uri, currentClock);
				watchRead(currentClock, uri);
			});
			this.watcher?.onDidCreate((uri) => {
				const currentClock = watchClock++;
				console.debug("fs create", uri, currentClock);
				watchRead(currentClock, uri);
			});
			this.watcher?.onDidDelete((uri) => {
				const currentClock = watchClock++;
				console.debug("fs delete", uri, currentClock);
				watchRead(currentClock, uri);
			});

			return this.watcher;
		};

		this.lsClient?.onRequest("tinymist/fs/watch", (params: FsWatchRequest) => {
			const currentClock = watchClock++;
			console.log(
				"fs watch request",
				params,
				vscode.workspace.workspaceFolders?.map((folder) =>
					folder.uri.toString(),
				),
			);

			const filesToRead = new Set<string>();
			const filesDeleted = new Set<string>();

			for (const path of params.inserts) {
				if (!watches.has(path)) {
					filesToRead.add(path);
					watches.add(path);
				}
			}

			for (const path of params.removes) {
				if (watches.has(path)) {
					filesDeleted.add(path);
					watches.delete(path);
				}
			}
			const removes: string[] = params.removes.filter((path) => {
				return (
					filesDeleted.has(path) &&
					registerHasRead(path, currentClock, undefined)
				);
			});

			(async () => {
				const paths = Array.from(filesToRead);
				const readFiles = await Promise.all(
					paths.map((path) => tryRead(vscode.Uri.parse(path))),
				);

				registerWatcher();

				const inserts: FileChange[] = paths
					.map((path, idx) => ({
						uri: path,
						content: readFiles[idx],
					}))
					.filter((change) =>
						registerHasRead(change.uri, currentClock, change.content),
					);

				this.lsClient?.sendRequest(fsChange, {
					inserts,
					removes,
					isSync: false,
				});
			})();
		});
	}

	sendWorkerMessage(type: string, content: any) {
		this.worker?.postMessage({
			method: "worker",
			params: {
				type: type,
				content: content,
			},
		});
	}
	_waitWorkerMessageInner(
		condition: (_data: WorkerMessage) => boolean,
		timeout: number,
		errorMessage?: string,
	) {
		return new Promise((resolve, reject) => {
			const onMessage = (e: any) => {
				if (!condition(e.data)) return;

				this.worker?.removeEventListener("message", onMessage);
				resolve(e.data);
				clearTimeout(workerTimeout);
			};

			const workerTimeout = setTimeout(() => {
				this.worker?.removeEventListener("message", onMessage);
				reject(
					new Error(
						errorMessage || "Waiting for worker message failed: timeout",
					),
				);
			}, timeout);

			this.worker?.addEventListener("message", onMessage);
		});
	}
	waitWorkerMessage(type: string, timeout: number = 5000) {
		const condition = (data: WorkerMessage): boolean => {
			return (data.method === "worker" &&
				data.params &&
				data.params.type === type) as boolean;
		};

		const errorMessage = `Waiting for worker message ${type} failed: timeout`;

		return this._waitWorkerMessageInner(condition, timeout, errorMessage);
	}
}

interface FsWatchRequest {
	inserts: string[];
	removes: string[];
}

interface FileResult {
	type: "ok" | "err";
	content?: string;
	error?: string;
}

interface FileChange {
	uri: string;
	content: FileResult;
}
/**
 * A parameter literal used in requests to pass a list of file changes.
 */
export interface FsChangeParams {
	inserts: FileChange[];
	removes: string[];
	isSync: boolean;
}

const fsChange = new RequestType<FsChangeParams, void, void>(
	"tinymist/fsChange",
);

export interface WorkerMessage {
	method: string;
	params?: {
		type?: string;
		content?: any;
		data?: any;
	};
}
