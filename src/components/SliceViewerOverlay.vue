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
import { useComparisonStore } from '@/src/store/comparison';

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

// A pane's orientation belongs to the comparison layout: switching its view
// type renames the view, which quietly drops the pane out of the pair — so the
// switcher goes as soon as the layout does, pair or no pair. A pane the pair
// itself refuses, its name and its rendered orientation contradicting each
// other, keeps the switcher: there is no pairing to protect, and using it is
// how the reader gets such a view back to an ordinary one.
const comparison = useComparisonStore();
const isComparisonPane = computed(() => !!comparison.paneSpecFor(viewId.value));

// Space is reserved for the study banner on the banner's own terms, so the
// annotations cannot be pushed down for a caption that is not drawn, nor the
// series name suppressed as a duplicate of one.
const hasPaneLabel = computed(
  () => comparison.active && !!comparison.paneStudyFor(viewId.value)
);
</script>

<template>
  <view-overlay-grid
    class="overlay-no-events view-annotations"
    :class="{ 'comparison-inset': hasPaneLabel }"
  >
    <template v-slot:top-left>
      <div v-if="!hasPaneLabel" class="annotation-cell">
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
          W/L: {{ windowWidth.toFixed(2) }} / {{ windowLevel.toFixed(2) }}
        </div>
      </div>
    </template>
    <template v-slot:top-right>
      <div class="annotation-cell">
        <dicom-quick-info-button :image-id="imageId"></dicom-quick-info-button>
      </div>
    </template>
    <template #bottom-right>
      <div
        v-if="!isLockedOrientationView && !isComparisonPane"
        class="annotation-cell"
        @click.stop
      >
        <ViewTypeSwitcher :view-id="viewId" :image-id="imageId" />
      </div>
    </template>
  </view-overlay-grid>
</template>

<style scoped src="@/src/components/styles/vtk-view.css"></style>

<style scoped>
.comparison-inset {
  box-sizing: border-box;
  padding-top: var(--comparison-banner-height);
}
</style>
