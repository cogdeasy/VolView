<script setup lang="ts">
import { useRulerStore } from '@/src/store/tools/rulers';
import { formatLength } from '@/src/core/annotations/measurements';
import { AnnotationTool } from '../types/annotation-tool';

defineProps<{
  tool: AnnotationTool & { axis: string };
}>();

const toolStore = useRulerStore();
</script>

<template>
  <v-row>
    <v-col v-if="tool.frame != null" cols="4">
      Frame: {{ tool.frame + 1 }}
    </v-col>
    <v-col v-else cols="4">Slice: {{ tool.slice + 1 }}</v-col>
    <v-col cols="4">Axis: {{ tool.axis }}</v-col>
    <v-col>
      Length:
      <span class="value">
        {{ formatLength(toolStore.lengthByID[tool.id]) }}
      </span>
    </v-col>
  </v-row>
</template>
