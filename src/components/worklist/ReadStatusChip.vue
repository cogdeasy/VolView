<script setup lang="ts">
import { computed } from 'vue';
import type { ReadStatus } from '@/src/types/worklist';
import { READ_STATUS_LABELS } from '@/src/utils/worklist';

const props = defineProps<{ status: ReadStatus }>();

const icon = computed(
  () =>
    ({
      unread: 'mdi-circle-medium',
      'in-progress': 'mdi-progress-clock',
      read: 'mdi-check-circle-outline',
    })[props.status]
);
</script>

<template>
  <span class="read-status" :class="`read-status--${status}`">
    <v-icon :icon="icon" size="14" />
    <span>{{ READ_STATUS_LABELS[status] }}</span>
  </span>
</template>

<style scoped>
.read-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.read-status--unread {
  font-weight: 600;
}

.read-status--in-progress {
  color: var(--worklist-in-progress);
}

.read-status--read {
  color: var(--worklist-complete);
}
</style>
