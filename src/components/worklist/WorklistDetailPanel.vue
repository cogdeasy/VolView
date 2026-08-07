<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { storeToRefs } from 'pinia';
import PriorityFlag from '@/src/components/worklist/PriorityFlag.vue';
import ReadStatusChip from '@/src/components/worklist/ReadStatusChip.vue';
import { useImageCacheStore } from '@/src/store/image-cache';
import { useWorklistStore } from '@/src/store/worklist';
import type { WorklistStudy } from '@/src/types/worklist';
import { logError } from '@/src/utils/loggers';
import {
  formatAgeSex,
  formatDicomDateTime,
  formatPatientName,
} from '@/src/utils/worklist';

const worklist = useWorklistStore();
const imageCacheStore = useImageCacheStore();
const { selectedStudy, openingKey, openingProgress } = storeToRefs(worklist);

/** Volume key -> data URI, for series whose pixel data is already in memory. */
const thumbnails = reactive<Record<string, string>>({});
/** Series whose pixel data cannot be rendered; they keep the modality tile. */
const unrenderable = new Set<string>();

// Also keyed on the image cache's contents, so a series registered after the
// panel opened is picked up; getThumbnail() itself waits for the pixel data,
// so one fire per registration is enough.
watch(
  [selectedStudy, () => imageCacheStore.imageIds.join(',')],
  ([study]) => {
    if (!study) return;
    study.series.forEach(async (series) => {
      if (series.thumbnail || thumbnails[series.key]) return;
      if (unrenderable.has(series.key)) return;
      const image = imageCacheStore.imageById[series.key];
      if (!image) return;
      try {
        const thumbnail = await image.getThumbnail();
        if (thumbnail) thumbnails[series.key] = thumbnail;
        else unrenderable.add(series.key);
      } catch (err) {
        // A preview is not worth a notification: the series still lists its
        // modality, and getThumbnail() caches its rejection anyway.
        unrenderable.add(series.key);
        logError(err);
      }
    });
  },
  { immediate: true }
);

const isOpening = computed(
  () => !!selectedStudy.value && openingKey.value === selectedStudy.value.key
);

const openLabel = computed(() =>
  selectedStudy.value?.origin === 'sample'
    ? 'Download and open study'
    : 'Open study'
);

const provenance = computed(() => {
  const study = selectedStudy.value;
  if (!study) return '';
  if (study.origin === 'loaded')
    return 'Metadata read from the DICOM tags of the loaded series.';
  if (study.origin === 'sample')
    return 'Real sample imaging with demonstration demographics; downloads on open.';
  return 'Demonstration entry — no image data is attached to this study.';
});

function seriesThumbnail(study: WorklistStudy, key: string) {
  const series = study.series.find((entry) => entry.key === key);
  return series?.thumbnail ?? thumbnails[key] ?? '';
}
</script>

<template>
  <aside
    v-if="selectedStudy"
    class="detail-panel"
    data-testid="worklist-detail"
  >
    <div class="detail-header">
      <div class="detail-header__text">
        <div class="detail-patient">
          {{ formatPatientName(selectedStudy.patientName) || 'Anonymous' }}
        </div>
        <div class="detail-sub">
          {{ selectedStudy.patientId }}
          <span v-if="formatAgeSex(selectedStudy)">
            &middot; {{ formatAgeSex(selectedStudy) }}
          </span>
        </div>
      </div>
      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        aria-label="Close preview"
        @click="worklist.select(null)"
      />
    </div>

    <div class="detail-flags">
      <priority-flag :priority="selectedStudy.priority" />
      <read-status-chip :status="selectedStudy.readStatus" />
    </div>

    <dl class="detail-grid">
      <dt>Accession</dt>
      <dd>{{ selectedStudy.accessionNumber || '—' }}</dd>
      <dt>Study</dt>
      <dd>{{ selectedStudy.description || '—' }}</dd>
      <dt>Body part</dt>
      <dd>{{ selectedStudy.bodyPart || '—' }}</dd>
      <dt>Modality</dt>
      <dd>{{ selectedStudy.modality || '—' }}</dd>
      <dt>Acquired</dt>
      <dd>
        {{
          formatDicomDateTime(
            selectedStudy.studyDate,
            selectedStudy.studyTime
          ) || '—'
        }}
      </dd>
      <dt>Reader</dt>
      <dd>{{ selectedStudy.assignedReader || 'Unassigned' }}</dd>
    </dl>

    <div class="detail-section-title">
      Series
      <span class="detail-count">{{ selectedStudy.series.length }}</span>
    </div>

    <div class="series-list">
      <div
        v-for="series in selectedStudy.series"
        :key="series.key"
        class="series-card"
      >
        <div class="series-thumb">
          <v-img
            v-if="seriesThumbnail(selectedStudy, series.key)"
            :src="seriesThumbnail(selectedStudy, series.key)"
            cover
            height="64"
            width="64"
          />
          <span v-else class="series-thumb__fallback">
            {{ series.modality || '?' }}
          </span>
        </div>
        <div class="series-meta">
          <div class="series-desc">
            {{ series.description || `Series ${series.seriesNumber}` }}
          </div>
          <div class="detail-sub">
            Series {{ series.seriesNumber || '—' }} &middot;
            {{ series.modality || '—' }} &middot; {{ series.imageCount }} img
          </div>
        </div>
      </div>
    </div>

    <div class="detail-footer">
      <div class="provenance">
        <v-icon
          :icon="
            selectedStudy.origin === 'loaded'
              ? 'mdi-database-check-outline'
              : 'mdi-flask-outline'
          "
          size="14"
        />
        {{ provenance }}
      </div>
      <v-btn
        block
        color="primary"
        variant="flat"
        :loading="isOpening"
        prepend-icon="mdi-open-in-app"
        data-testid="worklist-open-study"
        @click="worklist.openStudy(selectedStudy)"
      >
        {{ openLabel }}
      </v-btn>
      <v-progress-linear
        v-if="isOpening && openingProgress > 0"
        :model-value="openingProgress"
        color="primary"
        height="3"
        class="mt-1"
      />
      <v-btn
        v-if="selectedStudy.readStatus !== 'read'"
        block
        variant="text"
        size="small"
        class="mt-1"
        prepend-icon="mdi-check"
        @click="worklist.setReadStatus(selectedStudy.key, 'read')"
      >
        Mark as read
      </v-btn>
    </div>
  </aside>
</template>

<style scoped>
.detail-panel {
  width: 340px;
  flex: 0 0 340px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(var(--v-border-color), 0.16);
  background-color: rgb(var(--v-theme-surface));
  overflow-y: auto;
  padding: 16px 20px 20px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.detail-header__text {
  min-width: 0;
}

.detail-patient {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.3;
}

.detail-sub {
  font-size: 0.75rem;
  opacity: 0.62;
}

.detail-flags {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 88px 1fr;
  row-gap: 6px;
  column-gap: 10px;
  font-size: 0.8125rem;
  margin-bottom: 20px;
}

.detail-grid dt {
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.55;
  padding-top: 2px;
}

.detail-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.detail-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.16);
}

.detail-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.series-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  flex: 1 1 auto;
}

.series-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.series-thumb {
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--v-border-color), 0.14);
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.series-thumb__fallback {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.6;
}

.series-meta {
  min-width: 0;
}

.series-desc {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-footer {
  padding-top: 12px;
  border-top: 1px solid rgba(var(--v-border-color), 0.16);
}

.provenance {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.6875rem;
  line-height: 1.4;
  opacity: 0.66;
  margin-bottom: 12px;
}
</style>
