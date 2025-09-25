import { resolve } from "pathe";
import { defaultWorkspacePath } from "./fs-provider/path-constants.mjs";
import { fetchFromPastebin } from "./pastebin";

class FontCache {
	constructor() {
		this.dbName = 'FontCache';
		this.dbVersion = 1;
		this.storeName = 'fonts';
		this.db = null;
	}

	async init() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve(this.db);
			};
			
			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					const store = db.createObjectStore(this.storeName, { keyPath: 'name' });
				}
			};
		});
	}

	async getFont(name, hash) {
		if (!this.db) await this.init();
		
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.get(name);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result;
				if (result && result.hash === hash) {
					resolve(result.data);
				} else {
					resolve(null);
				}
			};
		});
	}

	async setFont(name, hash, data) {
		if (!this.db) await this.init();
		
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.put({ name, hash, data });
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}
}

class ResourceLoader {
	constructor() {
		if (ResourceLoader.instance) {
			return ResourceLoader.instance;
		}

		this.resources = {
			fonts: null,
			wasm: null,
			workspaceFiles: null,
		};

		this.loadingProgress = {
			fonts: { loaded: false, progress: 0, name: "Loading fonts" },
			wasm: { loaded: false, progress: 0, name: "Loading WASM module" },
			workspaceFiles: { loaded: false, progress: 0, name: "Loading workspace" },
		};

		this.listeners = [];
		this.fontCache = new FontCache();
		ResourceLoader.instance = this;
	}

	addProgressListener(callback) {
		this.listeners.push(callback);
	}

	removeProgressListener(callback) {
		this.listeners = this.listeners.filter((listener) => listener !== callback);
	}

	notifyProgress() {
		this.listeners.forEach((callback) => callback(this.loadingProgress));
	}

	updateProgress(type, progress, error = null) {
		this.loadingProgress[type].progress = progress;
		if (error) {
			this.loadingProgress[type].error = error;
		}
		this.notifyProgress();
	}

	markComplete(type) {
		this.loadingProgress[type].loaded = true;
		this.loadingProgress[type].progress = 100;
		this.notifyProgress();
	}

	async loadFonts(worker) {
		if (this.resources.fonts) return this.resources.fonts;

		try {
			this.updateProgress("fonts", 10);
			const fonts = await import("virtual:fonts");
			this.updateProgress("fonts", 30);

			let completedCount = 0;
			const totalFonts = fonts.default.length;

			const loadedFonts = await Promise.all(
				fonts.default.map(async (font) => {
					let data = null;
					if (font.hash) {
						data = await this.fontCache.getFont(font.name, font.hash);
					}

					if (!data) {
						data = await font.getData();
						await this.fontCache.setFont(font.name, font.hash, data);
					}

					completedCount++;
					const progress = 30 + (completedCount / totalFonts) * 50;
					this.updateProgress("fonts", progress);
					return { ...font, data };
				}),
			);

			this.resources.fonts = loadedFonts;
			this.updateProgress("fonts", 90);

			worker.loadFonts(loadedFonts.map((font) => font.data));
			this.markComplete("fonts");
			return loadedFonts;
		} catch (error) {
			console.error("Failed to load fonts:", error);
			this.updateProgress(
				"fonts",
				this.loadingProgress.fonts.progress,
				error.message,
			);
			throw error;
		}
	}

	async loadWasm(worker) {
		if (this.resources.wasm) return this.resources.wasm;

		try {
			this.updateProgress("wasm", 10);
			await worker.loadWasm();

			this.updateProgress("wasm", 90);
			this.resources.wasm = true;
			this.markComplete("wasm");
			return true;
		} catch (error) {
			console.error("Failed to load WASM module:", error);
			this.updateProgress(
				"wasm",
				this.loadingProgress.wasm.progress,
				error.message,
			);
			throw error;
		}
	}

	async loadWorkspaceFiles(code) {
		if (this.resources.workspaceFiles) return this.resources.workspaceFiles;

		try {
			this.updateProgress("workspaceFiles", 10);

			if (code) {
				const pastebinFiles = await fetchFromPastebin(code);
				if (pastebinFiles) {
					this.resources.workspaceFiles = pastebinFiles;
					this.markComplete("workspaceFiles");
					return pastebinFiles;
				}
			}

			// load default workspace
			const defaultWorkspaceFiles = await import("virtual:default-workspace");
			this.updateProgress("workspaceFiles", 50);
			let completedCount = 0;
			const totalFiles = defaultWorkspaceFiles.default.length;
			const loadedFiles = await Promise.all(
				defaultWorkspaceFiles.default.map(async (file) => {
					const data = await file.getData();
					completedCount++;
					const progress = 50 + (completedCount / totalFiles) * 50;
					this.updateProgress("workspaceFiles", progress);
					return {
						...file,
						data,
						path: resolve(defaultWorkspacePath, file.path),
					};
				}),
			);
			this.resources.workspaceFiles = loadedFiles;
			this.markComplete("workspaceFiles");
			return loadedFiles;
		} catch (error) {
			console.error("Failed to load workspace", error);
			this.updateProgress(
				"workspaceFiles",
				this.loadingProgress.workspaceFiles.progress,
				error.message,
			);
			throw error;
		}
	}

	async loadAll(worker, code) {
		const promises = [
			this.loadFonts(worker),
			this.loadWasm(worker),
			this.loadWorkspaceFiles(code),
		];

		await Promise.all(promises);
		return this.resources;
	}

	getFonts() {
		return this.resources.fonts;
	}

	getWasm() {
		return this.resources.wasm;
	}

	getWorkspaceFiles() {
		return this.resources.workspaceFiles;
	}

	isAllLoaded() {
		return Object.values(this.loadingProgress).every((item) => item.loaded);
	}
}

export default new ResourceLoader();
