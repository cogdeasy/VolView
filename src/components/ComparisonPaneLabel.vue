<script setup lang="ts">
import { computed, toRefs } from 'vue';
import { useComparisonStore } from '@/src/store/comparison';
import { useViewStore } from '@/src/store/views';
import { comparisonPaneSpec } from '@/src/core/comparison/layout';
import { BrandColors } from '@/src/branding';

const props = defineProps<{ viewId: string }>();
const { viewId } = toRefs(props);

const comparison = useComparisonStore();
const viewStore = useViewStore();

const spec = computed(() =>
  comparisonPaneSpec(viewStore.getView(viewId.value)?.name)
);

const roleStudy = computed(() => {
  if (!spec.value) return null;
  return spec.value.role === 'current' ? comparison.current : comparison.prior;
});

// The banner has to describe the image actually on screen. A pane's study is
// bound by a watcher, so between picking another study and that flush the role
// alone would caption the wrong image. The overlay reserves its space from the
// same predicate, so the two cannot drift apart.
const boundStudy = computed(() => comparison.paneStudyFor(viewId.value));

const visible = computed(() => comparison.active && !!boundStudy.value);

// An image outside the pair is on neither side of it, so the role and the
// interval it carries are withheld rather than asserted about a study they
// were not measured against.
const roleLabel = computed(() => {
  if (boundStudy.value !== roleStudy.value) return 'Not in comparison';
  if (spec.value?.role !== 'prior') return 'Current';
  const interval = comparison.priorInterval;
  return interval ? `Prior — ${interval}` : 'Prior';
});

const accent = computed(() => {
  if (boundStudy.value !== roleStudy.value) return BrandColors.priorStudy;
  return spec.value?.role === 'prior'
    ? BrandColors.priorStudy
    : BrandColors.currentStudy;
});

const details = computed(() => {
  const info = boundStudy.value;
  if (!info) return [];
  return [
    info.patientName,
    info.studyDescription,
    info.displayDate ?? 'date unknown',
    info.seriesDescription,
    info.modality,
  ].filter(Boolean);
});
</script>

<template>
  <div
    v-if="visible"
    class="comparison-pane-label"
    :style="{ borderBottomColor: accent }"
  >
    <span class="role" :style="{ color: accent }">{{ roleLabel }}</span>
    <span class="details">{{ details.join(' · ') }}</span>
  </div>
</template>

<style scoped>
.comparison-pane-label {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: baseline;
  column-gap: 10px;
  padding: 3px 10px;
  background: rgba(0, 0, 0, 0.72);
  border-bottom: 2px solid transparent;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}

.role {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  flex: 0 0 auto;
}

.details {
  color: #e8ecf2;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
