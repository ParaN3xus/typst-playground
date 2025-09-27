import { LogLevel } from "@codingame/monaco-vscode-api";

import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-theme-seti-default-extension";

import {
	MonacoVscodeApiWrapper,
	type MonacoVscodeApiConfig,
} from "monaco-languageclient/vscodeApiWrapper";
import {
	LanguageClientWrapper,
	type LanguageClientConfig,
} from "monaco-languageclient/lcwrapper";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";

import getExplorerServiceOverride from "@codingame/monaco-vscode-explorer-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getViewsServiceOverride from "@codingame/monaco-vscode-views-service-override";
import {
	attachPart,
	onDidChangeSideBarPosition,
	Parts,
} from "@codingame/monaco-vscode-views-service-override";

import { defaultHiddenFolderName } from "./fs-provider/path-constants.mjs";
import { defaultWorkspaceUri } from "./fs-provider/uri-constants.mjs";

import tinymistPackage from "./assets/tinymist-assets/package.json";
import { AutoSaveConfiguration } from "@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files";
import { TinymistLS } from "./tinymist-ls/ls.mts";
import { IGrammar } from "@codingame/monaco-vscode-api/vscode/vs/platform/extensions/common/extensions";
import { Ref } from "vue";

async function loadExtensionAssets(): Promise<Map<string, string | URL>> {
	const assets = {
		"./syntaxes/language-configuration.json": () =>
			import(
				"./assets/tinymist-assets/syntaxes/language-configuration.json?raw"
			),
		"./syntaxes/typst-markdown-injection.json": () =>
			import(
				"./assets/tinymist-assets/syntaxes/typst-markdown-injection.json?raw"
			),
		"./out/typst.tmLanguage.json": () =>
			import("./assets/tinymist-assets/out/typst.tmLanguage.json?raw"),
		"./out/typst-code.tmLanguage.json": () =>
			import("./assets/tinymist-assets/out/typst-code.tmLanguage.json?raw"),
		"./icons/ti-white.png": () =>
			new URL(
				"./assets/tinymist-assets/icons/ti-white.png?raw",
				import.meta.url,
			),
		"./icons/ti.png": () =>
			new URL("./assets/tinymist-assets/icons/ti.png?raw", import.meta.url),
		"./icons/typst-small.png": () =>
			new URL(
				"./assets/tinymist-assets/icons/typst-small.png?raw",
				import.meta.url,
			),
	};

	const extensionFilesOrContents = new Map<string, string | URL>();

	await Promise.all(
		Object.entries(assets).map(async ([key, importFn]) => {
			const result = await importFn();
			let content: string | URL;
			if (result instanceof URL) {
				content = result;
			} else {
				content = result.default;
			}
			extensionFilesOrContents.set(key, content);
		}),
	);

	return extensionFilesOrContents;
}

export function useMonacoVscodeApiComponent(
	ls: TinymistLS,
	rootContainer: HTMLElement,
	sidebarContainer: Ref<HTMLElement>,
	editorsContainer: Ref<HTMLElement>,
	panelContainer: Ref<HTMLElement>,
): {
	initMonacoVscodeApi: () => Promise<
		[MonacoVscodeApiWrapper, LanguageClientWrapper]
	>;
} {
	async function viewsInit() {
		for (const config of [
			{
				part: Parts.SIDEBAR_PART,
				get element() {
					return sidebarContainer.value;
				},
				onDidElementChange: onDidChangeSideBarPosition,
			},
			{ part: Parts.EDITOR_PART, element: editorsContainer.value },
			{ part: Parts.PANEL_PART, element: panelContainer.value },
		]) {
			attachPart(config.part, config.element);

			config.onDidElementChange?.(() => {
				attachPart(config.part, config.element);
			});
		}
	}

	function getLanguageClientConfig(): LanguageClientConfig {
		return {
			languageId: "typst",
			connection: {
				options: {
					$type: "WorkerDirect",
					worker: ls.worker!,
				},
				messageTransports: {
					reader: ls.reader!,
					writer: ls.writer!,
				},
			},
			clientOptions: {
				documentSelector: ["typst"],
				initializationOptions: {
					formatterMode: "typstyle",
				},
			},
		};
	}

	async function getVscodeApiConfig(): Promise<MonacoVscodeApiConfig> {
		return {
			$type: "extended",
			logLevel: LogLevel.Debug,
			serviceOverrides: {
				...getKeybindingsServiceOverride(),
				...getExplorerServiceOverride(),
				...getMarkersServiceOverride(),
				...getViewsServiceOverride(),
				...getThemeServiceOverride(),
			},
			userConfiguration: {
				json: JSON.stringify({
					"workbench.colorTheme": "Default Dark Modern",
					"editor.guides.bracketPairsHorizontal": "active",
					"editor.wordBasedSuggestions": "off",
					"editor.experimental.asyncTokenization": false,
					"editor.codeLens": false,
					"editor.formatOnSave": true,
					"vitest.disableWorkspaceWarning": true,
					"files.autoSave": AutoSaveConfiguration.OFF,
					"files.exclude": {
						[defaultHiddenFolderName]: true,
					},
				}),
			},
			viewsConfig: {
				$type: "ViewsService",
				viewsInitFunc: viewsInit,
				htmlContainer: rootContainer,
			},
			workspaceConfig: {
				enableWorkspaceTrust: true,
				workspaceProvider: {
					trusted: true,
					async open() {
						window.open(window.location.href);
						return true;
					},
					workspace: {
						folderUri: defaultWorkspaceUri,
					},
				},
			},
			extensions: [
				{
					config: {
						name: "tinymist-wasm",
						publisher: tinymistPackage.publisher,
						version: tinymistPackage.version,
						engines: {
							vscode: "*",
						},
						contributes: {
							configuration: tinymistPackage.contributes.configuration,
							configurationDefaults:
								tinymistPackage.contributes.configurationDefaults,
							languages: tinymistPackage.contributes.languages,
							grammars: tinymistPackage.contributes.grammars as IGrammar[],
							// semanticTokenTypes: tinymistPackage.contributes.semanticTokenTypes,
							// semanticTokenModifiers: tinymistPackage.contributes.semanticTokenModifiers,
							semanticTokenScopes:
								tinymistPackage.contributes.semanticTokenScopes,
						},
					},
					filesOrContents: await loadExtensionAssets(),
				},
			],
			monacoWorkerFactory: configureDefaultWorkerFactory,
		};
	}

	async function initMonacoVscodeApi(): Promise<
		[MonacoVscodeApiWrapper, LanguageClientWrapper]
	> {
		const apiWrapper = new MonacoVscodeApiWrapper(await getVscodeApiConfig());
		await apiWrapper.start();

		const lcWrapper = new LanguageClientWrapper(getLanguageClientConfig());
		await lcWrapper.start();

		return [apiWrapper, lcWrapper];
	}

	return { initMonacoVscodeApi };
}
