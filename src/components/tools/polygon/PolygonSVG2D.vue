<template>
  <g>
    <circle
      v-for="({ point: [x, y], radius }, index) in handlePoints"
      :key="index"
      :cx="x"
      :cy="y"
      :stroke="color"
      :stroke-width="strokeWidth"
      fill="transparent"
      :r="radius"
      :visibility="index === 0 ? firstHandleVisibility : handleVisibility"
    />
    <polyline
      :points="linePoints"
      :stroke="color"
      :stroke-width="strokeWidth"
      fill="none"
    />
    <annotation-text-s-v-g2-d
      v-if="textAnchor"
      :x="textAnchor[0]"
      :y="textAnchor[1]"
      :dy="-textOffset"
      anchor="middle"
      :lines="textLines"
    />
  </g>
</template>

<script lang="ts">
import { onVTKEvent } from '@/src/composables/onVTKEvent';
import {
  ANNOTATION_TOOL_HANDLE_RADIUS,
  ANNOTATION_TOOL_TEXT_OFFSET,
} from '@/src/constants';
import AnnotationTextSVG2D from '@/src/components/tools/AnnotationTextSVG2D.vue';
import { worldToSVG } from '@/src/utils/vtk-helpers';
import type { Vector2, Vector3 } from '@kitware/vtk.js/types';
import {
  PropType,
  defineComponent,
  toRefs,
  ref,
  watch,
  inject,
  computed,
} from 'vue';
import { Maybe } from '@/src/types';
import { VtkViewContext } from '@/src/components/vtk/context';
import { useResizeObserver } from '@vueuse/core';
import { vtkFieldRef } from '@/src/core/vtk/vtkFieldRef';

const POINT_RADIUS = ANNOTATION_TOOL_HANDLE_RADIUS;
const FINISHABLE_POINT_RADIUS = POINT_RADIUS;

export default defineComponent({
  components: { AnnotationTextSVG2D },
  props: {
    labelName: String,
    points: {
      type: Array as PropType<Array<Vector3>>,
      required: true,
    },
    color: String,
    strokeWidth: Number,
    movePoint: {
      type: Array as unknown as PropType<Maybe<Vector3>>,
    },
    placing: {
      type: Boolean,
      default: false,
    },
    finishable: {
      type: Boolean,
      default: false,
    },
    showHandles: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const { points, movePoint, placing, finishable, showHandles, labelName } =
      toRefs(props);

    const view = inject(VtkViewContext);
    if (!view) throw new Error('No VtkView');

    const finishPossible = computed(() => {
      return points.value.length > 0 && placing.value && finishable.value;
    });

    const handleVisibility = computed(() => {
      return showHandles.value ? 'visible' : 'hidden';
    });
    const firstHandleVisibility = computed(() => {
      if (finishPossible.value) {
        return 'visible';
      }
      return handleVisibility.value;
    });

    type SVGPoint = { point: Vector2; radius: number };
    const handlePoints = ref<Array<SVGPoint>>([]);
    const linePoints = ref<string>('');

    const updatePoints = () => {
      const viewRenderer = view.renderer;
      const svgPoints = points.value.map((point) => {
        const point2D = worldToSVG(point, viewRenderer);
        return {
          point: point2D ?? ([0, 0] as Vector2),
          radius: POINT_RADIUS,
        };
      });

      // Indicate finishable
      if (finishPossible.value) {
        svgPoints[0].radius = FINISHABLE_POINT_RADIUS;
      }

      // Show point under mouse if one point placed
      if (svgPoints.length > 0 && placing.value && movePoint.value) {
        const moveHandlePoint =
          worldToSVG(movePoint.value, viewRenderer) ?? ([0, 0] as Vector2);
        svgPoints.push({
          point: moveHandlePoint,
          radius: POINT_RADIUS,
        });
      }

      handlePoints.value = svgPoints;

      const lines = handlePoints.value.map(({ point }) => point?.join(','));
      if (!placing.value) {
        // Close the polygon
        lines.push(lines[0]);
      }
      linePoints.value = lines.join(' ');
    };

    const camera = vtkFieldRef(view.renderer, 'activeCamera');
    onVTKEvent(camera, 'onModified', updatePoints);

    watch([points, movePoint, placing], updatePoints, {
      deep: true,
      immediate: true,
    });

    // --- resize --- //

    const container = vtkFieldRef(view.renderWindowView, 'container');
    useResizeObserver(container, () => {
      updatePoints();
    });

    // topmost point of the polygon, so the text sits clear of the shape
    const textAnchor = computed(() => {
      if (placing.value || handlePoints.value.length === 0) return null;
      return handlePoints.value.reduce(
        (highest, { point }) => (point[1] < highest[1] ? point : highest),
        handlePoints.value[0].point
      );
    });

    return {
      devicePixelRatio,
      textAnchor,
      textLines: computed(() => [labelName.value ?? '']),
      textOffset: ANNOTATION_TOOL_TEXT_OFFSET,
      handlePoints,
      linePoints,
      firstHandleVisibility,
      handleVisibility,
    };
  },
});
</script>
