class ResourceLoader {
    constructor() {
        if (ResourceLoader.instance) {
            return ResourceLoader.instance;
        }

        this.resources = {
            fonts: null,
            wasm: null,
            workspaceFiles: null
        };

        this.loadingProgress = {
            fonts: { loaded: false, progress: 0, name: 'Loading fonts' },
            wasm: { loaded: false, progress: 0, name: 'Loading WASM module' },
            workspaceFiles: { loaded: false, progress: 0, name: 'Loading workspace' }
        };

        this.listeners = [];
        ResourceLoader.instance = this;
    }

    addProgressListener(callback) {
        this.listeners.push(callback);
    }

    removeProgressListener(callback) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }

    notifyProgress() {
        this.listeners.forEach(callback => callback(this.loadingProgress));
    }

    updateProgress(type, progress) {
        this.loadingProgress[type].progress = progress;
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
            this.updateProgress('fonts', 10);
            const fonts = await import('virtual:fonts');
            this.updateProgress('fonts', 50);

            let completedCount = 0;
            const totalFonts = fonts.default.length;

            const loadedFonts = await Promise.all(
                fonts.default.map(async (font) => {
                    const data = await font.getData();
                    completedCount++;
                    const progress = 50 + (completedCount / totalFonts) * 40;
                    this.updateProgress('fonts', progress);
                    return { ...font, data };
                })
            );

            this.resources.fonts = loadedFonts;
            this.updateProgress('fonts', 90);

            worker.loadFonts(loadedFonts.map(font => font.data));
            this.markComplete('fonts');
            return loadedFonts;
        } catch (error) {
            console.error('Failed to load fonts:', error);
            throw error;
        }

    }

    async loadWasm(worker) {
        if (this.resources.wasm) return this.resources.wasm;

        try {
            this.updateProgress('wasm', 10);
            await worker.loadWasm();

            this.updateProgress('wasm', 90);
            this.resources.wasm = true;
            this.markComplete('wasm');
            return true;
        } catch (error) {
            console.error('Failed to load WASM module:', error);
            throw error;
        }
    }

    async loadWorkspaceFiles() {
        if (this.resources.workspaceFiles) return this.resources.workspaceFiles;

        try {
            this.updateProgress('workspaceFiles', 10);
            const defaultWorkspaceFiles = await import('virtual:default-workspace');
            this.updateProgress('workspaceFiles', 50);

            const loadedFiles = await Promise.all(
                defaultWorkspaceFiles.default.map(async (file, index) => {
                    const data = await file.getData();
                    this.updateProgress('workspaceFiles', 50 + (index + 1) / defaultWorkspaceFiles.default.length * 50);
                    return { ...file, data };
                })
            );

            this.resources.workspaceFiles = loadedFiles;
            this.markComplete('workspaceFiles');
            return loadedFiles;
        } catch (error) {
            console.error('Failed to load workspace', error);
            throw error;
        }
    }

    async loadAll(worker) {
        const promises = [
            this.loadFonts(worker),
            this.loadWasm(worker),
            this.loadWorkspaceFiles(),
        ];

        await Promise.all(promises);
        return this.resources;
    }

    getFonts() {
        console.log(this)
        return this.resources.fonts;
    }

    getWasm() {
        return this.resources.wasm;
    }

    getWorkspaceFiles() {
        return this.resources.workspaceFiles;
    }

    isAllLoaded() {
        return Object.values(this.loadingProgress).every(item => item.loaded);
    }
}

export default new ResourceLoader();
