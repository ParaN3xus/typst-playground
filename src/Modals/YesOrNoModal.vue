<script setup lang="ts">
import { VueFinalModal } from "vue-final-modal";

defineProps<{
  title?: string;
}>();

const emit = defineEmits<{
  (e: "yes"): void;
  (e: "no"): void;
}>();
</script>

<template>
  <VueFinalModal
    class="flex justify-center items-center"
    content-class="flex flex-col max-w-xl py-6 px-6 bg-base space-y-2"
  >
    <h1 class="text-main text-xl">
      {{ title }}
    </h1>
    <div class="text-main">
      <slot />
    </div>

    <div class="ml-auto space-x-4 mt-2">
      <button class="vscode-button secondary" @click="emit('no')">No</button>
      <button class="vscode-button" @click="emit('yes')">Yes</button>
    </div>
  </VueFinalModal>
</template>
