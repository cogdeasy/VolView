<script setup lang="ts">
import { computed, inject, ref, toRefs, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import type { Vector3 } from '@kitware/vtk.js/types';
import { VtkViewContext } from '@/src/components/vtk/context';
import { onVTKEvent } from '@/src/composables/onVTKEvent';
import { vtkFieldRef } from '@/src/core/vtk/vtkFieldRef';
import { worldToSVG } from '@/src/utils/vtk-helpers';
import { useComparisonStore } from '@/src/store/comparison';
import { useViewStore } from '@/src/store/views';
import { useRulerStore } from '@/src/store/tools/rulers';
import { useSliceConfig } from '@/src/composables/useSliceConfig';
import { comparisonPaneSpec } from '@/src/core/comparison/layout';
import { frameOfReferenceToImageSliceAndAxis } from '@/src/utils/frameOfReference';
import {
  currentSliceToPriorSlice,
  placeOnSlicePlane,
  sliceToPhysicalPosition,
} from '@/src/utils/comparison';
import { BrandColors } from '@/src/branding';
import { Maybe } from '@/src/types';

const props = defineProps<{ viewId: string; imageId: Maybe<string> }>();
const { viewId, imageId } = toRefs(props);

const view = inject(VtkViewContext);
if (!view) throw new Error('No VtkView');

const comparison = useComparisonStore();
const viewStore = useViewStore();
const rulerStore = useRulerStore();

const spec = computed(() =>
  comparisonPaneSpec(viewStore.getView(viewId.value)?.name)
);

const isPriorPane = computed(
  () =>
    comparison.active &&
    spec.value?.role === 'prior' &&
    imageId.value === comparison.priorImageID
);

const { slice: priorSlice } = useSliceConfig(viewId, imageId);

const currentStudyRulers = computed(() =>
  comparison.currentImageID
    ? rulerStore.rulers.filter(
        (ruler) =>
          ruler.imageID === comparison.currentImageID &&
          !ruler.hidden &&
          !ruler.placing
      )
    : []
);

const alignment = computed(() =>
  spec.value ? comparison.alignmentForAxis(spec.value.axis) : null
);

/**
 * Measurements from the current study, expressed on the prior study's slice
 * plane. Only measurements whose counterpart lands on the slice the reader is
 * looking at are shown, so the prior pane stays clean.
 */
const counterparts = computed(() => {
  const paneSpec = spec.value;
  const assessment = alignment.value;
  if (!isPriorPane.value || !paneSpec || assessment?.mode !== 'physical') {
    return [];
  }

  const currentMetadata = comparison.metadataFor(comparison.currentImageID);
  const priorMetadata = comparison.metadataFor(comparison.priorImageID);
  if (!currentMetadata || !priorMetadata) return [];

  const { axis } = paneSpec;

  return currentStudyRulers.value.flatMap((ruler) => {
    const located = frameOfReferenceToImageSliceAndAxis(
      ruler.frameOfReference,
      currentMetadata,
      { allowNonIntegralSlice: true, allowOutOfBoundsSlice: true }
    );
    if (!located || located.axis !== axis) return [];

    const mapped = currentSliceToPriorSlice(
      currentMetadata,
      priorMetadata,
      axis,
      located.slice,
      'physical',
      comparison.sliceOffsetFor(axis)
    );
    if (mapped !== priorSlice.value) return [];

    const planePosition = sliceToPhysicalPosition(priorMetadata, axis, mapped);
    return [
      {
        id: ruler.id,
        color: ruler.color,
        label: ruler.labelName || ruler.name,
        points: [
          placeOnSlicePlane(ruler.firstPoint, axis, planePosition),
          placeOnSlicePlane(ruler.secondPoint, axis, planePosition),
        ] as Vector3[],
      },
    ];
  });
});

/** True when the reader has measurements that cannot be carried over. */
const unavailable = computed(
  () =>
    isPriorPane.value &&
    currentStudyRulers.value.length > 0 &&
    alignment.value?.mode === 'index'
);

interface ProjectedCounterpart {
  id: string;
  color: string;
  label: string;
  first: { x: number; y: number };
  second: { x: number; y: number };
}

const projected = ref<ProjectedCounterpart[]>([]);

function project() {
  projected.value = counterparts.value.flatMap((counterpart) => {
    const first = worldToSVG(counterpart.points[0], view!.renderer);
    const second = worldToSVG(counterpart.points[1], view!.renderer);
    if (!first || !second) return [];
    return [
      {
        id: counterpart.id,
        color: counterpart.color,
        label: counterpart.label,
        first: { x: first[0], y: first[1] },
        second: { x: second[0], y: second[1] },
      },
    ];
  });
}

const camera = vtkFieldRef(view.renderer, 'activeCamera');
onVTKEvent(camera, 'onModified', project);
useResizeObserver(vtkFieldRef(view.renderWindowView, 'container'), project);
watch(counterparts, project, { immediate: true, deep: true });

const markerColor = BrandColors.accent;
</script>

<template>
  <svg v-if="isPriorPane" class="overlay-no-events">
    <g
      v-for="counterpart in projected"
      :key="counterpart.id"
      data-testid="prior-counterpart"
    >
      <line
        :x1="counterpart.first.x"
        :y1="counterpart.first.y"
        :x2="counterpart.second.x"
        :y2="counterpart.second.y"
        :stroke="counterpart.color"
        stroke-width="1"
        stroke-dasharray="4 3"
        opacity="0.9"
      />
      <circle
        :cx="counterpart.first.x"
        :cy="counterpart.first.y"
        r="4"
        fill="none"
        :stroke="counterpart.color"
        stroke-width="1"
        stroke-dasharray="2 2"
      />
      <circle
        :cx="counterpart.second.x"
        :cy="counterpart.second.y"
        r="4"
        fill="none"
        :stroke="counterpart.color"
        stroke-width="1"
        stroke-dasharray="2 2"
      />
      <text
        :x="counterpart.second.x + 8"
        :y="counterpart.second.y - 8"
        :fill="markerColor"
        stroke="black"
        stroke-width="0.6"
        font-size="12"
        font-weight="600"
      >
        {{ counterpart.label }} · same location
      </text>
    </g>
  </svg>
  <div v-if="unavailable" class="counterpart-note">
    Counterparts need a shared frame of reference
  </div>
</template>

<style scoped src="@/src/components/styles/vtk-view.css"></style>

<style scoped>
.counterpart-note {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.7rem;
  color: #ffcc80;
  pointer-events: none;
  user-select: none;
}
</style>
