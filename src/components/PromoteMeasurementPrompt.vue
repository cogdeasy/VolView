<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAnnotationToolStore } from '@/src/store/tools';
import { AnnotationToolType } from '@/src/store/tools/types';
import { useFindingsStore } from '@/src/store/findings';
import { useFindingsUIStore } from '@/src/store/findings-ui';
import type { ToolID } from '@/src/types/annotation-tool';

const AnnotationTypes = [
  AnnotationToolType.Ruler,
  AnnotationToolType.Rectangle,
  AnnotationToolType.Polygon,
];

const findingsStore = useFindingsStore();
const uiStore = useFindingsUIStore();

const allTools = computed(() =>
  AnnotationTypes.flatMap((toolType) =>
    useAnnotationToolStore(toolType).tools.map((tool) => ({
      toolType,
      id: tool.id,
      placing: !!tool.placing,
    }))
  )
);

// Only an interactively placed annotation should prompt. Tools that arrive
// finished (a restored session, a processing job) never pass through the
// placing state, so they are left alone.
const placedHere = new Set<ToolID>();

const prompt = ref<{ toolType: AnnotationToolType; toolID: ToolID } | null>(
  null
);
const open = ref(false);

watch(allTools, (tools) => {
  const alive = new Set(tools.map((tool) => tool.id));
  [...placedHere].forEach((id) => {
    if (!alive.has(id)) placedHere.delete(id);
  });

  tools.forEach((tool) => {
    if (tool.placing) {
      placedHere.add(tool.id);
      return;
    }
    if (!placedHere.has(tool.id)) return;
    placedHere.delete(tool.id);
    if (findingsStore.findingForTool(tool.id)) return;
    prompt.value = { toolType: tool.toolType, toolID: tool.id };
    open.value = true;
  });
});

const label = computed(() => prompt.value?.toolType.toLowerCase() ?? '');

function promote() {
  if (!prompt.value) return;
  const id = findingsStore.promoteMeasurement(
    prompt.value.toolType,
    prompt.value.toolID
  );
  open.value = false;
  if (id) uiStore.editFinding(id);
}
</script>

<template>
  <v-snackbar
    v-model="open"
    :timeout="8000"
    location="bottom right"
    color="surface"
    data-testid="promote-measurement-prompt"
  >
    <div class="d-flex align-center ga-2">
      <v-icon color="primary">mdi-clipboard-plus-outline</v-icon>
      <span>Measurement placed. Record it as a finding?</span>
    </div>
    <template #actions>
      <v-btn variant="text" @click="open = false">Not now</v-btn>
      <v-btn
        color="primary"
        variant="flat"
        @click="promote"
        data-testid="promote-measurement-button"
      >
        Add {{ label }} finding
      </v-btn>
    </template>
  </v-snackbar>
</template>
