<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnnouncementStore } from '@/src/store/announcements';
import { useToolStore } from '@/src/store/tools';
import useLoadDataStore from '@/src/store/load-data';
import { useMessageStore, MessageType } from '@/src/store/messages';

/**
 * The app's ARIA live regions.
 *
 * Anything the app changes without moving focus - tool changes, load progress,
 * errors, slice jumps - is announced here so a screen reader user is told what
 * happened.
 */
const announcements = useAnnouncementStore();
const { polite, assertive } = storeToRefs(announcements);

const toolStore = useToolStore();
watch(
  () => toolStore.currentTool,
  (tool) => announcements.announce(`${tool} tool active`)
);

const loadDataStore = useLoadDataStore();
watch(
  () => loadDataStore.isLoading,
  (loading) =>
    announcements.announce(loading ? 'Loading data' : 'Loading complete')
);

const messageStore = useMessageStore();
watch(
  () => messageStore.messages.length,
  () => {
    const latest = messageStore.messages[messageStore.messages.length - 1];
    if (!latest) return;
    if (latest.type === MessageType.Error) {
      announcements.announceUrgent(`Error: ${latest.title}`);
    } else if (latest.type === MessageType.Warning) {
      announcements.announce(`Warning: ${latest.title}`);
    }
  }
);

const politeText = computed(() => polite.value);
const assertiveText = computed(() => assertive.value);
</script>

<template>
  <div class="visually-hidden">
    <div role="status" aria-live="polite" aria-atomic="true">
      {{ politeText }}
    </div>
    <div role="alert" aria-live="assertive" aria-atomic="true">
      {{ assertiveText }}
    </div>
  </div>
</template>
