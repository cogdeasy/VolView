<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Brand } from '@/src/branding';
import PhilipsFullLogo from '@/src/components/icons/PhilipsFullLogo.vue';
import WorklistDemoDialog from '@/src/components/worklist/WorklistDemoDialog.vue';
import WorklistDetailPanel from '@/src/components/worklist/WorklistDetailPanel.vue';
import WorklistFilterBar from '@/src/components/worklist/WorklistFilterBar.vue';
import WorklistTable from '@/src/components/worklist/WorklistTable.vue';
import { useWorklistTheme } from '@/src/composables/useWorklistTheme';
import { useWorklistStore } from '@/src/store/worklist';

defineProps<{
  /** Whether a study is already open behind the worklist. */
  hasData?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-files'): void;
}>();

const worklist = useWorklistStore();
const { filters, unreadCount, statCount } = storeToRefs(worklist);
const cssVars = useWorklistTheme();
</script>

<template>
  <div class="worklist" :style="cssVars" data-testid="worklist">
    <header class="worklist__header">
      <philips-full-logo class="worklist__lockup" />
      <div class="worklist__heading">
        <div class="worklist__title">Worklist</div>
        <div class="worklist__subtitle">
          {{ unreadCount }} unread
          <template v-if="statCount"> &middot; {{ statCount }} STAT </template>
        </div>
      </div>
      <v-text-field
        :model-value="filters.search"
        placeholder="Search patient, ID, accession, description"
        @update:model-value="worklist.setFilter('search', $event)"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="solo-filled"
        flat
        hide-details
        clearable
        class="worklist__search"
        data-testid="worklist-search"
      />
      <v-btn
        variant="text"
        prepend-icon="mdi-folder-open-outline"
        @click="emit('open-files')"
      >
        Open files
      </v-btn>
      <v-btn
        variant="tonal"
        color="primary"
        :prepend-icon="hasData ? 'mdi-arrow-left' : 'mdi-database-outline'"
        data-testid="worklist-back-to-viewer"
        @click="worklist.hide()"
      >
        {{ hasData ? 'Back to viewer' : 'Data browser' }}
      </v-btn>
    </header>

    <worklist-filter-bar />

    <div class="worklist__body">
      <worklist-table />
      <worklist-detail-panel />
    </div>

    <footer class="worklist__footer">
      <span>{{ Brand.productName }}</span>
      <span class="worklist__footer-note">
        Prototype worklist — entries marked as sample or demo are not from a
        clinical archive.
      </span>
    </footer>

    <worklist-demo-dialog />
  </div>
</template>

<style scoped>
.worklist {
  /* Sits over the whole application shell: the landing screen owns the
     window, but the viewer underneath keeps its state. */
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background-color: var(--worklist-surface);
  color: rgb(var(--v-theme-on-surface));
}

.worklist__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  height: 72px;
  flex: 0 0 72px;
  background-color: var(--worklist-header-bg);
  border-bottom: 1px solid rgba(var(--v-border-color), 0.2);
  box-shadow: inset 0 -2px 0 0 var(--worklist-accent);
}

.worklist__lockup {
  flex: 0 0 auto;
}

.worklist__heading {
  flex: 0 0 auto;
  padding-left: 8px;
  border-left: 1px solid rgba(var(--v-border-color), 0.3);
  padding-block: 4px;
  margin-left: 4px;
  padding-inline-start: 20px;
}

.worklist__title {
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.worklist__subtitle {
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.62;
  font-variant-numeric: tabular-nums;
}

.worklist__search {
  max-width: 420px;
  margin-left: auto;
}

.worklist__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  background-color: rgb(var(--v-theme-surface));
}

.worklist__footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 24px;
  font-size: 0.6875rem;
  opacity: 0.55;
  border-top: 1px solid rgba(var(--v-border-color), 0.16);
  background-color: var(--worklist-header-bg);
}

.worklist__footer-note {
  margin-left: auto;
}
</style>
