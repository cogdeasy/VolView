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
 * Overrides for actions this build still has. A binding persisted for an
 * action that a later release renamed or dropped is discarded rather than
 * left to break every keypress.
 */
function knownOverrides() {
  return Object.fromEntries(
    Object.entries(overrides.value).filter(([action]) => action in ACTIONS)
  ) as Partial<Record<Action, string>>;
}

/**
 * The bindings a reset returns to: the shipped defaults, replaced by whatever
 * a deployment's config.json supplied.
 */
const defaultBindings = ref<Record<Action, string>>({ ...ACTION_TO_KEY });

/**
 * The single binding registry: the keyboard handler, the command palette, the
 * cheat sheet and the shortcut editor all read and write this map.
 */
export const actionToKey = ref<Record<Action, string>>({
  ...ACTION_TO_KEY,
  ...knownOverrides(),
});

/**
 * Applies deployment-configured bindings. They become the defaults, so a
 * reset restores the deployment's keys rather than the shipped ones, and they
 * do not displace a binding the user has personally changed.
 */
export function setDefaultActionKeys(
  bindings: Partial<Record<Action, string>>
) {
  defaultBindings.value = { ...defaultBindings.value, ...bindings };
  actionToKey.value = { ...defaultBindings.value, ...knownOverrides() };
}

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
  actionToKey.value = {
    ...actionToKey.value,
    [action]: defaultBindings.value[action],
  };
  const rest = { ...overrides.value };
  delete rest[action];
  overrides.value = rest;
}

export function resetAllActionKeys() {
  actionToKey.value = { ...defaultBindings.value };
  overrides.value = {};
}

export function isCustomizedActionKey(action: Action) {
  return actionToKey.value[action] !== defaultBindings.value[action];
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

function isDestructiveAction(action: Action) {
  return 'destructive' in ACTIONS[action] && ACTIONS[action].destructive;
}

/** Widgets that activate on Space or Enter. */
const ACTIVATABLE_WIDGET =
  'button, summary, a[href], [role="button"], [role="link"], [role="tab"], ' +
  '[role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], ' +
  '[role="menuitemcheckbox"], [role="menuitemradio"], [role="option"]';

/** Widgets that move a selection or value with the arrow, page and home keys. */
const NAVIGABLE_WIDGET =
  '[role="slider"], [role="spinbutton"], [role="menu"], [role="menubar"], ' +
  '[role="menuitem"], [role="listbox"], [role="option"], [role="tablist"], ' +
  '[role="tab"], [role="radiogroup"], [role="tree"], [role="grid"]';

const ACTIVATION_KEYS = new Set([' ', 'spacebar', 'enter']);
const NAVIGATION_KEYS = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'home',
  'end',
  'pageup',
  'pagedown',
]);

/**
 * True when the focused widget already owns this key - Space on a button,
 * arrows in a menu. Unchorded shortcuts stand down rather than stealing the
 * key from the control the user is operating.
 */
export function focusHandlesKey(
  event: KeyboardEvent,
  activeElement: Element | null = document.activeElement
) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (!(activeElement instanceof Element)) return false;

  const key = event.key.toLowerCase();
  if (ACTIVATION_KEYS.has(key))
    return activeElement.closest(ACTIVATABLE_WIDGET) !== null;
  if (NAVIGATION_KEYS.has(key))
    return activeElement.closest(NAVIGABLE_WIDGET) !== null;
  return false;
}

/**
 * True when focus sits inside a modal dialog. The viewer behind it must not
 * react to `f`, `i` or the arrow keys while a dialog has the user's attention.
 */
export function inModalDialog(
  activeElement: Element | null = document.activeElement
) {
  if (!(activeElement instanceof Element)) return false;
  return (
    activeElement.closest('[role="dialog"], [role="alertdialog"]') !== null
  );
}

export function findActionForEvent(
  event: KeyboardEvent,
  bindings: Record<Action, string> = actionToKey.value
) {
  if (focusHandlesKey(event)) return null;

  // Typing and dialogs both restrict the app to chorded, non-destructive
  // shortcuts: Ctrl+K and Ctrl+S stay reachable, `i` and Ctrl+/ do not.
  const restricted = shouldIgnoreKeyboardShortcuts() || inModalDialog();
  return (
    getEntries(bindings).find(([action, binding]) => {
      if (isHoldAction(action)) return false;
      if (!eventMatchesBinding(event, binding)) return false;
      if (!restricted) return true;
      return (event.ctrlKey || event.metaKey) && !isDestructiveAction(action);
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
