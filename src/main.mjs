import { createApp } from "vue";
import { createVfm } from "vue-final-modal";
import App from "./App.vue";
import "./main.css";
import "@vscode-elements/elements-lite/components/action-button/action-button.css";
import "@vscode-elements/elements-lite/components/button/button.css";

const vfm = createVfm();

createApp(App).use(vfm).mount("#app");
