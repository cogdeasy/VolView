<script setup lang="ts">
import { computed } from 'vue';
import { useComparisonStore, MAX_SLICE_OFFSET } from '@/src/store/comparison';
import type { ComparisonLink, StudyDescriptor } from '@/src/store/comparison';
import { BrandColors } from '@/src/branding';

const comparison = useComparisonStore();

const LINK_LABELS: Array<{ key: ComparisonLink; label: string }> = [
  { key: 'slice', label: 'Slice position' },
  { key: 'windowLevel', label: 'Window / level' },
  { key: 'camera', label: 'Zoom & pan' },
];

const studyTitle = (study: StudyDescriptor) =>
  [
    study.seriesDescription,
    study.displayDate ?? 'date unknown',
    study.patientName,
  ].join(' · ');

// Cine series render in their own player rather than a slice view, so a pane
// showing one carries no banner and follows nothing. They stay listed, and
// unpickable, rather than disappearing from a list of what is loaded.
const options = computed(() =>
  comparison.candidates.map((study) => ({
    title: studyTitle(study),
    value: study.imageID,
    props: study.isCine
      ? { disabled: true, subtitle: 'Cine series cannot be compared' }
      : undefined,
  }))
);

const currentSelection = computed({
  get: () => comparison.currentImageID,
  set: (value) => comparison.setCurrentImageID(value),
});

const priorSelection = computed({
  get: () => comparison.priorImageID,
  set: (value) => comparison.setPriorImageID(value),
});

const linkedCount = computed(
  () => LINK_LABELS.filter(({ key }) => comparison.links[key]).length
);

const linkSummary = computed(() => {
  if (comparison.allLinked) return 'Linked';
  if (linkedCount.value === 0) return 'Unlinked';
  return `${linkedCount.value} of ${LINK_LABELS.length} linked`;
});

const alignment = computed(() => comparison.alignment);
const isPhysical = computed(() => alignment.value?.mode === 'physical');
const alignmentLabel = computed(() =>
  isPhysical.value ? 'Patient position' : 'Relative slice position'
);

const needsSecondStudy = computed(() => comparison.candidates.length < 2);
</script>

<template>
  <div v-if="comparison.isComparisonLayout" class="comparison-bar">
    <v-alert
      v-if="needsSecondStudy"
      density="compact"
      type="info"
      variant="tonal"
      class="flex-grow-1"
      text="Load a second study to compare. Both studies stay in the Data panel and can be picked here."
    />
    <template v-else>
      <div class="study-pickers">
        <v-select
          v-model="currentSelection"
          :items="options"
          label="Current"
          density="compact"
          variant="outlined"
          hide-details
          class="study-select"
          data-testid="comparison-current-select"
        />
        <v-btn
          icon
          variant="text"
          size="small"
          density="comfortable"
          aria-label="Swap current and prior"
          data-testid="comparison-swap"
          @click="comparison.swap()"
        >
          <v-icon>mdi-swap-horizontal</v-icon>
          <v-tooltip activator="parent" location="bottom">
            Swap current and prior
          </v-tooltip>
        </v-btn>
        <v-select
          v-model="priorSelection"
          :items="options"
          label="Prior"
          density="compact"
          variant="outlined"
          hide-details
          class="study-select"
          data-testid="comparison-prior-select"
        />
      </div>

      <v-divider vertical class="mx-1" />

      <div class="link-controls">
        <v-btn
          :color="comparison.allLinked ? 'primary' : undefined"
          :variant="comparison.allLinked ? 'flat' : 'outlined'"
          :prepend-icon="
            comparison.allLinked ? 'mdi-link-variant' : 'mdi-link-variant-off'
          "
          size="small"
          data-testid="comparison-link-toggle"
          @click="comparison.setAllLinks(!comparison.allLinked)"
        >
          {{ linkSummary }}
        </v-btn>
        <v-menu location="bottom end" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-tune-variant"
              variant="text"
              size="small"
              density="comfortable"
              aria-label="Choose what stays linked"
              data-testid="comparison-link-menu"
            />
          </template>
          <v-card min-width="240">
            <v-card-text class="py-2">
              <v-switch
                v-for="link in LINK_LABELS"
                :key="link.key"
                :model-value="comparison.links[link.key]"
                :label="link.label"
                color="primary"
                density="compact"
                hide-details
                :data-testid="`comparison-link-${link.key}`"
                @update:model-value="
                  comparison.setLink(link.key, $event === true)
                "
              />
            </v-card-text>
          </v-card>
        </v-menu>
      </div>

      <v-chip
        v-if="alignment"
        size="small"
        variant="tonal"
        :color="isPhysical ? undefined : 'warning'"
        :prepend-icon="isPhysical ? 'mdi-crosshairs-gps' : 'mdi-alert-outline'"
        data-testid="comparison-alignment-chip"
      >
        {{ alignmentLabel }}
        <v-tooltip activator="parent" location="bottom" max-width="320">
          {{ alignment.reason }}
        </v-tooltip>
      </v-chip>

      <v-divider vertical class="mx-1" />

      <div class="nudge">
        <span class="nudge-label">
          Align priors
          <v-tooltip activator="parent" location="bottom" max-width="320">
            Manual slice offset applied to the prior study, in prior slices.
            Registration is out of scope, so misalignment is corrected by hand.
          </v-tooltip>
        </span>
        <v-btn
          icon="mdi-minus"
          variant="text"
          size="x-small"
          density="comfortable"
          aria-label="Nudge prior one slice back"
          data-testid="comparison-nudge-down"
          :disabled="comparison.sliceOffset <= -MAX_SLICE_OFFSET"
          @click="comparison.nudgeSliceOffset(-1)"
        />
        <span
          class="nudge-value"
          :style="{ color: comparison.sliceOffset ? BrandColors.accent : '' }"
          data-testid="comparison-nudge-value"
        >
          {{ comparison.sliceOffset > 0 ? '+' : ''
          }}{{ comparison.sliceOffset }}
        </span>
        <v-btn
          icon="mdi-plus"
          variant="text"
          size="x-small"
          density="comfortable"
          aria-label="Nudge prior one slice forward"
          data-testid="comparison-nudge-up"
          :disabled="comparison.sliceOffset >= MAX_SLICE_OFFSET"
          @click="comparison.nudgeSliceOffset(1)"
        />
        <v-btn
          v-if="comparison.sliceOffset !== 0"
          variant="text"
          size="x-small"
          data-testid="comparison-nudge-reset"
          @click="comparison.setSliceOffset(0)"
        >
          Reset
        </v-btn>
      </div>
    </template>
  </div>
</template>

<style scoped>
.comparison-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 12px;
  row-gap: 8px;
  padding: 6px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgb(var(--v-theme-on-surface-variant));
}

.study-pickers {
  display: flex;
  align-items: center;
  column-gap: 6px;
  flex: 1 1 460px;
  min-width: 320px;
}

.study-select {
  min-width: 0;
}

.link-controls {
  display: flex;
  align-items: center;
  column-gap: 2px;
}

.nudge {
  display: flex;
  align-items: center;
  column-gap: 2px;
}

.nudge-label {
  font-size: 0.75rem;
  opacity: 0.8;
  margin-right: 4px;
}

.nudge-value {
  min-width: 28px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
