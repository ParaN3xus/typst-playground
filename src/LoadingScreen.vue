<template>
  <div
    v-if="!allLoaded || true"
    class="fixed inset-0 w-screen h-screen manual-bg-base flex justify-center items-center z-[9999] font-mono"
  >
    <div class="max-w-2xl w-[90%] text-center">
      <h2 class="text-2xl mb-8 manual-text-main">Loading Resources...</h2>
      <div class="flex flex-col gap-4 text-left">
        <div
          v-for="(item, key) in loadingProgress"
          :key="key"
          class="manual-bg-surface p-4"
        >
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold manual-text-main">{{ item.name }}</span>
            <span class="opacity-80 manual-text-main">
              {{ item.loaded ? "Done" : "Loading..." }}
            </span>
          </div>
          <div
            ref="progressContainer"
            class="text-sm manual-text-main overflow-hidden"
          >
            {{ getAsciiProgress(item.progress) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { fromEvent } from "rxjs";
import { debounceTime } from "rxjs/operators";
import resourceLoader from "./resource-loader.mjs";

const loadingProgress = ref({});
const allLoaded = ref(false);
const progressContainer = ref([]);
const progressBarWidth = ref(30);

const calculateProgressBarWidth = () => {
  const container = progressContainer.value?.[0];
  if (!container) return 30;

  const testElement = document.createElement("span");
  testElement.style.visibility = "hidden";
  testElement.style.position = "absolute";
  testElement.style.whiteSpace = "nowrap";
  testElement.textContent = "█".repeat(10);

  const computedStyle = window.getComputedStyle(container);
  testElement.style.fontFamily = computedStyle.fontFamily;
  testElement.style.fontSize = computedStyle.fontSize;
  testElement.style.fontWeight = computedStyle.fontWeight;

  container.appendChild(testElement);
  const actualCharWidth = testElement.offsetWidth / 10;
  container.removeChild(testElement);

  const containerWidth = container.clientWidth;
  const reservedSpace = actualCharWidth * 10;
  const availableWidth = containerWidth - reservedSpace;
  const maxChars = Math.floor(availableWidth / actualCharWidth);

  return maxChars;
};

const updateProgressBarWidth = () => {
  const newWidth = calculateProgressBarWidth();
  if (newWidth !== progressBarWidth.value) {
    progressBarWidth.value = newWidth;
  }
};

const getAsciiProgress = (progress) => {
  const width = progressBarWidth.value;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return (
    "[" +
    "█".repeat(filled) +
    "░".repeat(empty) +
    "] " +
    Math.round(progress) +
    "%"
  );
};

const progressListener = (progress) => {
  loadingProgress.value = { ...progress };
  if (resourceLoader.isAllLoaded()) {
    setTimeout(() => {
      allLoaded.value = true;
    }, 500);
  }
};

let resizeSubscription = null;

onMounted(async () => {
  resourceLoader.addProgressListener(progressListener);
  loadingProgress.value = { ...resourceLoader.loadingProgress };

  await nextTick();
  setTimeout(() => {
    updateProgressBarWidth();

    resizeSubscription = fromEvent(window, "resize")
      .pipe(debounceTime(100))
      .subscribe(updateProgressBarWidth);
  }, 50);
});

onUnmounted(() => {
  resourceLoader.removeProgressListener(progressListener);
  if (resizeSubscription) {
    resizeSubscription.unsubscribe();
  }
});
</script>

<style>
.manual-bg-base {
  background: rgb(24, 24, 24);
}

.manual-bg-surface {
  background: rgb(31, 31, 31);
}

.manual-text-main {
  color: rgb(204, 204, 204);
}
</style>
