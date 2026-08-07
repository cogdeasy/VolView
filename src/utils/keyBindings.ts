/**
 * Parsing, matching and display of keyboard bindings.
 *
 * A binding is a lowercase string such as `ctrl+k`, `shift-c`, `arrowdown` or
 * `?`. Modifiers may be separated by `+`, `-` or `_` for backwards
 * compatibility with the shortcut strings shipped in the app config.
 */

export interface ParsedBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const MODIFIERS = ['ctrl', 'control', 'shift', 'alt', 'option', 'meta', 'cmd'];
const SEPARATORS = '+-_';

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
};

const DISPLAY_KEYS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  escape: 'Esc',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End',
  enter: 'Enter',
  delete: 'Delete',
  backspace: 'Backspace',
};

/** Keys whose event.key already encodes the shift state (e.g. `/` -> `?`). */
function isSymbolKey(key: string) {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

export function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(
    navigator.platform || navigator.userAgent
  );
}

export function parseBinding(binding: string): ParsedBinding {
  const parsed: ParsedBinding = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: '',
  };

  // Modifiers are peeled off the front rather than the binding being split on
  // the separators, so a separator character can itself be the key: `ctrl+-`
  // is Ctrl plus minus, not a malformed Ctrl.
  let rest = binding.toLowerCase();
  let peeled = true;
  while (peeled) {
    peeled = false;
    const modifier = MODIFIERS.find(
      (candidate) =>
        rest.length > candidate.length + 1 &&
        rest.startsWith(candidate) &&
        SEPARATORS.includes(rest.charAt(candidate.length))
    );
    if (!modifier) break;

    if (modifier === 'ctrl' || modifier === 'control') parsed.ctrl = true;
    else if (modifier === 'shift') parsed.shift = true;
    else if (modifier === 'alt' || modifier === 'option') parsed.alt = true;
    else parsed.meta = true;

    rest = rest.slice(modifier.length + 1);
    peeled = true;
  }

  parsed.key = KEY_ALIASES[rest] ?? rest;

  // A modifier used on its own (`ctrl`, `shift`) is a valid binding: the app
  // uses those as hold-to-modify keys.
  if (MODIFIERS.includes(parsed.key)) {
    if (parsed.key === 'control') parsed.key = 'ctrl';
    if (parsed.key === 'option') parsed.key = 'alt';
    if (parsed.key === 'cmd') parsed.key = 'meta';
  }

  return parsed;
}

export function bindingFromEvent(event: KeyboardEvent): string {
  const rawKey = event.key.toLowerCase();
  const key = KEY_ALIASES[rawKey] ?? rawKey;
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.metaKey) parts.push('meta');
  if (event.altKey) parts.push('alt');
  // Symbol keys already carry the shift in their key value ('?' not 'shift+/').
  if (event.shiftKey && !isSymbolKey(key)) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

/**
 * True when the event should trigger the given binding.
 *
 * On Apple devices a `ctrl` binding also matches `cmd`, matching the platform
 * convention for application commands.
 */
export function eventMatchesBinding(
  event: KeyboardEvent,
  binding: string,
  { apple = isAppleDevice() } = {}
) {
  const want = parseBinding(binding);
  if (!want.key) return false;

  const rawKey = event.key.toLowerCase();
  const key = KEY_ALIASES[rawKey] ?? rawKey;
  if (key !== want.key) return false;

  const primaryPressed =
    want.ctrl && apple ? event.ctrlKey || event.metaKey : event.ctrlKey;
  if (want.ctrl !== primaryPressed) return false;
  if (!want.ctrl && !want.meta && (event.metaKey || event.ctrlKey))
    return false;
  if (want.meta && !event.metaKey) return false;
  if (want.alt !== event.altKey) return false;
  if (!isSymbolKey(key) && want.shift !== event.shiftKey) return false;

  return true;
}

/** One display string per key cap, e.g. `ctrl+k` -> `['Ctrl', 'K']`. */
export function formatBindingParts(
  binding: string,
  { apple = isAppleDevice() } = {}
) {
  const parsed = parseBinding(binding);
  const parts: string[] = [];
  if (parsed.ctrl) parts.push(apple ? '⌘' : 'Ctrl');
  if (parsed.meta) parts.push(apple ? '⌘' : 'Meta');
  if (parsed.alt) parts.push(apple ? '⌥' : 'Alt');
  if (parsed.shift) parts.push(apple ? '⇧' : 'Shift');

  const { key } = parsed;
  parts.push(
    DISPLAY_KEYS[key] ??
      (key.length === 1 ? key.toUpperCase() : capitalize(key))
  );
  return parts;
}

/** Human readable form, e.g. `ctrl+k` -> `Ctrl K` (`⌘ K` on Apple devices). */
export function formatBinding(
  binding: string,
  options: { apple?: boolean } = {}
) {
  return formatBindingParts(binding, options).join(' ');
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Canonical form used to compare two bindings for equality. */
export function canonicalizeBinding(binding: string) {
  const parsed = parseBinding(binding);
  if (!parsed.key) return '';
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('ctrl');
  if (parsed.meta) parts.push('meta');
  if (parsed.alt) parts.push('alt');
  if (parsed.shift) parts.push('shift');
  parts.push(parsed.key);
  return parts.join('+');
}

/**
 * Groups the actions that share a binding.
 *
 * @returns action -> the other actions bound to the same key
 */
export function findBindingConflicts<T extends string>(
  bindings: Record<T, string>
): Record<string, T[]> {
  const byBinding = new Map<string, T[]>();
  (Object.entries(bindings) as Array<[T, string]>).forEach(
    ([action, binding]) => {
      const canonical = canonicalizeBinding(binding);
      if (!canonical) return;
      const existing = byBinding.get(canonical) ?? [];
      existing.push(action);
      byBinding.set(canonical, existing);
    }
  );

  const conflicts: Record<string, T[]> = {};
  (Object.entries(bindings) as Array<[T, string]>).forEach(
    ([action, binding]) => {
      const others = (byBinding.get(canonicalizeBinding(binding)) ?? []).filter(
        (other) => other !== action
      );
      if (others.length) conflicts[action] = others;
    }
  );
  return conflicts;
}
