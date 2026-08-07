<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PresetNameList } from '@/src/vtk/ColorMaps';
import { DefaultNamedLayouts } from '@/src/config';
import { WINDOW_LEVEL_PRESET_LIST } from '@/src/core/hanging-protocols/windowPresets';
import {
  AUTO_RANGE_KEYS,
  SLICE_POLICY_LABELS,
  describeLayout,
  findNamedLayout,
} from '@/src/core/hanging-protocols/describe';
import { checkPattern } from '@/src/core/hanging-protocols/matching';
import type {
  FocusedModule,
  HangingProtocol,
  SlicePolicy,
  WindowLevelSpec,
} from '@/src/core/hanging-protocols/types';

const props = defineProps<{ modelValue: HangingProtocol }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: HangingProtocol): void;
  (e: 'capture-layout'): void;
}>();

const protocol = computed(() => props.modelValue);

const patch = (changes: Partial<HangingProtocol>) => {
  emit('update:modelValue', { ...protocol.value, ...changes });
};

const patchMatch = (changes: Partial<HangingProtocol['match']>) => {
  patch({ match: { ...protocol.value.match, ...changes } });
};

const CUSTOM_LAYOUT = 'Custom';
const namedLayoutNames = Object.keys(DefaultNamedLayouts);

const layoutName = computed(
  () =>
    findNamedLayout(protocol.value.layout, DefaultNamedLayouts) ?? CUSTOM_LAYOUT
);

const layoutItems = computed(() =>
  layoutName.value === CUSTOM_LAYOUT
    ? [CUSTOM_LAYOUT, ...namedLayoutNames]
    : namedLayoutNames
);

const selectNamedLayout = (name: string | null) => {
  // "Custom" only describes a layout captured from the viewer; picking it
  // again must not blank the protocol's layout.
  if (!name || !(name in DefaultNamedLayouts)) return;
  // Copied, not referenced: the protocol is stored and must never share an
  // object with the app-wide named layouts.
  patch({ layout: JSON.parse(JSON.stringify(DefaultNamedLayouts[name])) });
};

const windowKinds: Array<{ value: WindowLevelSpec['kind']; title: string }> = [
  { value: 'preset', title: 'Named preset' },
  { value: 'manual', title: 'Explicit width / level' },
  { value: 'auto', title: 'Auto from histogram' },
  { value: 'dicom', title: 'From DICOM header' },
];

const windowKind = computed(() => protocol.value.windowLevel.kind);

const setWindowKind = (kind: WindowLevelSpec['kind']) => {
  if (kind === protocol.value.windowLevel.kind) return;
  const defaults: Record<WindowLevelSpec['kind'], WindowLevelSpec> = {
    preset: { kind: 'preset', preset: WINDOW_LEVEL_PRESET_LIST[0].id },
    manual: { kind: 'manual', width: 400, level: 50 },
    auto: { kind: 'auto', auto: AUTO_RANGE_KEYS[0] },
    dicom: { kind: 'dicom' },
  };
  patch({ windowLevel: defaults[kind] });
};

const patchWindow = (changes: Record<string, unknown>) => {
  patch({
    windowLevel: {
      ...protocol.value.windowLevel,
      ...changes,
    } as WindowLevelSpec,
  });
};

const slicePolicies = Object.entries(SLICE_POLICY_LABELS).map(
  ([value, title]) => ({ value: value as SlicePolicy, title })
);

const focusedModules: Array<{ value: FocusedModule; title: string }> = [
  { value: 'Data', title: 'Data' },
  { value: 'Annotations', title: 'Annotations' },
  { value: 'Rendering', title: 'Rendering' },
];

const csvToList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

type ListField = 'modality' | 'bodyPart';

/**
 * What the reader has typed into a comma-separated field, kept apart from the
 * list it parses to. The field would otherwise be unusable: `CT, ` parses to
 * `['CT']`, whose re-joined form is `CT`, and the input is bound to that, so
 * the separator is taken back out from under them as they type it.
 */
