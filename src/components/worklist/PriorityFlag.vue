<script setup lang="ts">
import type { Priority } from '@/src/types/worklist';
import { PRIORITY_LABELS } from '@/src/utils/worklist';

defineProps<{ priority: Priority }>();
</script>

<template>
  <span class="priority" :class="`priority--${priority}`">
    {{ PRIORITY_LABELS[priority] }}
  </span>
</template>

<style scoped>
.priority {
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.priority--stat {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  background-color: var(--worklist-critical);
  color: var(--worklist-on-critical);
  font-weight: 700;
}

.priority--routine {
  opacity: 0.6;
}
</style>
