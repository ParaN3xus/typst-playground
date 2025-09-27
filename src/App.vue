<template>
  <LoadingScreen />

  <div v-show="resourcesLoaded" class="flex flex-col h-screen w-full">
    <div class="hidden">
      <button @click="doPreview">do preview</button>
      <button @click="printMain">print main</button>
    </div>
    <div class="flex justify-between !border-x-0 bg-base">
      <div class="mx-2 flex">
        <button
          v-if="isMobile"
          class="vscode-action-button my-2"
          title="Toggle explorer"
          @click="toggleSidebar"
        >
          <Icon icon="heroicons:archive-box" class="menu-btn-icon" />
        </button>
        <button
          class="vscode-action-button my-2"
          title="Empty workspace"
          @click="handleEmptyClicked"
        >
          <Icon icon="heroicons:trash" class="menu-btn-icon" />
        </button>
      </div>
      <div class="mx-2 flex">
        <button
          class="vscode-action-button my-2"
          title="Share workspace"
          :class="{ 'opacity-50 cursor-not-allowed': isSharing }"
          :disabled="isSharing"
          @click="handleShareClicked"
        >
          <Icon
            v-if="!shareButtonText"
            icon="heroicons:share"
            class="menu-btn-icon"
          />
          <span v-else class="mx-3 my-1">{{ shareButtonText }}</span>
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0">
      <Splitpanes :maximize-panes="false">
        <Pane
          :size="isSidebarOpen ? (isMobile ? 50 : 20) : 0"
          :min-size="isMobile ? (isSidebarOpen ? 10 : 0) : 15"
          :max-size="isSidebarOpen ? 50 : 0"
        >
          <div ref="sidebarContainer" class="h-full"></div>
        </Pane>
        <Pane :size="isSidebarOpen ? 80 : 100" min-size="15">
          <Splitpanes :horizontal="isMobile" :maximize-panes="false">
            <Pane :size="40">
              <Splitpanes :horizontal="true" :maximize-panes="false">
                <Pane :size="isMobile ? 100 : 65" min-size="30">
                  <div ref="editorsContainer" class="h-full"></div>
                </Pane>
                <Pane
                  :size="35"
                  :min-size="isMobile ? 0 : 20"
                  :max-size="isMobile ? 0 : 50"
                >
                  <div ref="panelContainer" class="h-full"></div>
                </Pane>
              </Splitpanes>
            </Pane>
            <Pane :size="40" min-size="20" max-size="50" class="h-full">
              <TypstPreview
                class="bg-base"
                ref="preview"
                :reader="reader"
                :writer="writer"
                style="margin-top: -1px"
              />
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>
    </div>
    <ModalsContainer />
  </div>
</template>
<script setup>
import { Icon } from "@iconify/vue";
import { resolve } from "pathe";
import { Pane, Splitpanes } from "splitpanes";
import { onMounted, onUnmounted, ref } from "vue";
import "splitpanes/dist/splitpanes.css";

import * as vscode from "vscode";

import { ModalsContainer, useModal } from "vue-final-modal";
import { createFileSystemProvider } from "./fs-provider/fs-provider.mts";
import {
	defaultEntryFilePath,
	defaultHiddenFolderName,
	defaultWorkspacePath,
} from "./fs-provider/path-constants.mjs";
import {
	defaultEntryFileUri,
	defaultWorkspaceUri,
} from "./fs-provider/uri-constants.mjs";
import LoadingScreen from "./LoadingScreen.vue";
import { uploadToPastebin } from "./pastebin";
import resourceLoader from "./resource-loader.mjs";
import { TinymistLS } from "./tinymist-ls/ls.mts";
import TypstPreview from "./typst-preview/TypstPreview.vue";
import "vue-final-modal/style.css";

import { useMonacoVscodeApiComponent } from "./monaco.mts";

const isMobile = ref(false);
const isSidebarOpen = ref(true);
const toggleSidebar = () => {
	isSidebarOpen.value = !isSidebarOpen.value;
};

const checkMobile = () => {
	const before = isMobile.value;
	const after = window.innerWidth < 768;
	if (!before && after) {
		isSidebarOpen.value = false;
	} else if (before && !after) {
		isSidebarOpen.value = true;
	}
	isMobile.value = after;
};

const sidebarContainer = ref(null);
const editorsContainer = ref(null);
const panelContainer = ref(null);
const preview = ref(null);
const resourcesLoaded = ref(false);

let ls = new TinymistLS();
const reader = ref(null);
const writer = ref(null);

let wrapper = null;
let fileSystemProvider = null;

let isWorkspaceChanged = false;

async function printMain() {
	const decoder = new TextDecoder("utf-8");
	console.log(
		decoder.decode(await fileSystemProvider.readFile(defaultEntryFileUri)),
	);
}

