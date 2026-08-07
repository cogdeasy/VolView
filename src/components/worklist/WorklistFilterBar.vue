<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorklistStore } from '@/src/store/worklist';
import type { DateRange, Priority, ReadStatus } from '@/src/types/worklist';
import {
  DATE_RANGE_LABELS,
  PRIORITY_LABELS,
  READ_STATUS_LABELS,
} from '@/src/utils/worklist';

const worklist = useWorklistStore();
const { filters, modalityOptions, visibleStudies, studies, filtersActive } =
  storeToRefs(worklist);

const dateRangeItems = computed(() =>
  (Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((value) => ({
    value,
    title: DATE_RANGE_LABELS[value],
  }))
);

const priorityItems = computed(() =>
  (Object.keys(PRIORITY_LABELS) as Priority[]).map((value) => ({
    value,
    title: PRIORITY_LABELS[value],
  }))
);

const readStatusItems = computed(() =>
  (Object.keys(READ_STATUS_LABELS) as ReadStatus[]).map((value) => ({
    value,
    title: READ_STATUS_LABELS[value],
  }))
);
</script>

<template>
  <div class="filter-bar">
    <v-select
      :model-value="filters.modalities"
      :items="modalityOptions"
      @update:model-value="worklist.setFilter('modalities', $event)"
      label="Modality"
      multiple
      chips
      closable-chips
      clearable
      density="compact"
      variant="outlined"
      hide-details
      class="filter-control filter-control--wide"
      data-testid="worklist-filter-modality"
    />
    <v-select
      :model-value="filters.dateRange"
      :items="dateRangeItems"
      @update:model-value="worklist.setFilter('dateRange', $event)"
      label="Study date"
      density="compact"
      variant="outlined"
      hide-details
      class="filter-control"
      data-testid="worklist-filter-date"
    />
    <v-select
      :model-value="filters.priorities"
      :items="priorityItems"
      @update:model-value="worklist.setFilter('priorities', $event)"
      label="Priority"
      multiple
      chips
      density="compact"
      variant="outlined"
      hide-details
      clearable
      class="filter-control"
      data-testid="worklist-filter-priority"
    />
    <v-select
      :model-value="filters.readStatuses"
      :items="readStatusItems"
      @update:model-value="worklist.setFilter('readStatuses', $event)"
      label="Read status"
      multiple
      chips
      density="compact"
      variant="outlined"
      hide-details
      clearable
      class="filter-control filter-control--wide"
      data-testid="worklist-filter-status"
    />
    <v-btn
      variant="text"
      size="small"
      :disabled="!filtersActive"
      prepend-icon="mdi-filter-remove-outline"
      @click="worklist.resetFilters()"
    >
      Clear
    </v-btn>
    <v-spacer />
    <div class="result-count" data-testid="worklist-result-count">
      {{ visibleStudies.length }} of {{ studies.length }} studies
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.16);
  flex-wrap: wrap;
}

.filter-control {
  max-width: 200px;
  min-width: 160px;
}

.filter-control--wide {
  max-width: 260px;
}

.result-count {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  opacity: 0.68;
  font-variant-numeric: tabular-nums;
}
</style>
