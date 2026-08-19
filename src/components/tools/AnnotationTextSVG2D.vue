<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAnnotationDisplayStore } from '@/src/store/tools/annotationDisplay';
import { ANNOTATION_TOOL_TEXT_SIZE } from '@/src/constants';

const props = withDefaults(
  defineProps<{
    // anchor point in SVG coordinates
    x: number;
    y: number;
    dx?: number;
    dy?: number;
    anchor?: 'start' | 'middle' | 'end';
    // stack the lines above the anchor point instead of below it
    above?: boolean;
    lines: Array<string>;
    textSize?: number;
  }>(),
  {
    dx: 0,
    dy: 0,
    anchor: 'start',
    above: true,
    textSize: ANNOTATION_TOOL_TEXT_SIZE,
  }
);

const { overlayTextVisible } = storeToRefs(useAnnotationDisplayStore());

const visibleLines = computed(() =>
  overlayTextVisible.value ? props.lines.filter((line) => !!line) : []
);

const lineHeight = computed(() => props.textSize * 1.15);

// Grow the text block away from the annotation so the anchor line always sits
// closest to the shape.
const firstLineDy = computed(() =>
  props.above ? -(visibleLines.value.length - 1) * lineHeight.value : 0
);
</script>

<template>
  <text
    v-if="visibleLines.length > 0"
    :x="x"
    :y="y"
    :dx="dx"
    :dy="dy"
    :text-anchor="anchor"
    stroke-width="0.75"
    stroke="black"
    fill="white"
    :font-size="`${textSize}px`"
    font-weight="bold"
  >
    <tspan
      v-for="(line, index) in visibleLines"
      :key="index"
      :x="x"
      :dx="dx"
      :dy="index === 0 ? firstLineDy : lineHeight"
    >
      {{ line }}
    </tspan>
  </text>
</template>