const listDrafts = ref<Partial<Record<ListField, string>>>({});

// A different protocol in the editor is a different list; the draft goes.
watch(
  () => protocol.value.id,
  () => {
    listDrafts.value = {};
  }
);

const listText = (field: ListField) => {
  const stored = (protocol.value.match[field] ?? []).join(', ');
  const draft = listDrafts.value[field];
  // The draft only stands while it still means the stored list: anything else
  // changed the protocol from elsewhere and the stored list wins.
  return draft !== undefined && csvToList(draft).join(', ') === stored
    ? draft
    : stored;
};

const patchList = (field: ListField, value: string) => {
  listDrafts.value[field] = value;
  const list = csvToList(value);
  patchMatch({ [field]: list.length ? list : undefined });
};

const regexError = (pattern: string | undefined) => {
  if (!pattern) return undefined;
  const { safe, reason } = checkPattern(pattern);
  return safe ? undefined : reason;
};

/**
 * Keeps the stored window while the field is empty or half-typed, so clearing
 * the box does not silently store a width of 0.
 */
const patchWindowNumber = (field: 'width' | 'level', value: string) => {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) return;
  patchWindow({ [field]: parsed });
};

/** Series counts are validated as non-negative integers when stored. */
const countOrUndefined = (value: string) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, parsed);
};
</script>

