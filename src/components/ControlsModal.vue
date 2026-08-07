<script setup lang="ts">
import { computed, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import {
  actionToKey,
  bindingConflicts,
  isCustomizedActionKey,
  resetActionKey,
  resetAllActionKeys,
  recordingShortcutFor,
  setActionKey,
} from '@/src/composables/useKeyboardShortcuts';
import { ACTIONS, ACTION_GROUPS, Action, ActionGroup } from '@/src/constants';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';
import { bindingFromEvent } from '@/src/utils/keyBindings';
import { getEntries } from '@/src/utils';
import CloseableDialog from './CloseableDialog.vue';
import ShortcutKey from './ShortcutKey.vue';

const keyboardStore = useKeyboardShortcutsStore();

/** Mouse gestures are not rebindable, so they are documented separately. */
const MOUSE_CONTROLS = [
  ['Scroll slices', 'Mouse wheel or two-finger vertical scroll'],
  ['Zoom', 'Right mouse button + move vertically'],
  ['Pan', 'Shift + left mouse button + move'],
];

const groups = computed(() =>
  getEntries(ACTION_GROUPS).map(([group, label]) => ({
    group: group as ActionGroup,
    label,
    actions: getEntries(ACTIONS)
      .filter(([, info]) => info.group === group)
      .map(([action]) => action as Action),
  }))
);

const recording = recordingShortcutFor;

const conflictsFor = (action: Action) =>
  (bindingConflicts.value[action] ?? []).map(
    (other) => ACTIONS[other as Action].readable
  );

function startRecording(action: Action) {
  recording.value = recording.value === action ? null : action;
}

// Leaving the dialog must not leave the app waiting for a key.
watch(
  () => keyboardStore.settingsOpen,
  (open) => {
    if (!open) recording.value = null;
  }
);

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const action = recording.value;
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    recording.value = null;
    return;
  }

  const binding = bindingFromEvent(event);
  // Modifier-only presses are ignored until a real key arrives.
  if (!binding) return;

  setActionKey(action, binding);
  recording.value = null;
});
</script>

<template>
  <closeable-dialog
    v-model="keyboardStore.settingsOpen"
    :close-offset-x="24"
    aria-label="Keyboard shortcuts"
  >
    <v-card class="pa-4 shortcuts-card">
      <div class="d-flex align-center justify-space-between pr-12 mb-2">
        <h2 class="text-h5">Keyboard shortcuts</h2>
        <div class="d-flex align-center ga-2">
          <v-btn
            v-if="keyboardStore.editing"
            variant="text"
            size="small"
            @click="resetAllActionKeys()"
          >
            Restore defaults
          </v-btn>
          <v-btn
            variant="tonal"
            size="small"
            :prepend-icon="
              keyboardStore.editing ? 'mdi-check' : 'mdi-pencil-outline'
            "
            @click="keyboardStore.editing = !keyboardStore.editing"
          >
            {{ keyboardStore.editing ? 'Done editing' : 'Edit shortcuts' }}
          </v-btn>
        </div>
      </div>

      <p class="text-body-2 text-medium-emphasis mb-4">
        Press
        <ShortcutKey binding="ctrl+k" />
        for the command palette, which searches every command and shows its
        shortcut.
      </p>

      <div class="shortcut-groups">
        <section
          v-for="{ group, label, actions } in groups"
          :key="group"
          class="shortcut-group"
          :aria-labelledby="`shortcut-group-${group}`"
        >
          <h3 :id="`shortcut-group-${group}`" class="shortcut-group-title">
            {{ label }}
          </h3>
          <ul class="shortcut-list">
            <li v-for="action in actions" :key="action" class="shortcut-row">
              <span class="shortcut-label">
                {{ ACTIONS[action].readable }}
                <v-tooltip
                  v-if="conflictsFor(action).length"
                  location="top"
                  :text="`Also bound to: ${conflictsFor(action).join(', ')}`"
                >
                  <template #activator="{ props: tooltipProps }">
                    <v-icon
                      v-bind="tooltipProps"
                      icon="mdi-alert-outline"
                      size="16"
                      color="warning"
                      class="ml-1"
                      :aria-label="`Shortcut conflict: also bound to ${conflictsFor(
                        action
                      ).join(', ')}`"
                    />
                  </template>
                </v-tooltip>
              </span>

              <template v-if="keyboardStore.editing">
                <v-btn
                  class="shortcut-edit-btn"
                  size="small"
                  variant="outlined"
                  :color="recording === action ? 'secondary' : undefined"
                  :aria-label="`Change shortcut for ${ACTIONS[action].readable}`"
                  @click="startRecording(action)"
                >
                  <span v-if="recording === action">Press a key…</span>
                  <ShortcutKey v-else :binding="actionToKey[action]" />
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  icon="mdi-backup-restore"
                  density="comfortable"
                  :disabled="!isCustomizedActionKey(action)"
                  :aria-label="`Reset shortcut for ${ACTIONS[action].readable}`"
                  @click="resetActionKey(action)"
                />
              </template>
              <ShortcutKey v-else :binding="actionToKey[action]" />
            </li>
          </ul>
        </section>

        <section class="shortcut-group" aria-labelledby="shortcut-group-mouse">
          <h3 id="shortcut-group-mouse" class="shortcut-group-title">
            Mouse controls
          </h3>
          <ul class="shortcut-list">
            <li
              v-for="[name, description] in MOUSE_CONTROLS"
              :key="name"
              class="shortcut-row"
            >
              <span class="shortcut-label">{{ name }}</span>
              <span class="text-body-2 text-medium-emphasis text-right">
                {{ description }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </v-card>
  </closeable-dialog>
</template>

<style scoped>
.shortcuts-card {
  max-height: 85vh;
  overflow-y: auto;
}

.shortcut-groups {
  column-count: 2;
  column-gap: 32px;
}

@media (max-width: 900px) {
  .shortcut-groups {
    column-count: 1;
  }
}

.shortcut-group {
  break-inside: avoid;
  margin-bottom: 20px;
}

.shortcut-group-title {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-secondary));
  margin-bottom: 6px;
}

.shortcut-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.shortcut-label {
  font-size: 0.875rem;
}

.shortcut-edit-btn {
  min-width: 96px;
}
</style>
