<template>
    <div v-if="!allLoaded" class="loading-screen">
        <div class="loading-content">
            <h2>Loading Resources...</h2>
            <div class="loading-items">
                <div v-for="(item, key) in loadingProgress" :key="key" class="loading-item">
                    <div class="item-info">
                        <span class="item-name">{{ item.name }}</span>
                        <span class="item-status">{{ item.loaded ? 'Done' : 'Loading...' }}</span>
                    </div>
                    <div class="ascii-progress">{{ getAsciiProgress(item.progress) }}</div>
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

<style scoped>
.loading-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000000;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    color: #ffffff;
    font-family: monospace;
}

.loading-content {
    max-width: 600px;
    width: 90%;
    text-align: center;
}

.loading-content h2 {
    margin: 0 0 2rem 0;
    font-size: 1.5rem;
    font-weight: normal;
}

.loading-items {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
}

.loading-item {
    font-size: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}

.item-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
}

.item-name {
    font-weight: bold;
}

.item-status {
    opacity: 0.8;
}

.ascii-progress {
    font-family: monospace;
    font-size: 0.9rem;
    white-space: nowrap;
}
</style>
