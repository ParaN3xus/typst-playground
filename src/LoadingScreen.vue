<template>
    <div v-if="!allLoaded"
        class="fixed inset-0 w-screen h-screen bg-base flex justify-center items-center z-[9999] font-mono">
        <div class="max-w-2xl w-[90%] text-center">
            <h2 class="text-2xl mb-8 text-main">
                Loading Resources...
            </h2>
            <div class="flex flex-col gap-4 text-left">
                <div v-for="(item, key) in loadingProgress" :key="key" class="bg-surface p-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-main">{{ item.name }}</span>
                        <span class="opacity-80 text-main">
                            {{ item.loaded ? 'Done' : 'Loading...' }}
                        </span>
                    </div>
                    <div class="text-sm whitespace-nowrap text-main">
                        {{ getAsciiProgress(item.progress) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import resourceLoader from './resource-loader.mjs';

const loadingProgress = ref({});
const allLoaded = ref(false);

const getAsciiProgress = (progress) => {
    const width = 30;
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + '] ' + Math.round(progress) + '%';
};

const progressListener = (progress) => {
    loadingProgress.value = { ...progress };

    if (resourceLoader.isAllLoaded()) {
        setTimeout(() => {
            allLoaded.value = true;
        }, 500);
    }
};

onMounted(() => {
    resourceLoader.addProgressListener(progressListener);
    loadingProgress.value = { ...resourceLoader.loadingProgress };
});

onUnmounted(() => {
    resourceLoader.removeProgressListener(progressListener);
});
</script>