<template>
  <div class="protocol-editor">
    <v-text-field
      :model-value="protocol.name"
      label="Name"
      density="compact"
      variant="outlined"
      hide-details="auto"
      class="mb-3"
      data-testid="protocol-name"
      :rules="[(value: string) => !!value.trim() || 'A name is required']"
      @update:model-value="patch({ name: $event })"
    />
    <v-text-field
      :model-value="protocol.description"
      label="Description"
      density="compact"
      variant="outlined"
      hide-details="auto"
      class="mb-4"
      @update:model-value="patch({ description: $event })"
    />

    <div class="section-title">Presentation</div>

    <div class="d-flex align-center mb-3 ga-2">
      <v-select
        :model-value="layoutName"
        :items="layoutItems"
        label="Layout"
        density="compact"
        variant="outlined"
        hide-details
        data-testid="protocol-layout-select"
        @update:model-value="selectNamedLayout($event)"
      />
      <v-btn
        variant="tonal"
        size="small"
        prepend-icon="mdi-camera-outline"
        @click="emit('capture-layout')"
      >
        Use current
      </v-btn>
    </div>
    <div class="text-caption text-medium-emphasis mb-4">
      {{ describeLayout(protocol.layout) }}
    </div>

    <v-select
      :model-value="windowKind"
      :items="windowKinds"
      label="Window / level"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
      data-testid="protocol-window-kind"
      @update:model-value="setWindowKind($event)"
    />

    <v-select
      v-if="protocol.windowLevel.kind === 'preset'"
      :model-value="protocol.windowLevel.preset"
      :items="
        WINDOW_LEVEL_PRESET_LIST.map((preset) => ({
          value: preset.id,
          title: `${preset.label} — ${preset.modality} W ${preset.width} / L ${preset.level}`,
        }))
      "
      label="Preset"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
      data-testid="protocol-window-preset"
      @update:model-value="patchWindow({ preset: $event })"
    />

    <div
      v-else-if="protocol.windowLevel.kind === 'manual'"
      class="d-flex ga-2 mb-3"
    >
      <v-text-field
        :model-value="protocol.windowLevel.width"
        label="Width"
        type="number"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="patchWindowNumber('width', $event)"
      />
      <v-text-field
        :model-value="protocol.windowLevel.level"
        label="Level"
        type="number"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="patchWindowNumber('level', $event)"
      />
    </div>

    <v-select
      v-else-if="protocol.windowLevel.kind === 'auto'"
      :model-value="protocol.windowLevel.auto"
      :items="AUTO_RANGE_KEYS"
      label="Auto range"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
      @update:model-value="patchWindow({ auto: $event })"
    />

    <v-select
      :model-value="protocol.volume.preset"
      :items="PresetNameList"
      label="Volume rendering preset"
      density="compact"
      variant="outlined"
      clearable
      hide-details
      class="mb-3"
      @update:model-value="
        patch({ volume: { ...protocol.volume, preset: $event ?? '' } })
      "
    />

    <v-slider
      :model-value="protocol.volume.opacityShift"
      label="Opacity shift"
      :min="-1000"
      :max="1000"
      :step="10"
      thumb-label
      density="compact"
      hide-details
      class="mb-3"
      @update:model-value="
        patch({ volume: { ...protocol.volume, opacityShift: $event } })
      "
    />

    <div class="d-flex ga-2 mb-3">
      <v-select
        :model-value="protocol.slicePolicy"
        :items="slicePolicies"
        label="Slice position on open"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="patch({ slicePolicy: $event })"
      />
      <v-select
        :model-value="protocol.focusedModule"
        :items="focusedModules"
        label="Focus panel"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="patch({ focusedModule: $event })"
      />
    </div>

    <div class="d-flex ga-4 mb-4">
      <v-switch
        :model-value="protocol.overlays.viewLabels"
        label="View overlays"
        color="primary"
        density="compact"
        hide-details
        @update:model-value="
          patch({
            overlays: { ...protocol.overlays, viewLabels: !!$event },
          })
        "
      />
      <v-switch
        :model-value="protocol.overlays.annotations"
        label="Annotations"
        color="primary"
        density="compact"
        hide-details
        @update:model-value="
          patch({
            overlays: { ...protocol.overlays, annotations: !!$event },
          })
        "
      />
    </div>

    <div class="section-title">Matching rules</div>
    <div class="text-caption text-medium-emphasis mb-3">
      Every rule you fill in must hold for this protocol to hang a study.
      Protocols are evaluated top to bottom, so put the specific ones first.
    </div>

    <div class="d-flex ga-2 mb-3">
      <v-text-field
        :model-value="listText('modality')"
        label="Modality"
        placeholder="CT, MR"
        density="compact"
        variant="outlined"
        hide-details
        data-testid="protocol-match-modality"
        @update:model-value="patchList('modality', $event)"
      />
      <v-text-field
        :model-value="listText('bodyPart')"
        label="Body part examined"
        placeholder="HEAD, BRAIN"
        density="compact"
        variant="outlined"
        hide-details
        data-testid="protocol-match-body-part"
        @update:model-value="patchList('bodyPart', $event)"
      />
    </div>

    <v-text-field
      :model-value="protocol.match.studyDescription ?? ''"
      label="Study description matches"
      placeholder="head|brain"
      prefix="/"
      suffix="/i"
      density="compact"
      variant="outlined"
      :error-messages="regexError(protocol.match.studyDescription)"
      hide-details="auto"
      class="mb-3"
      data-testid="protocol-match-study"
      @update:model-value="
        patchMatch({ studyDescription: $event || undefined })
      "
    />

    <v-text-field
      :model-value="protocol.match.seriesDescription ?? ''"
      label="Series description matches"
      prefix="/"
      suffix="/i"
      density="compact"
      variant="outlined"
      :error-messages="regexError(protocol.match.seriesDescription)"
      hide-details="auto"
      class="mb-3"
      @update:model-value="
        patchMatch({ seriesDescription: $event || undefined })
      "
    />

    <div class="d-flex ga-2">
      <v-text-field
        :model-value="protocol.match.minSeriesCount ?? ''"
        label="Min series in study"
        type="number"
        min="0"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="
          patchMatch({ minSeriesCount: countOrUndefined($event) })
        "
      />
      <v-text-field
        :model-value="protocol.match.maxSeriesCount ?? ''"
        label="Max series in study"
        type="number"
        min="0"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="
          patchMatch({ maxSeriesCount: countOrUndefined($event) })
        "
      />
    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 12px;
}
</style>
