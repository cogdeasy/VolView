import { computed, ref } from 'vue';
import { useEventListener, useLocalStorage } from '@vueuse/core';

import { getEntries } from '../utils';
import { ACTION_TO_KEY } from '../config';
import { ACTIONS, Action } from '../constants';
import { ACTION_TO_FUNC } from './actions';
import {
  canonicalizeBinding,
  eventMatchesBinding,
  findBindingConflicts,
} from '../utils/keyBindings';

const OVERRIDES_STORAGE_KEY = 'volview.shortcut-overrides';

/** User edits to the default bindings, kept across sessions. */
const overrides = useLocalStorage<Partial<Record<Action, string>>>(
  OVERRIDES_STORAGE_KEY,
  {}
);

/**
 * The single binding registry: the keyboard handler, the command palette, the
 * cheat sheet and the shortcut editor all read and write this map.
 */
export const actionToKey = ref<Record<Action, string>>({
  ...ACTION_TO_KEY,
  ...overrides.value,
});

/**
 * The action whose binding is being re-recorded, if any. While this is set
 * the global handler stands down so the next keypress can be captured.
 */
export const recordingShortcutFor = ref<Action | null>(null);

/** action -> the other actions currently bound to the same key. */
export const bindingConflicts = computed(() =>
  findBindingConflicts(actionToKey.value)
);

export function setActionKey(action: Action, binding: string) {
  const canonical = canonicalizeBinding(binding);
  if (!canonical) return;
  actionToKey.value = { ...actionToKey.value, [action]: canonical };
  overrides.value = { ...overrides.value, [action]: canonical };
}

export function resetActionKey(action: Action) {
  actionToKey.value = { ...actionToKey.value, [action]: ACTION_TO_KEY[action] };
  const rest = { ...overrides.value };
  delete rest[action];
  overrides.value = rest;
}

export function resetAllActionKeys() {
  actionToKey.value = { ...ACTION_TO_KEY };
  overrides.value = {};
}

export function isCustomizedActionKey(action: Action) {
  return actionToKey.value[action] !== ACTION_TO_KEY[action];
}

export function shouldIgnoreKeyboardShortcuts(
  activeElement: Element | null = document.activeElement
) {
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  return (
    activeElement.isContentEditable ||
    activeElement.closest('input, textarea, select, [role="textbox"]') !== null
  );
}

/** Actions held down while using the mouse; they have no press behavior. */
function isHoldAction(action: Action) {
  return 'hold' in ACTIONS[action] && ACTIONS[action].hold;
}

export function findActionForEvent(
  event: KeyboardEvent,
  bindings: Record<Action, string> = actionToKey.value
) {
  const typing = shouldIgnoreKeyboardShortcuts();
  return (
    getEntries(bindings).find(([action, binding]) => {
      if (isHoldAction(action)) return false;
      if (!eventMatchesBinding(event, binding)) return false;
      // While the user is typing, only chorded shortcuts (Ctrl/Cmd) fire.
      return !typing || event.ctrlKey || event.metaKey;
    })?.[0] ?? null
  );
}

export function useKeyboardShortcuts() {
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (recordingShortcutFor.value) return;
    if (event.repeat && event.ctrlKey) return;

    const action = findActionForEvent(event);
    if (!action) return;

    event.preventDefault();
    ACTION_TO_FUNC[action]();
  });
}
