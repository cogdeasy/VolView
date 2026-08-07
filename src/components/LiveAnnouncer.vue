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
// Tracked by id, not by list length: dismissing a notification must not speak
// the one before it again. Watchers are batched, so a failed operation that
// raises several messages in one tick is walked in order rather than reduced
// to its last message.
let announced: string[] = [];
watch(
  () => messageStore.msgList,
  (ids) => {
    ids
      .filter((id) => !announced.includes(id))
      .forEach((id) => {
        const message = messageStore.byID[id];
        if (!message) return;
        if (message.type === MessageType.Error) {
          announcements.announceUrgent(`Error: ${message.title}`);
        } else if (message.type === MessageType.Warning) {
          announcements.announce(`Warning: ${message.title}`);
        }
      });
    // Dropping ids that are gone keeps this from growing for the session.
    announced = [...ids];
  },
  { deep: true }
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
