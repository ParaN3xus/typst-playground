import { createApp } from "vue";
import { createVfm } from "vue-final-modal";
import App from "./App.vue";
import "./main.css";

const vfm = createVfm();

createApp(App).use(vfm).mount("#app");
