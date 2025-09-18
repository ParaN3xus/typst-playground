import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { compression, defineAlgorithm } from "vite-plugin-compression2";
import vueDevTools from "vite-plugin-vue-devtools";
import { constants } from "zlib";
import { assetsLoader } from "./utils/load-assets.mjs";

export default defineConfig({
	base: process.env.BUILD_PATH || "/",
	plugins: [
		vue(),
		vueDevTools(),
		assetsLoader(),
		tailwindcss(),
		compression({
			threshold: 1024 * 1024,
			include: /\.(html|xml|css|js|mjs|json|svg|otf|ttf|otc|ttc)$/,
			algorithm: [
				defineAlgorithm("brotliCompress", {
					params: {
						[constants.BROTLI_PARAM_QUALITY]: 11,
					},
				}),
			],
		}),
	],
	build: {
		rollupOptions: {
			output: {
				assetFileNames: (assetInfo) => {
					const ext = assetInfo.names?.[0]?.split(".").pop();

					if (["otf", "ttf", "otc", "ttc"].includes(ext)) {
						return `assets/fonts/[name][extname]`;
					}
					return "assets/[name]-[hash][extname]";
				},
			},
		},
	},
	optimizeDeps: {
		rollupOptions: {
			plugins: [importMetaUrlPlugin],
		},
		esbuildOptions: {
			plugins: [importMetaUrlPlugin],
		},
		include: [
			"@codingame/monaco-vscode-api",
			"@codingame/monaco-vscode-configuration-service-override",
			"@codingame/monaco-vscode-editor-api",
			"@codingame/monaco-vscode-editor-service-override",
			"@codingame/monaco-vscode-environment-service-override",
			"@codingame/monaco-vscode-extension-api",
			"@codingame/monaco-vscode-extensions-service-override",
			"@codingame/monaco-vscode-files-service-override",
			"@codingame/monaco-vscode-keybindings-service-override",
			"@codingame/monaco-vscode-languages-service-override",
			"@codingame/monaco-vscode-localization-service-override",
			"@codingame/monaco-vscode-log-service-override",
			"@codingame/monaco-vscode-model-service-override",
			"@codingame/monaco-vscode-monarch-service-override",
			"@codingame/monaco-vscode-textmate-service-override",
			"@codingame/monaco-vscode-theme-defaults-default-extension",
			"@codingame/monaco-vscode-theme-service-override",
			"@codingame/monaco-vscode-views-service-override",
			"@codingame/monaco-vscode-workbench-service-override",
			"vscode/localExtensionHost",
			"vscode-textmate",
			"vscode-oniguruma",
			"vscode-languageclient",
			"vscode-languageserver/browser.js",
		],
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	worker: {
		plugins: () => [assetsLoader()],
		format: "es",
	},
	server: {
		fs: {
			strict: false,
		},
	},
});
