<script setup lang="ts">
import { inject, toRefs } from 'vue';
import ViewOverlayGrid from '@/src/components/ViewOverlayGrid.vue';
import { useSliceConfig } from '@/src/composables/useSliceConfig';
import { Maybe } from '@/src/types';
import { VtkViewContext } from '@/src/components/vtk/context';
import { useWindowingConfig } from '@/src/composables/useWindowingConfig';
import { useOrientationLabels } from '@/src/composables/useOrientationLabels';
import DicomQuickInfoButton from '@/src/components/DicomQuickInfoButton.vue';
import ViewTypeSwitcher from '@/src/components/ViewTypeSwitcher.vue';
import { useImage } from '@/src/composables/useCurrentImage';
import { computed } from 'vue';

type Props = {
  viewId: string;
  imageId: Maybe<string>;
};

const props = defineProps<Props>();
const { viewId, imageId } = toRefs(props);

const view = inject(VtkViewContext);
if (!view) throw new Error('No VtkView');

const { top: topLabel, left: leftLabel } = useOrientationLabels(view);

const {
  config: sliceConfig,
  slice,
  range: sliceRange,
} = useSliceConfig(viewId, imageId);
const {
  config: wlConfig,
  width: windowWidth,
  level: windowLevel,
} = useWindowingConfig(viewId, imageId);
const { metadata } = useImage(imageId);

const LOCKED_ORIENTATION_SUFFIXES = [
  '-coronal',
  '-sagittal',
  '-axial',
  '-multi-oblique',
];
const isLockedOrientationView = computed(() =>
  LOCKED_ORIENTATION_SUFFIXES.some((suffix) => viewId.value.includes(suffix))
);

// A negative color window is how the app inverts the grayscale ramp.
const inverted = computed(() => windowWidth.value < 0);

/**
 * Spoken equivalent of the burned-in overlay text.
 *
 * The rendered image itself is a canvas and conveys nothing to a screen
 * reader; this description gives its state instead, and is referenced by the
 * view container's aria-describedby.
 */
const accessibleDescription = computed(() => {
  const parts = [metadata.value.name];
  if (sliceConfig.value) {
    parts.push(`slice ${slice.value + 1} of ${sliceRange.value[1] + 1}`);
  }
  if (wlConfig.value) {
    parts.push(
      `window ${Math.abs(windowWidth.value).toFixed(0)}`,
      `level ${windowLevel.value.toFixed(0)}`
    );
    if (inverted.value) parts.push('grayscale inverted');
  }
  parts.push(`${topLabel.value} at the top`, `${leftLabel.value} at the left`);
  return `${parts.join(', ')}.`;
});
</script>

<template>
  <view-overlay-grid class="overlay-no-events view-annotations">
    <template v-slot:top-left>
      <div class="annotation-cell">
        <span>{{ metadata.name }}</span>
      </div>
    </template>
    <template v-slot:top-center>
      <div class="annotation-cell">
        <span>{{ topLabel }}</span>
      </div>
    </template>
    <template v-slot:middle-left>
      <div class="annotation-cell">
        <span>{{ leftLabel }}</span>
      </div>
    </template>
    <template v-slot:bottom-left>
      <div class="annotation-cell">
        <div v-if="sliceConfig">
          <span class="slice-label">
            Slice: {{ slice + 1 }}/{{ sliceRange[1] + 1 }}
          </span>
        </div>
        <div v-if="wlConfig">
          W/L: {{ Math.abs(windowWidth).toFixed(2) }} /
          {{ windowLevel.toFixed(2) }}
          <span v-if="inverted">(inverted)</span>
        </div>
      </div>
    </template>
    <template v-slot:top-right>
      <div class="annotation-cell">
        <dicom-quick-info-button :image-id="imageId"></dicom-quick-info-button>
      </div>
    </template>
    <template #bottom-right>
      <div v-if="!isLockedOrientationView" class="annotation-cell" @click.stop>
        <ViewTypeSwitcher :view-id="viewId" :image-id="imageId" />
      </div>
    </template>
  </view-overlay-grid>
  <div :id="`view-state-${viewId}`" class="visually-hidden">
    {{ accessibleDescription }}
  </div>
</template>

<style scoped src="@/src/components/styles/vtk-view.css"></style>
