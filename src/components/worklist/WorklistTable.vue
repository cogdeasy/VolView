<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import PriorityFlag from '@/src/components/worklist/PriorityFlag.vue';
import ReadStatusChip from '@/src/components/worklist/ReadStatusChip.vue';
import { useWorklistStore } from '@/src/store/worklist';
import type { SortKey, WorklistStudy } from '@/src/types/worklist';
import {
  formatAgeSex,
  formatDicomDate,
  formatDicomTime,
  formatPatientName,
} from '@/src/utils/worklist';

const worklist = useWorklistStore();
const { visibleStudies, selectedKey, sort, openingKey } = storeToRefs(worklist);

interface Column {
  key: SortKey | null;
  label: string;
  align?: 'end' | 'center';
  width?: string;
}

const columns: Column[] = [
  { key: 'priority', label: 'Priority', width: '92px' },
  { key: 'patientName', label: 'Patient' },
  { key: 'accessionNumber', label: 'Accession', width: '132px' },
  { key: 'modality', label: 'Mod.', width: '72px' },
  { key: 'description', label: 'Study description' },
  { key: null, label: 'Body part', width: '112px' },
  { key: 'studyDateTime', label: 'Study date', width: '132px' },
  { key: null, label: 'Ser. / Img.', align: 'end', width: '104px' },
  { key: 'readStatus', label: 'Status', width: '124px' },
  { key: null, label: 'Reader', width: '148px' },
];

const emptyMessage = computed(() =>
  worklist.filtersActive
    ? 'No studies match the current filters.'
    : 'No studies in the worklist. Use Open files to load one.'
);

function sortIcon(key: SortKey | null) {
  if (!key || sort.value.key !== key) return 'mdi-unfold-more-horizontal';
  return sort.value.direction === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down';
}

function originLabel(study: WorklistStudy) {
  if (study.origin === 'loaded') return 'Loaded';
  if (study.origin === 'sample') return 'Sample data';
  return 'Demo entry';
}
</script>

<template>
  <div class="worklist-table-wrapper">
    <table class="worklist-table" data-testid="worklist-table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.label"
            :style="column.width ? { width: column.width } : undefined"
            :class="{
              'text-right': column.align === 'end',
              sortable: !!column.key,
              active: !!column.key && sort.key === column.key,
            }"
            @click="column.key && worklist.setSort(column.key)"
          >
            <span class="header-label">
              {{ column.label }}
              <v-icon
                v-if="column.key"
                :icon="sortIcon(column.key)"
                size="13"
                class="sort-icon"
              />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="study in visibleStudies"
          :key="study.key"
          :class="{
            selected: study.key === selectedKey,
            unread: study.readStatus === 'unread',
          }"
          data-testid="worklist-row"
          @click="worklist.select(study.key)"
          @dblclick="worklist.openStudy(study)"
        >
          <td><priority-flag :priority="study.priority" /></td>
          <td>
            <div class="patient-name">
              {{ formatPatientName(study.patientName) || 'Anonymous' }}
            </div>
            <div class="secondary">
              {{ study.patientId }}
              <span v-if="formatAgeSex(study)">
                &middot; {{ formatAgeSex(study) }}
              </span>
            </div>
          </td>
          <td class="mono">{{ study.accessionNumber || '—' }}</td>
          <td>
            <span class="modality">{{ study.modality || '—' }}</span>
          </td>
          <td>
            <div class="text-truncate">{{ study.description || '—' }}</div>
            <div class="secondary origin">
              <v-icon
                v-if="study.origin !== 'loaded'"
                icon="mdi-flask-outline"
                size="12"
              />
              <v-icon v-else icon="mdi-database-check-outline" size="12" />
              {{ originLabel(study) }}
            </div>
          </td>
          <td class="secondary">{{ study.bodyPart || '—' }}</td>
          <td>
            <div>{{ formatDicomDate(study.studyDate) || '—' }}</div>
            <div class="secondary">{{ formatDicomTime(study.studyTime) }}</div>
          </td>
          <td class="text-right mono">
            {{ study.seriesCount }} / {{ study.imageCount }}
          </td>
          <td><read-status-chip :status="study.readStatus" /></td>
          <td class="secondary text-truncate">
            {{ study.assignedReader || 'Unassigned' }}
          </td>
        </tr>
        <tr v-if="!visibleStudies.length">
          <td :colspan="columns.length" class="empty">
            <v-icon icon="mdi-clipboard-text-search-outline" size="32" />
            <div>{{ emptyMessage }}</div>
          </td>
        </tr>
      </tbody>
    </table>
    <v-progress-linear
      v-if="openingKey"
      indeterminate
      color="primary"
      class="opening-bar"
    />
  </div>
</template>

<style scoped>
.worklist-table-wrapper {
  flex: 1 1 auto;
  overflow: auto;
  position: relative;
}

.worklist-table {
  width: 100%;
  /* Not `collapse`: collapsed borders are dropped from the sticky header
     once the body scrolls under it. */
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8125rem;
  table-layout: fixed;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.24);
  padding: 10px 12px;
  text-align: left;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* Dimmed via the text color, not opacity: an opaque background is what
     keeps the scrolling rows from showing through. */
  color: rgba(var(--v-theme-on-surface), 0.72);
  user-select: none;
  white-space: nowrap;
}

thead th.sortable {
  cursor: pointer;
}

thead th.sortable:hover,
thead th.active {
  color: var(--worklist-primary);
}

.header-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sort-icon {
  opacity: 0.5;
}

thead th.active .sort-icon {
  opacity: 1;
}

tbody tr {
  cursor: pointer;
}

tbody td {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

tbody tr:hover {
  background-color: var(--worklist-row-hover);
}

tbody tr.selected {
  background-color: rgb(var(--v-theme-selection-bg-color));
  box-shadow: inset 3px 0 0 0 var(--worklist-accent);
}

tbody td {
  padding: 8px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

tbody tr.unread .patient-name {
  font-weight: 700;
}

.patient-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.secondary {
  font-size: 0.6875rem;
  opacity: 0.62;
}

.origin {
  display: flex;
  align-items: center;
  gap: 3px;
}

.mono {
  font-variant-numeric: tabular-nums;
}

.modality {
  display: inline-block;
  min-width: 30px;
  padding: 1px 5px;
  border: 1px solid rgba(var(--v-border-color), 0.4);
  border-radius: 2px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-align: center;
}

.empty {
  padding: 64px 0;
  text-align: center;
  opacity: 0.6;
  white-space: normal;
}

.opening-bar {
  position: sticky;
  bottom: 0;
}
</style>
