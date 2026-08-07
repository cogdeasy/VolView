<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useFindingsStore } from '@/src/store/findings';
import { useFindingsUIStore } from '@/src/store/findings-ui';
import { useKeyImageCapture } from '@/src/composables/useKeyImageCapture';
import { useReportModel } from '@/src/composables/useReportModel';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useAnnotationToolStore } from '@/src/store/tools';
import { useMessageStore } from '@/src/store/messages';
import { AnnotationToolType } from '@/src/store/tools/types';
import { frameOfReferenceToImageSliceAndAxis } from '@/src/utils/frameOfReference';
import { summarizeMeasurement } from '@/src/core/findings/summarize';
import {
  categoriesForScale,
  CATEGORY_SCALE_LABELS,
  COMMON_BODY_SITES,
  LATERALITY_LABELS,
  typesForModality,
} from '@/src/core/findings/taxonomy';
import type {
  FindingCategoryScale,
  FindingMeasurement,
  Laterality,
} from '@/src/types/finding';
import type { ToolID } from '@/src/types/annotation-tool';

const findingsStore = useFindingsStore();
const uiStore = useFindingsUIStore();
const { editingFindingID } = storeToRefs(uiStore);
const { modality } = useReportModel();
const { candidates, captureKeyImage } = useKeyImageCapture();
const { currentImageID, currentImageMetadata } = useCurrentImage();

const finding = computed(() =>
  editingFindingID.value
    ? findingsStore.findingByID[editingFindingID.value]
    : undefined
);

const open = computed({
  get: () => !!finding.value,
  set: (value: boolean) => {
    if (!value) uiStore.closeEditor();
  },
});

function patch(update: Parameters<typeof findingsStore.updateFinding>[1]) {
  if (!editingFindingID.value) return;
  findingsStore.updateFinding(editingFindingID.value, update);
}

// --- taxonomy --- //

const offeredTypes = computed(() =>
  typesForModality(findingsStore.findingTypes, modality.value)
);

const activeType = computed(() =>
  finding.value
    ? findingsStore.findingTypeByID[finding.value.typeID]
    : undefined
);

const categoryScale = computed<FindingCategoryScale>(
  () => activeType.value?.categoryScale ?? 'severity'
);

const categories = computed(() => categoriesForScale(categoryScale.value));

/** Applying a type fills in its default site when the field is still empty. */
function onTypeChange(typeID: string) {
  const type = findingsStore.findingTypeByID[typeID];
  patch({
    typeID,
    ...(type && !finding.value?.bodySite.trim()
      ? { bodySite: type.defaultBodySite }
      : {}),
    ...(finding.value?.category &&
    !categoriesForScale(type?.categoryScale ?? 'none').includes(
      finding.value.category
    )
      ? { category: '' }
      : {}),
  });
}

const lateralityOptions = (Object.keys(LATERALITY_LABELS) as Laterality[]).map(
  (value) => ({ value, title: LATERALITY_LABELS[value] })
);

// --- custom taxonomy entries --- //

const addingType = ref(false);
const newType = ref({
  label: '',
  defaultBodySite: '',
  categoryScale: 'severity' as FindingCategoryScale,
});

function resetNewType() {
  addingType.value = false;
  newType.value = {
    label: '',
    defaultBodySite: '',
    categoryScale: 'severity',
  };
}

function saveNewType() {
  const label = newType.value.label.trim();
  if (!label) return;
  const id = findingsStore.addFindingType({
    label,
    // A user-added type is offered for the modality it was created under.
    modalities: modality.value ? [modality.value] : [],
    defaultBodySite: newType.value.defaultBodySite.trim(),
    categoryScale: newType.value.categoryScale,
  });
  onTypeChange(id);
  resetNewType();
}

watch(editingFindingID, resetNewType);

// The editor reads slice/axis and linkable measurements from the current
// image, so it must not outlive a switch to another one.
watch(currentImageID, () => uiStore.closeEditor());

// --- measurements --- //

const measurementRows = computed(() =>
  (finding.value ? findingsStore.liveMeasurements(finding.value) : []).map(
    (measurement) => ({
      ...measurement,
      summary: summarizeMeasurement(measurement),
    })
  )
);

const AnnotationTypes = [
  AnnotationToolType.Ruler,
  AnnotationToolType.Rectangle,
  AnnotationToolType.Polygon,
];

