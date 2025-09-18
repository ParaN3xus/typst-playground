<template>
  <div id="preview" ref="windowElem">
    <div id="typst-container-top"></div>
    <div id="typst-container-main" ref="outerElem">
      <div id="typst-app" ref="hookedElem"></div>
    </div>
  </div>
</template>
<script setup>
import { normalize } from "pathe";
import * as vscode from "vscode";
import {
	BrowserMessageReader,
	BrowserMessageWriter,
} from "vscode-languageclient/browser";
import { ref } from "vue";

import { usePreviewComponent } from "./preview.mts";

const props = defineProps({
	reader: BrowserMessageReader,
	writer: BrowserMessageWriter,
});

const hookedElem = ref(null);
const windowElem = ref(null);
const outerElem = ref(null);

async function runLSPCommand(command, args) {
	const request = {
		jsonrpc: "2.0",
		id: 1,
		method: "workspace/executeCommand",
		params: {
			command: command,
			arguments: args,
		},
	};
	await props.writer.write(request);
}

async function initPreview(path) {
	const { initPreviewInner } = usePreviewComponent(
		props.reader,
		props.writer,
		hookedElem,
		windowElem,
		outerElem,
	);

	runLSPCommand("tinymist.doStartPreview", [[path]]);
	await initPreviewInner();

	vscode.window.onDidChangeTextEditorSelection(async (e) => {
		if (e.kind != 2) {
			return;
		}
		await runLSPCommand("tinymist.scrollPreview", [
			"default_preview",
			{
				event: "panelScrollTo",
				filepath: normalize(e.textEditor.document.fileName),
				line: e.selections[0].active.line,
				character: e.selections[0].active.character,
			},
		]);
	});
}

defineExpose({
	initPreview,
});
</script>

<style>
#preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  cursor: grab;
}

#typst-container-top {
  z-index: 1;
}

#typst-container-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
}

#typst-app {
  width: fit-content;
  margin: 0;
  transform-origin: 0 0;
  background-color: #2b2b2b;
}

#typst-app.invert-colors {
  filter: invert(0.933333) hue-rotate(180deg);
}

#typst-app.invert-colors .typst-image {
  filter: invert(0) hue-rotate(0deg);
  transition: filter 0.1s ease-in-out;
}

#typst-app.invert-colors .typst-image:hover,
#typst-app.invert-colors.normal-image .typst-image {
  filter: invert(1) hue-rotate(180deg);
}

.typst-doc {
  fill: #2b2b2b;
}

.hide-scrollbar-x {
  overflow-x: hidden;
}

.hide-scrollbar-y {
  overflow-y: hidden;
}

.typst-text {
  pointer-events: bounding-box;
  cursor: text;
}

.tsel span,
.tsel {
  left: 0;
  position: fixed;
  text-align: justify;
  white-space: pre;
  width: 100%;
  height: 100%;
  text-align-last: justify;
  color: transparent;
}

.tsel span::-moz-selection,
.tsel::-moz-selection {
  color: transparent;
  background: #7db9dea0;
}

.tsel span::selection,
.tsel::selection {
  color: transparent;
  background: #7db9dea0;
}

.pseudo-link {
  fill: transparent;
  cursor: pointer;
  pointer-events: all;
}

.image_glyph image,
.outline_glyph path,
path.outline_glyph {
  transform: matrix(1, 0, 0, 1, var(--o), 0);
}

.outline_glyph path,
path.outline_glyph {
  fill: var(--glyph_fill);
  stroke: var(--glyph_stroke);
}

.hover .typst-text {
  --glyph_fill: #66bab7;
  --glyph_stroke: #66bab7;
}

.typst-text:hover {
  --glyph_fill: #f75c2f;
  --glyph_stroke: #f75c2f;
}

.typst-jump-ripple,
.typst-debug-react-ripple {
  width: 0;
  height: 0;
  background-color: transparent;
  position: absolute;
  border-radius: 50%;
}

.typst-jump-ripple {
  border: 2px solid #66bab7;
}

.typst-debug-react-ripple {
  border: 1px solid #cb1b45;
}

@keyframes typst-jump-ripple-effect {
  to {
    width: 10vw;
    height: 10vw;
    opacity: 0.01;
    margin: -5vw;
  }
}

@keyframes typst-debug-react-ripple-effect {
  to {
    width: 3vw;
    height: 3vw;
    opacity: 0.1;
    margin: -1.5vw;
  }
}

.typst-svg-cursor {
  /* https://www.elevenforum.com/t/change-text-cursor-blink-rate-in-windows-11.12409/ */
  /* 1.2 seconds per blink is the default value on gtk and the slowest value on windows */
  animation: 1.2s blink step-start infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
