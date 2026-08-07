<script setup lang="ts">
import { computed } from 'vue';
import { formatBindingParts } from '@/src/utils/keyBindings';

const props = defineProps<{ binding: string }>();

const keys = computed(() => formatBindingParts(props.binding));
</script>

<template>
  <span class="shortcut-keys">
    <kbd v-for="key in keys" :key="key" class="shortcut-key">{{ key }}</kbd>
  </span>
</template>

<style scoped>
.shortcut-keys {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  white-space: nowrap;
}

.shortcut-key {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-border-color), 0.35);
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: center;
  box-shadow: none;
}
</style>