/** Measurements on this image that no finding owns yet. */
const attachableMeasurements = computed(() => {
  const owned = new Set(
    findingsStore.findings.flatMap((entry) =>
      entry.measurements.map((measurement) => measurement.toolID)
    )
  );
  return AnnotationTypes.flatMap((toolType) => {
    const store = useAnnotationToolStore(toolType);
    return store.finishedTools
      .filter(
        (tool) => tool.imageID === currentImageID.value && !owned.has(tool.id)
      )
      .map((tool) => ({
        title: `${toolType} — ${tool.labelName ?? ''} (slice ${
          tool.slice + 1
        })`,
        value: { toolType, toolID: tool.id } as FindingMeasurement,
      }));
  });
});

const measurementToAttach = ref<FindingMeasurement | null>(null);

function attachMeasurement() {
  const measurement = measurementToAttach.value;
  if (!measurement || !editingFindingID.value) return;
  findingsStore.attachMeasurement(editingFindingID.value, measurement);
  measurementToAttach.value = null;
}

function detachMeasurement(toolID: ToolID) {
  if (!editingFindingID.value) return;
  findingsStore.detachMeasurement(editingFindingID.value, toolID);
}

// --- source location --- //

const sourceLocation = computed(() => {
  if (!finding.value) return '';
  if (finding.value.frame != null) return `Frame ${finding.value.frame + 1}`;
  const axis =
    frameOfReferenceToImageSliceAndAxis(
      finding.value.frameOfReference,
      currentImageMetadata.value,
      { allowOutOfBoundsSlice: true }
    )?.axis ?? 'Unknown';
  return `${axis} · slice ${finding.value.slice + 1}`;
});

// --- key image --- //

const capturing = ref(false);
const captureViewID = ref<string | null>(null);
const captureOptions = computed(() => candidates());

watch(open, (isOpen) => {
  if (isOpen) captureViewID.value = null;
});

