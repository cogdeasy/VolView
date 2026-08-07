<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useMessageStore } from '@/src/store/messages';
import HangingProtocolEditor from '@/src/components/HangingProtocolEditor.vue';
import {
  describeLayout,
  describeMatchRules,
  describeWindowLevel,
} from '@/src/core/hanging-protocols/describe';
import {
  cloneProtocol,
  ProtocolParseError,
} from '@/src/core/hanging-protocols/serialization';
import { evaluateProtocol } from '@/src/core/hanging-protocols/matching';
import type { HangingProtocol } from '@/src/core/hanging-protocols/types';

const store = useHangingProtocolStore();
const { protocols, settings, applied } = storeToRefs(store);
const { currentImageID } = useCurrentImage('global');
const messageStore = useMessageStore();

const selectedId = ref<string | null>(protocols.value[0]?.id ?? null);
const draft = ref<HangingProtocol | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const studyContext = computed(() =>
  store.getStudyContext(currentImageID.value)
);

const selected = computed(
  () =>
    protocols.value.find((protocol) => protocol.id === selectedId.value) ?? null
);

const dirty = computed(
  () =>
    !!draft.value &&
    !!selected.value &&
    JSON.stringify(draft.value) !== JSON.stringify(selected.value)
);

watch(
  selected,
  (protocol) => {
    draft.value = protocol ? cloneProtocol(protocol) : null;
  },
  { immediate: true }
);

const select = (id: string) => {
  selectedId.value = id;
};

const save = () => {
  if (!draft.value) return;
  store.updateProtocol(draft.value.id, draft.value);
  messageStore.addSuccess(`Saved ${draft.value.name}`);
};

const revert = () => {
  draft.value = selected.value ? cloneProtocol(selected.value) : null;
};

const createFromCurrentView = () => {
  const protocol = store.captureCurrentState(
    'My protocol',
    currentImageID.value
  );
  store.addProtocol(protocol);
  selectedId.value = protocol.id;
  messageStore.addSuccess('Captured the current view as a new protocol');
};

const captureLayoutIntoDraft = () => {
  if (!draft.value) return;
  const captured = store.captureCurrentState(
    draft.value.name,
    currentImageID.value
  );
  draft.value = { ...draft.value, layout: captured.layout };
};

const duplicate = (id: string) => {
  const copy = store.duplicateProtocol(id);
  if (copy) selectedId.value = copy.id;
};

const remove = (id: string) => {
  store.removeProtocol(id);
  if (selectedId.value === id) {
    selectedId.value = protocols.value[0]?.id ?? null;
  }
};

const applyNow = (id: string) => {
  store.applyManually(id, currentImageID.value);
  messageStore.addSuccess('Protocol applied to the current study');
};

const exportAll = () => {
  const blob = new Blob([store.exportProtocols()], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'hanging-protocols.json';
  anchor.click();
  URL.revokeObjectURL(url);
};

const onImportFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const added = store.importProtocols(await file.text());
    messageStore.addSuccess(
      `Imported ${added.length} protocol${added.length === 1 ? '' : 's'}`
    );
    if (added.length) selectedId.value = added[added.length - 1].id;
  } catch (err) {
    messageStore.addError(
      err instanceof ProtocolParseError
        ? err.message
        : 'Could not import protocols',
      { error: err as Error }
    );
  }
};

const matchesCurrentStudy = (protocol: HangingProtocol) =>
  evaluateProtocol(protocol, studyContext.value).matched;
</script>

