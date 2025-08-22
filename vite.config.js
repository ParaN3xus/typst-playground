import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { assetsLoader } from './utils/load-assets.mjs'

export default defineConfig({
  base: '/typst-playground',
  plugins: [
    vue(),
    vueDevTools(),
    assetsLoader()
  ],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        importMetaUrlPlugin
      ]
    },
    include: [
      '@codingame/monaco-vscode-api',
      '@codingame/monaco-vscode-configuration-service-override',
      '@codingame/monaco-vscode-editor-api',
      '@codingame/monaco-vscode-editor-service-override',
      '@codingame/monaco-vscode-environment-service-override',
      '@codingame/monaco-vscode-extension-api',
      '@codingame/monaco-vscode-extensions-service-override',
      '@codingame/monaco-vscode-files-service-override',
      '@codingame/monaco-vscode-keybindings-service-override',
      '@codingame/monaco-vscode-language-pack-cs',
      '@codingame/monaco-vscode-language-pack-de',
      '@codingame/monaco-vscode-language-pack-es',
      '@codingame/monaco-vscode-language-pack-fr',
      '@codingame/monaco-vscode-language-pack-it',
      '@codingame/monaco-vscode-language-pack-ja',
      '@codingame/monaco-vscode-language-pack-ko',
      '@codingame/monaco-vscode-language-pack-pl',
      '@codingame/monaco-vscode-language-pack-pt-br',
      '@codingame/monaco-vscode-language-pack-qps-ploc',
      '@codingame/monaco-vscode-language-pack-ru',
      '@codingame/monaco-vscode-language-pack-tr',
      '@codingame/monaco-vscode-language-pack-zh-hans',
      '@codingame/monaco-vscode-language-pack-zh-hant',
      '@codingame/monaco-vscode-languages-service-override',
      '@codingame/monaco-vscode-localization-service-override',
      '@codingame/monaco-vscode-log-service-override',
      '@codingame/monaco-vscode-model-service-override',
      '@codingame/monaco-vscode-monarch-service-override',
      '@codingame/monaco-vscode-textmate-service-override',
      '@codingame/monaco-vscode-theme-defaults-default-extension',
      '@codingame/monaco-vscode-theme-service-override',
      '@codingame/monaco-vscode-views-service-override',
      '@codingame/monaco-vscode-workbench-service-override',
      'vscode/localExtensionHost',
      'vscode-textmate',
      'vscode-oniguruma',
      'vscode-languageclient',
      'vscode-languageserver/browser.js'
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  worker: {
    plugins: () => [
      assetsLoader()
    ],
    format: 'es'
  },
  server: {
    fs: {
      allow: [
        '.',
        '../../rust/tinymist/crates/tinymist/pkg/'
      ],
    },
  }
})
