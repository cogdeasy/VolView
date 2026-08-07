<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ACTION_GROUPS, ActionGroup } from '@/src/constants';
import { useCommands, type Command } from '@/src/composables/useCommands';
import { useDialogStore } from '@/src/store/dialogs';
import { useAnnouncementStore } from '@/src/store/announcements';
import { fuzzyRank } from '@/src/utils/fuzzyMatch';
import ShortcutKey from '@/src/components/ShortcutKey.vue';

const dialogStore = useDialogStore();
const { commandPaletteOpen } = storeToRefs(dialogStore);
const announcements = useAnnouncementStore();
const { commands, shortcutForCommand } = useCommands();

const query = ref('');
const highlighted = ref(0);
const searchField = ref<HTMLInputElement | null>(null);
const listElement = ref<HTMLElement | null>(null);

const ranked = computed(() =>
  fuzzyRank(
    commands.value.filter((command) => !command.disabled),
    query.value,
    { text: (command) => command.title, keywords: (c) => c.keywords ?? '' }
  ).map(({ item }) => item)
);

/**
 * Ranked commands bucketed by group so a heading is only ever shown once.
 * Groups are ordered by their best-ranked member, keeping the closest match
 * to the query at the top of the list.
 */
const groups = computed(() => {
  const buckets = new Map<ActionGroup, Command[]>();
  ranked.value.forEach((command) => {
    const bucket = buckets.get(command.group);
    if (bucket) bucket.push(command);
    else buckets.set(command.group, [command]);
  });
  return [...buckets.entries()];
});

/** Navigable order; matches the rendered order. */
const results = computed(() =>
  groups.value.flatMap(([, groupCommands]) => groupCommands)
);

/** Results in display order, with a header before each group. */
type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'command'; id: string; command: Command; index: number };

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  let index = 0;
  groups.value.forEach(([group, groupCommands]) => {
    out.push({
      kind: 'header',
      id: `header-${group}`,
      label: ACTION_GROUPS[group],
    });
    groupCommands.forEach((command) => {
      out.push({ kind: 'command', id: command.id, command, index });
      index += 1;
    });
  });
  return out;
});

const activeId = computed(() => results.value[highlighted.value]?.id);

watch(query, () => {
  highlighted.value = 0;
});

watch(commandPaletteOpen, async (open) => {
  if (!open) return;
  query.value = '';
  highlighted.value = 0;
  await nextTick();
  searchField.value?.focus();
});

function scrollHighlightedIntoView() {
  nextTick(() => {
    const el = listElement.value?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function move(delta: number) {
  const count = results.value.length;
  if (!count) return;
  highlighted.value = (highlighted.value + delta + count) % count;
  scrollHighlightedIntoView();
}

function jumpTo(index: number) {
  if (!results.value.length) return;
  highlighted.value = Math.max(0, Math.min(index, results.value.length - 1));
  scrollHighlightedIntoView();
}

function runCommand(command: Command | undefined) {
  if (!command) return;
  commandPaletteOpen.value = false;
  announcements.announce(command.title);
  command.run();
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      move(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;
    case 'Home':
      event.preventDefault();
      jumpTo(0);
      break;
    case 'End':
      event.preventDefault();
      jumpTo(results.value.length - 1);
      break;
    case 'Enter':
      event.preventDefault();
      runCommand(results.value[highlighted.value]);
      break;
    case 'Escape':
      event.preventDefault();
      commandPaletteOpen.value = false;
      break;
    default:
      // Keep typing inside the search field, but let chorded shortcuts
      // through so Ctrl+K closes the palette the way it opened it.
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
  }
}
</script>

<template>
  <v-dialog
    v-model="commandPaletteOpen"
    width="640"
    max-width="94vw"
    scrim="rgba(0, 0, 0, 0.55)"
    content-class="command-palette-dialog"
    aria-label="Command palette"
  >
    <v-card class="command-palette" role="none">
      <div class="palette-search">
        <v-icon icon="mdi-magnify" class="palette-search-icon" aria-hidden />
        <input
          ref="searchField"
          v-model="query"
          class="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-autocomplete="list"
          :aria-activedescendant="activeId ? `command-${activeId}` : undefined"
          aria-label="Search commands"
          placeholder="Search commands…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <ShortcutKey binding="escape" class="palette-hint" />
      </div>
      <v-divider />
      <div
        v-if="results.length"
        id="command-palette-list"
        ref="listElement"
        class="palette-list"
        role="listbox"
        aria-label="Commands"
      >
        <template v-for="row in rows" :key="row.id">
          <div
            v-if="row.kind === 'header'"
            class="palette-group"
            role="presentation"
          >
            {{ row.label }}
          </div>
          <div
            v-else
            :id="`command-${row.command.id}`"
            class="palette-item"
            role="option"
            :aria-selected="row.index === highlighted"
            :data-active="row.index === highlighted"
            :data-testid="`command-${row.command.id}`"
            @click="runCommand(row.command)"
            @mousemove="highlighted = row.index"
          >
            <v-icon
              :icon="row.command.icon"
              size="18"
              class="palette-item-icon"
              aria-hidden
            />
            <span class="palette-item-title">{{ row.command.title }}</span>
            <ShortcutKey
              v-if="shortcutForCommand(row.command)"
              :binding="shortcutForCommand(row.command)!"
            />
          </div>
        </template>
      </div>
      <div v-else class="palette-empty">No commands match “{{ query }}”</div>
      <v-divider />
      <div class="palette-footer">
        <span
          ><ShortcutKey binding="arrowup" />
          <ShortcutKey binding="arrowdown" /> to navigate</span
        >
        <span><ShortcutKey binding="enter" /> to run</span>
        <span><ShortcutKey binding="?" /> for all shortcuts</span>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.command-palette {
  border-radius: 8px;
  overflow: hidden;
}

.palette-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.palette-search-icon {
  opacity: 0.7;
}

.palette-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  line-height: 1.5;
}

.palette-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.palette-hint {
  opacity: 0.7;
}

.palette-list {
  max-height: min(58vh, 460px);
  overflow-y: auto;
  padding: 6px 0;
}

.palette-group {
  padding: 10px 16px 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.palette-item[data-active='true'] {
  background-color: rgb(var(--v-theme-selection-bg-color));
  border-left-color: rgb(var(--v-theme-secondary));
}

.palette-item-icon {
  opacity: 0.75;
}

.palette-item-title {
  flex: 1;
  font-size: 0.9375rem;
}

.palette-empty {
  padding: 28px 16px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.palette-footer {
  display: flex;
  gap: 20px;
  padding: 8px 16px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
