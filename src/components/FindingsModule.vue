<script setup lang="ts">
import { computed } from 'vue';
import { useFindingsStore } from '@/src/store/findings';
import { useFindingsUIStore } from '@/src/store/findings-ui';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useViewLocator } from '@/src/composables/useViewLocator';
import { locatorPatch } from '@/src/core/annotations/locator';
import { measurementHeadline } from '@/src/core/findings/summarize';
import { LATERALITY_LABELS } from '@/src/core/findings/taxonomy';
import { useViewStore } from '@/src/store/views';
import { AXIAL_FRAME_OF_REFERENCE } from '@/src/utils/frameOfReference';

const findingsStore = useFindingsStore();
const uiStore = useFindingsUIStore();
const viewStore = useViewStore();
const { currentImageID } = useCurrentImage();
const { locator } = useViewLocator(
  computed(() => viewStore.activeView ?? ''),
  currentImageID
);

const findings = computed(() =>
  findingsStore.findingsForImage(currentImageID.value).map((finding) => ({
    ...finding,
    typeLabel: findingsStore.findingTypeByID[finding.typeID]?.label ?? '',
    headline: measurementHeadline(finding),
    liveMeasurements: findingsStore.liveMeasurements(finding),
    lateralityLabel:
      finding.laterality === 'unknown'
        ? ''
        : LATERALITY_LABELS[finding.laterality],
  }))
);

function addBlankFinding() {
  if (!currentImageID.value) return;
  const id = findingsStore.addFinding({
    imageID: currentImageID.value,
    title: 'New finding',
    // Where the user is looking, stamped the same way a placed annotation is.
    // A 3D or otherwise unlocatable active view leaves the default plane.
    ...(locator.value.kind === 'none'
      ? { slice: 0, frameOfReference: AXIAL_FRAME_OF_REFERENCE }
      : locatorPatch(locator.value)),
  });
  uiStore.editFinding(id);
}

/** Reorders within the visible list; other images' findings sit in between. */
function move(index: number, offset: number) {
  const finding = findings.value[index];
  const sibling = findings.value[index + offset];
  if (!finding || !sibling) return;
  findingsStore.moveFindingRelative(
    finding.id,
    sibling.id,
    offset < 0 ? 'before' : 'after'
  );
}
</script>

<template>
  <div class="findings-module">
    <div class="d-flex align-center ga-2 px-3 py-2">
      <v-btn
        variant="tonal"
        size="small"
        :disabled="!currentImageID"
        @click="addBlankFinding"
        data-testid="add-finding-button"
      >
        <v-icon start>mdi-plus</v-icon>
        Finding
      </v-btn>
      <v-spacer />
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        :disabled="!currentImageID"
        @click="uiStore.openReport()"
        data-testid="open-report-button"
      >
        <v-icon start>mdi-file-document-outline</v-icon>
        Report
      </v-btn>
    </div>

    <v-divider />

    <div v-if="!currentImageID" class="pa-6 text-center text-medium-emphasis">
      Load an image to record findings.
    </div>

    <div
      v-else-if="findings.length === 0"
      class="pa-6 text-center text-medium-emphasis"
    >
      <v-icon size="40" class="mb-3 text-disabled">
        mdi-clipboard-text-outline
      </v-icon>
      <div class="text-body-2">No findings yet.</div>
      <div class="text-caption mt-1">
        Place a ruler, rectangle or polygon, then promote it to a finding — its
        measurement, slice and laterality carry over.
      </div>
    </div>

    <v-list v-else class="bg-transparent py-0" data-testid="findings-list">
      <template v-for="(finding, index) in findings" :key="finding.id">
        <v-list-item class="finding-item py-3">
          <div class="d-flex ga-3">
            <div class="finding-index text-primary">{{ index + 1 }}</div>
            <div class="flex-grow-1 min-width-0">
              <div class="d-flex align-center ga-2">
                <span class="text-body-1 text-truncate">
                  {{ finding.title || 'Untitled finding' }}
                </span>
              </div>
              <div class="d-flex flex-wrap ga-1 mt-1">
                <v-chip v-if="finding.typeLabel" size="x-small" variant="tonal">
                  {{ finding.typeLabel }}
                </v-chip>
                <v-chip v-if="finding.bodySite" size="x-small" variant="tonal">
                  {{ finding.bodySite }}
                </v-chip>
                <v-chip
                  v-if="finding.lateralityLabel"
                  size="x-small"
                  variant="tonal"
                >
                  {{ finding.lateralityLabel }}
                </v-chip>
                <v-chip
                  v-if="finding.category"
                  size="x-small"
                  variant="tonal"
                  color="secondary"
                >
                  {{ finding.category }}
                </v-chip>
              </div>
              <div
                v-if="finding.headline"
                class="text-caption text-medium-emphasis mt-1"
              >
                {{ finding.headline }}
              </div>
              <div class="text-caption text-disabled mt-1">
                Slice {{ finding.slice + 1 }}
                <span v-if="finding.liveMeasurements.length">
                  · {{ finding.liveMeasurements.length }} measurement<span
                    v-if="finding.liveMeasurements.length > 1"
                    >s</span
                  >
                </span>
              </div>
            </div>
            <v-img
              v-if="finding.keyImage"
              :src="finding.keyImage.dataURL"
              :alt="`Key image for ${finding.title}`"
              class="thumb flex-shrink-0"
              cover
            />
          </div>

          <div class="d-flex align-center mt-1">
            <v-btn
              icon
              size="small"
              variant="text"
              @click="findingsStore.jumpToFinding(finding.id)"
            >
              <v-icon size="small">mdi-target</v-icon>
              <v-tooltip location="top" activator="parent">
                Reveal slice
              </v-tooltip>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              @click="uiStore.editFinding(finding.id)"
              data-testid="edit-finding-button"
            >
              <v-icon size="small">mdi-pencil</v-icon>
              <v-tooltip location="top" activator="parent">Edit</v-tooltip>
            </v-btn>
            <v-spacer />
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="index === 0"
              @click="move(index, -1)"
            >
              <v-icon size="small">mdi-arrow-up</v-icon>
              <v-tooltip location="top" activator="parent">Move up</v-tooltip>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="index === findings.length - 1"
              @click="move(index, 1)"
            >
              <v-icon size="small">mdi-arrow-down</v-icon>
              <v-tooltip location="top" activator="parent">Move down</v-tooltip>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              @click="findingsStore.removeFinding(finding.id)"
            >
              <v-icon size="small">mdi-delete</v-icon>
              <v-tooltip location="top" activator="parent">Delete</v-tooltip>
            </v-btn>
          </div>
        </v-list-item>
        <v-divider />
      </template>
    </v-list>
  </div>
</template>

<style scoped>
.finding-index {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 16px;
}

.thumb {
  width: 72px;
  height: 54px;
  border-radius: 2px;
  background: #000;
}

.min-width-0 {
  min-width: 0;
}
</style>