<template>
  <v-card class="protocol-manager">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-3" color="secondary">mdi-view-dashboard-variant</v-icon>
      Hanging Protocols
    </v-card-title>
    <v-card-subtitle class="pb-3">
      Protocols hang a study the moment it opens. They are evaluated top to
      bottom — the first one whose rules all hold wins.
    </v-card-subtitle>

    <v-card-text class="pt-0">
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-content-save-outline"
          data-testid="protocol-save-current"
          @click="createFromCurrentView"
        >
          Save current layout as protocol
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          prepend-icon="mdi-upload"
          @click="fileInput?.click()"
        >
          Import
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          prepend-icon="mdi-download"
          data-testid="protocol-export"
          @click="exportAll"
        >
          Export
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-restore"
          @click="store.restoreBuiltIns()"
        >
          Restore built-ins
        </v-btn>
        <v-spacer />
        <v-switch
          :model-value="settings.autoApply"
          label="Apply on study open"
          color="primary"
          density="compact"
          hide-details
          data-testid="protocol-auto-apply"
          @update:model-value="store.setAutoApply(!!$event)"
        />
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="d-none"
          data-testid="protocol-import-input"
          @change="onImportFile"
        />
      </div>

      <v-row>
        <v-col cols="12" md="5">
          <v-list
            density="compact"
            class="protocol-list"
            data-testid="protocol-list"
          >
            <v-list-item
              v-for="(protocol, index) in protocols"
              :key="protocol.id"
              :active="protocol.id === selectedId"
              lines="two"
              @click="select(protocol.id)"
            >
              <template v-slot:prepend>
                <span class="precedence text-caption text-medium-emphasis mr-3">
                  {{ index + 1 }}
                </span>
              </template>
              <v-list-item-title class="d-flex align-center ga-2">
                {{ protocol.name }}
                <v-icon
                  v-if="settings.defaultProtocolId === protocol.id"
                  size="14"
                  color="secondary"
                >
                  mdi-star
                </v-icon>
                <v-chip v-if="protocol.builtIn" size="x-small" variant="tonal">
                  Built-in
                </v-chip>
                <v-chip
                  v-if="applied?.protocolId === protocol.id"
                  size="x-small"
                  color="primary"
                  variant="flat"
                >
                  Applied
                </v-chip>
                <v-chip
                  v-else-if="matchesCurrentStudy(protocol)"
                  size="x-small"
                  color="secondary"
                  variant="tonal"
                >
                  Matches
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ describeLayout(protocol.layout) }} ·
                {{ describeWindowLevel(protocol.windowLevel) }}
              </v-list-item-subtitle>
              <template v-slot:append>
                <v-btn
                  icon="mdi-chevron-up"
                  variant="text"
                  size="x-small"
                  :disabled="index === 0"
                  @click.stop="store.moveProtocol(protocol.id, -1)"
                />
                <v-btn
                  icon="mdi-chevron-down"
                  variant="text"
                  size="x-small"
                  :disabled="index === protocols.length - 1"
                  @click.stop="store.moveProtocol(protocol.id, 1)"
                />
                <v-menu location="bottom end">
                  <template v-slot:activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon="mdi-dots-vertical"
                      variant="text"
                      size="x-small"
                      @click.stop
                    />
                  </template>
                  <v-list density="compact">
                    <v-list-item @click="applyNow(protocol.id)">
                      <v-list-item-title>Apply now</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="duplicate(protocol.id)">
                      <v-list-item-title>Duplicate</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="store.setDefaultProtocol(protocol.id)">
                      <v-list-item-title>Set as default</v-list-item-title>
                    </v-list-item>
                    <v-list-item
                      @click="
                        store.updateProtocol(protocol.id, {
                          enabled: !protocol.enabled,
                        })
                      "
                    >
                      <v-list-item-title>
                        {{ protocol.enabled ? 'Disable' : 'Enable' }}
                      </v-list-item-title>
                    </v-list-item>
                    <v-divider class="my-1" />
                    <v-list-item @click="remove(protocol.id)">
                      <v-list-item-title class="text-error">
                        Delete
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </template>
            </v-list-item>
          </v-list>

          <div class="text-caption text-medium-emphasis mt-3">
            Current study: {{ studyContext.modality || '—' }}
            <template v-if="studyContext.studyDescription">
              · {{ studyContext.studyDescription }}
            </template>
            <template v-if="studyContext.bodyPart">
              · {{ studyContext.bodyPart }}
            </template>
            · {{ studyContext.seriesCount }} series
          </div>
        </v-col>

        <v-col cols="12" md="7">
          <template v-if="draft">
            <hanging-protocol-editor
              v-model="draft"
              @capture-layout="captureLayoutIntoDraft"
            />
            <div class="d-flex align-center ga-2 mt-4">
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                :disabled="!dirty"
                data-testid="protocol-save"
                @click="save"
              >
                Save changes
              </v-btn>
              <v-btn
                variant="text"
                size="small"
                :disabled="!dirty"
                @click="revert"
              >
                Revert
              </v-btn>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">
                {{
                  describeMatchRules(draft).join(' · ') || 'No matching rules'
                }}
              </span>
            </div>
          </template>
          <div v-else class="text-body-2 text-medium-emphasis pa-6 text-center">
            Select a protocol, or save the current layout as a new one.
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.protocol-list {
  max-height: 480px;
  overflow-y: auto;
}

.precedence {
  min-width: 16px;
  text-align: right;
}
</style>