async function capture() {
  if (!editingFindingID.value) return;
  capturing.value = true;
  try {
    const captured = await captureKeyImage(
      editingFindingID.value,
      captureViewID.value ?? undefined
    );
    if (!captured)
      useMessageStore().addWarning('That view is not available to capture');
  } catch (err) {
    useMessageStore().addError('Could not capture a key image', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  } finally {
    capturing.value = false;
  }
}

function jumpTo() {
  if (editingFindingID.value)
    findingsStore.jumpToFinding(editingFindingID.value);
}
</script>

<template>
  <v-dialog v-model="open" width="640" scrollable>
    <v-card v-if="finding">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon size="small" color="primary">mdi-clipboard-text-outline</v-icon>
        <span>Edit finding</span>
        <v-spacer />
        <v-btn icon variant="text" density="comfortable" @click="jumpTo">
          <v-icon>mdi-target</v-icon>
          <v-tooltip location="top" activator="parent">
            Reveal in views
          </v-tooltip>
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-text-field
          :model-value="finding.title"
          @update:model-value="patch({ title: $event })"
          label="Title"
          density="comfortable"
          hide-details="auto"
          autofocus
          class="mb-4"
        />

        <div class="d-flex ga-3 mb-4">
          <v-select
            :model-value="finding.typeID"
            @update:model-value="onTypeChange($event)"
            :items="offeredTypes"
            item-title="label"
            item-value="id"
            label="Finding type"
            density="comfortable"
            hide-details="auto"
          >
            <template #append-item>
              <v-divider class="my-1" />
              <v-list-item
                prepend-icon="mdi-plus"
                title="Add finding type…"
                @click="addingType = true"
              />
            </template>
          </v-select>
          <v-select
            :model-value="finding.category"
            @update:model-value="patch({ category: $event ?? '' })"
            :items="categories"
            :label="CATEGORY_SCALE_LABELS[categoryScale]"
            :disabled="categories.length === 0"
            density="comfortable"
            hide-details="auto"
            clearable
          />
        </div>

        <v-expand-transition>
          <v-sheet v-if="addingType" class="pa-3 mb-4" rounded border>
            <div class="text-caption text-medium-emphasis mb-2">
              New finding type
              <span v-if="modality">for {{ modality }}</span>
            </div>
            <v-text-field
              v-model="newType.label"
              label="Label"
              density="compact"
              hide-details
              class="mb-2"
            />
            <v-text-field
              v-model="newType.defaultBodySite"
              label="Default body site"
              density="compact"
              hide-details
              class="mb-2"
            />
            <v-select
              v-model="newType.categoryScale"
              :items="[
                { value: 'severity', title: 'Severity' },
                { value: 'birads', title: 'BI-RADS' },
                { value: 'none', title: 'No grading' },
              ]"
              label="Grading scale"
              density="compact"
              hide-details
              class="mb-3"
            />
            <div class="d-flex justify-end ga-2">
              <v-btn size="small" variant="text" @click="resetNewType">
                Cancel
              </v-btn>
              <v-btn
                size="small"
                color="primary"
                :disabled="!newType.label.trim()"
                @click="saveNewType"
              >
                Add type
              </v-btn>
            </div>
          </v-sheet>
        </v-expand-transition>

        <div class="d-flex ga-3 mb-4">
          <v-combobox
            :model-value="finding.bodySite"
            @update:model-value="patch({ bodySite: $event ?? '' })"
            :items="COMMON_BODY_SITES"
            label="Anatomy / body site"
            density="comfortable"
            hide-details="auto"
          />
          <v-select
            :model-value="finding.laterality"
            @update:model-value="patch({ laterality: $event })"
            :items="lateralityOptions"
            label="Laterality"
            density="comfortable"
            hide-details="auto"
          />
        </div>

        <v-textarea
          :model-value="finding.description"
          @update:model-value="patch({ description: $event })"
          label="Description"
          rows="3"
          auto-grow
          density="comfortable"
          hide-details="auto"
          class="mb-4"
        />

        <div class="text-overline text-medium-emphasis">Measurements</div>
        <v-list density="compact" class="bg-transparent pa-0 mb-2">
          <v-list-item
            v-for="row in measurementRows"
            :key="row.toolID"
            class="px-0"
          >
            <template #prepend>
              <v-icon size="small" class="mr-3">mdi-ruler</v-icon>
            </template>
            <v-list-item-title class="text-body-2">
              {{ row.summary?.kind }}
              <span class="text-medium-emphasis">{{ row.summary?.label }}</span>
            </v-list-item-title>
            <v-list-item-subtitle>
              <span
                v-for="quantity in row.summary?.quantities ?? []"
                :key="quantity.label"
                class="mr-3"
              >
                {{ quantity.label }}
                <strong>{{ quantity.text }}</strong>
              </span>
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                icon
                size="small"
                variant="text"
                @click="detachMeasurement(row.toolID)"
              >
                <v-icon size="small">mdi-link-variant-off</v-icon>
                <v-tooltip location="top" activator="parent">
                  Unlink measurement
                </v-tooltip>
              </v-btn>
            </template>
          </v-list-item>
          <v-list-item v-if="measurementRows.length === 0" class="px-0">
            <v-list-item-subtitle>
              No measurement linked yet.
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <div class="d-flex ga-2 align-center mb-4">
          <v-select
            v-model="measurementToAttach"
            :items="attachableMeasurements"
            label="Link another measurement"
            density="compact"
            hide-details
            :disabled="attachableMeasurements.length === 0"
          />
          <v-btn
            variant="tonal"
            :disabled="!measurementToAttach"
            @click="attachMeasurement"
          >
            Link
          </v-btn>
        </div>

        <div class="text-overline text-medium-emphasis">Key image</div>
        <div class="d-flex ga-4 align-start">
          <div class="key-image-slot">
            <v-img
              v-if="finding.keyImage"
              :src="finding.keyImage.dataURL"
              :alt="`Key image for ${finding.title}`"
              class="key-image"
              cover
            />
            <div v-else class="key-image key-image--empty d-flex align-center">
              <span class="text-caption text-medium-emphasis pa-2">
                No key image captured
              </span>
            </div>
          </div>
          <div class="flex-grow-1">
            <div class="text-body-2 text-medium-emphasis mb-2">
              Source: {{ sourceLocation }}
            </div>
            <v-select
              v-model="captureViewID"
              :items="captureOptions"
              item-title="name"
              item-value="id"
              label="Capture from"
              placeholder="Best matching view"
              density="compact"
              hide-details
              clearable
              class="mb-2"
            />
            <div class="d-flex ga-2">
              <v-btn
                color="primary"
                variant="tonal"
                size="small"
                :loading="capturing"
                @click="capture"
              >
                <v-icon start>mdi-camera</v-icon>
                {{ finding.keyImage ? 'Recapture' : 'Capture key image' }}
              </v-btn>
              <v-btn
                v-if="finding.keyImage"
                size="small"
                variant="text"
                @click="patch({ keyImage: undefined })"
              >
                Remove
              </v-btn>
            </div>
          </div>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="open = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.key-image-slot {
  flex: 0 0 180px;
}

.key-image {
  width: 180px;
  height: 135px;
  border-radius: 2px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: #000;
}

.key-image--empty {
  justify-content: center;
  text-align: center;
}
</style>
