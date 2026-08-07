import { describe, it, expect } from 'vitest';

import {
  bindingFromEvent,
  canonicalizeBinding,
  eventMatchesBinding,
  findBindingConflicts,
  formatBinding,
  formatBindingParts,
  parseBinding,
} from '@/src/utils/keyBindings';

const keyEvent = (init: KeyboardEventInit & { key: string }) =>
  new KeyboardEvent('keydown', init);

describe('parseBinding', () => {
  it('parses modifiers separated by +, - or _', () => {
    expect(parseBinding('ctrl+k')).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 'k',
    });
    expect(parseBinding('shift-c').shift).toBe(true);
    expect(parseBinding('shift_c').key).toBe('c');
  });

  it('resolves key aliases', () => {
    expect(parseBinding('up').key).toBe('arrowup');
    expect(parseBinding('esc').key).toBe('escape');
    expect(parseBinding('spacebar').key).toBe('space');
  });

  it('treats a lone modifier as the bound key', () => {
    expect(parseBinding('Alt')).toMatchObject({ alt: false, key: 'alt' });
  });

  it('keeps a separator character that is itself the key', () => {
    expect(parseBinding('ctrl+-')).toMatchObject({ ctrl: true, key: '-' });
    expect(parseBinding('ctrl++')).toMatchObject({ ctrl: true, key: '+' });
    expect(parseBinding('ctrl+_')).toMatchObject({ ctrl: true, key: '_' });
    expect(parseBinding('-')).toMatchObject({ ctrl: false, key: '-' });
  });
});

describe('bindingFromEvent', () => {
  it('builds a canonical binding from an event', () => {
    expect(bindingFromEvent(keyEvent({ key: 'k', ctrlKey: true }))).toBe(
      'ctrl+k'
    );
    expect(bindingFromEvent(keyEvent({ key: 'ArrowDown' }))).toBe('arrowdown');
  });

  it('does not add shift for symbol keys that already encode it', () => {
    expect(bindingFromEvent(keyEvent({ key: '?', shiftKey: true }))).toBe('?');
  });

  it('ignores presses of a modifier alone', () => {
    expect(bindingFromEvent(keyEvent({ key: 'Shift', shiftKey: true }))).toBe(
      ''
    );
  });
});

describe('eventMatchesBinding', () => {
  it('requires the modifier state to match exactly', () => {
    const event = keyEvent({ key: 'i' });
    expect(eventMatchesBinding(event, 'i')).toBe(true);
    expect(eventMatchesBinding(event, 'shift+i')).toBe(false);
    expect(
      eventMatchesBinding(keyEvent({ key: 'i', ctrlKey: true }), 'i')
    ).toBe(false);
  });

  it('accepts cmd for a ctrl binding on Apple devices only', () => {
    const cmdK = keyEvent({ key: 'k', metaKey: true });
    expect(eventMatchesBinding(cmdK, 'ctrl+k', { apple: true })).toBe(true);
    expect(eventMatchesBinding(cmdK, 'ctrl+k', { apple: false })).toBe(false);
  });

  it('matches shifted symbol keys regardless of the shift flag', () => {
    expect(
      eventMatchesBinding(keyEvent({ key: '?', shiftKey: true }), '?')
    ).toBe(true);
  });
});

describe('formatBinding', () => {
  it('renders a readable form per platform', () => {
    expect(formatBinding('ctrl+k', { apple: false })).toBe('Ctrl K');
    expect(formatBinding('ctrl+k', { apple: true })).toBe('⌘ K');
    expect(formatBinding('arrowdown', { apple: false })).toBe('↓');
    expect(formatBinding('shift+l', { apple: false })).toBe('Shift L');
  });

  it('splits into one cap per key for the keycap display', () => {
    expect(formatBindingParts('shift+home', { apple: false })).toEqual([
      'Shift',
      'Home',
    ]);
    expect(formatBindingParts('pagedown', { apple: false })).toEqual([
      'Page Down',
    ]);
  });
});

describe('canonicalizeBinding', () => {
  it('normalizes separators, case and modifier order', () => {
    expect(canonicalizeBinding('Shift-Ctrl-L')).toBe('ctrl+shift+l');
    expect(canonicalizeBinding('CTRL_K')).toBe('ctrl+k');
  });
});

describe('findBindingConflicts', () => {
  it('reports the other actions sharing a binding', () => {
    const conflicts = findBindingConflicts({
      a: 'shift+l',
      b: 'Shift-L',
      c: 'i',
    });
    expect(conflicts).toEqual({ a: ['b'], b: ['a'] });
  });
});
