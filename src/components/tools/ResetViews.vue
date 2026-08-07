<script setup lang="ts">
import ControlButton from '@/src/components/ControlButton.vue';
import { triggerResetViews } from '@/src/components/tools/resetViewsEvent';
</script>

<template>
  <control-button
    size="40"
    icon="mdi-camera-flip-outline"
    name="Reset Views"
    @click="triggerResetViews()"
  />
</template>
