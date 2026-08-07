<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { SAMPLE_DATA } from '@/src/config';
import { useDataBrowserStore } from '@/src/store/data-browser';
import { useWorklistStore } from '@/src/store/worklist';
import { formatPatientName } from '@/src/utils/worklist';

const worklist = useWorklistStore();
const dataBrowserStore = useDataBrowserStore();
const { demoEntry } = storeToRefs(worklist);

/** Same modality first, so the substitute is at least the right kind of study. */
const substitutes = computed(() => {
  if (dataBrowserStore.hideSampleData) return [];
  const modality = demoEntry.value?.modality;
  // A sample that is already loaded has its own row in the worklist; offering
  // it here would only re-download data the session already holds.
  return SAMPLE_DATA.filter(
    (sample) => !worklist.isSampleLoaded(sample.name)
  ).sort((a, b) => {
    const aMatch = modality && a.name.toUpperCase().includes(modality) ? 0 : 1;
    const bMatch = modality && b.name.toUpperCase().includes(modality) ? 0 : 1;
    return aMatch - bMatch;
  });
});
</script>

<template>
  <v-dialog
    :model-value="!!demoEntry"
    max-width="520"
    @update:model-value="worklist.dismissDemoEntry()"
  >
    <v-card v-if="demoEntry" data-testid="worklist-demo-dialog">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-flask-outline" size="20" />
        Demonstration entry
      </v-card-title>
      <v-card-text>
        <p class="mb-3">
          <strong>{{ formatPatientName(demoEntry.patientName) }}</strong> —
          {{ demoEntry.description }} is a fabricated worklist row used to show
          what a populated reading list looks like. There is no image data
          behind it, so there is nothing to open.
        </p>
        <p v-if="substitutes.length" class="mb-2">
          Open a real dataset instead:
        </p>
        <v-list v-if="substitutes.length" density="compact" class="py-0">
          <v-list-item
            v-for="sample in substitutes"
            :key="sample.name"
            :title="sample.name"
            :subtitle="sample.description"
            prepend-icon="mdi-download-outline"
            @click="worklist.openDemoSubstitute(sample)"
          />
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="worklist.dismissDemoEntry()">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