async function doPreview() {
	preview.value.initPreview(defaultEntryFilePath);
}

function isDirty() {
	return vscode.window.tabGroups.all.some((group) =>
		group.tabs.some((tab) => tab.isDirty),
	);
}

import YesOrNoModal from "./Modals/YesOrNoModal.vue";

const { open, close } = useModal({
	component: YesOrNoModal,
	attrs: {
		title: "Unsaved Changes",
		async onYes() {
			await close();

			// save all
			await vscode.commands.executeCommand("workbench.action.files.saveAll");

			share();
		},
		async onNo() {
			await close();
			share();
		},
	},
	slots: {
		default:
			"<p>You have unsaved changes. Do you want to save them before sharing?</p>",
	},
});
const isSharing = ref(false);
const shareButtonText = ref(false);
async function handleShareClicked() {
	if (isSharing.value) return;
	try {
		if (isDirty()) {
			await open();
			return;
		}

		await share();
	} catch (error) {
		console.error("Share failed:", error);

		shareButtonText.value = "Failed";
		setTimeout(() => {
			isSharing.value = false;
			shareButtonText.value = null;
		}, 2000);
	}
}
async function share() {
	isSharing.value = true;
	shareButtonText.value = "Sharing...";

	let code = await uploadToPastebin(fileSystemProvider);

	const shareUrl = `${window.location.origin}${window.location.pathname}?code=${code}`;
	await navigator.clipboard.writeText(shareUrl);

	shareButtonText.value = "URL Copied!";

	setTimeout(() => {
		isSharing.value = false;
		shareButtonText.value = null;
	}, 2000);
}

async function handleEmptyClicked() {
	if (
		confirm(`Are you sure to empty current workspace? This cannot be reverted.`)
	) {
		await vscode.commands.executeCommand("workbench.action.files.saveAll");
		await fileSystemProvider.empty();
	}
}

async function loadWorkspace(fileSystemProvider) {
	await fileSystemProvider.createDirectory(defaultWorkspaceUri);
	let res = null;
	for (const workspaceFile of resourceLoader.getWorkspaceFiles()) {
		let doc = await fileSystemProvider.addFileToWorkspace(
			resolve(defaultWorkspacePath, workspaceFile.path),
			workspaceFile.data,
			false,
		);
		console.log(`workspace: loaded ${workspaceFile.path} to workspace`);
		if (workspaceFile.path === defaultEntryFilePath) {
			res = doc;
		}
	}

	if (!res) {
		return await fileSystemProvider.empty();
	}

	return res;
}

async function startTinymistClient() {
	const { reader: tmpReader, writer: tmpWriter } =
		await ls.startTinymistServer();
	reader.value = tmpReader;
	writer.value = tmpWriter;

	fileSystemProvider = await createFileSystemProvider();
	ls.fsProvider = fileSystemProvider;

	let defaultDocument = await loadWorkspace(fileSystemProvider);

	const { initMonacoVscodeApi } = useMonacoVscodeApiComponent(
		ls,
		document.body,
		sidebarContainer,
		editorsContainer,
		panelContainer,
	);
	const [apiWrapper, lcWrapper] = await initMonacoVscodeApi();
	ls.lsClient = lcWrapper.getLanguageClient("typst");
	await ls.initWatcher();

	initWorkspaceChangesListener();

	await vscode.window.showTextDocument(defaultDocument, {
		preserveFocus: true,
	});

	await doPreview();
}

function handleBeforeUnload(event) {
	console.warn("isDirty", isDirty(), "isChanged", isWorkspaceChanged);
	if (isDirty() || isWorkspaceChanged) {
		event.preventDefault();
		event.returnValue = "";
		return "Are you sure to leave? You changes won't be saved.";
	}
}

function initWorkspaceChangesListener() {
	let disposables = [];
	const eventTypes = [
		vscode.workspace.onDidChangeWorkspaceFolders,
		vscode.workspace.onDidCreateFiles,
		vscode.workspace.onDidDeleteFiles,
		vscode.workspace.onDidRenameFiles,
		vscode.workspace.onDidSaveTextDocument,
	];
	disposables = eventTypes.map((eventType) =>
		eventType(() => {
			isWorkspaceChanged = true;
			disposables.forEach((disposable) => disposable.dispose());
		}),
	);
}

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");
onMounted(async () => {
	checkMobile();
	window.addEventListener("resize", checkMobile);
	window.addEventListener("beforeunload", handleBeforeUnload);
	ls.startWorker();
	try {
		await resourceLoader.loadAll(ls, code);
		resourcesLoaded.value = true;
	} catch (error) {
		console.error("Failed to load resources:", error);
	}
	startTinymistClient();
});

onUnmounted(() => {
	window.removeEventListener("resize", checkMobile);
	wrapper.dispose();
});
</script>

<style></style>
