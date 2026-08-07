import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import {
  actionToKey,
  isCustomizedActionKey,
  resetAllActionKeys,
  setActionKey,
  shouldIgnoreKeyboardShortcuts,
} from '../useKeyboardShortcuts';

describe('shouldIgnoreKeyboardShortcuts', () => {
  it('ignores shortcuts while an input is focused', () => {
    const input = document.createElement('input');
    expect(shouldIgnoreKeyboardShortcuts(input)).toBe(true);
  });

  it('ignores shortcuts while a textarea is focused', () => {
    const textarea = document.createElement('textarea');
    expect(shouldIgnoreKeyboardShortcuts(textarea)).toBe(true);
  });

  it('ignores shortcuts while a contenteditable element is focused', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(shouldIgnoreKeyboardShortcuts(editable)).toBe(true);
  });

  it('does not ignore shortcuts for non-editable controls', () => {
    const button = document.createElement('button');
    expect(shouldIgnoreKeyboardShortcuts(button)).toBe(false);
  });
});

describe('shortcut overrides', () => {
  const stored = () =>
    JSON.parse(localStorage.getItem('volview.shortcut-overrides') ?? '{}');

  afterEach(async () => {
    resetAllActionKeys();
    await nextTick();
  });

  it('persists a changed binding', async () => {
    setActionKey('invertGrayscale', 'j');
    await nextTick();

    expect(actionToKey.value.invertGrayscale).toBe('j');
    expect(isCustomizedActionKey('invertGrayscale')).toBe(true);
    expect(stored()).toHaveProperty('invertGrayscale', 'j');
  });

  it('stores nothing when the recorded key is the default', async () => {
    setActionKey('invertGrayscale', 'I');
    await nextTick();

    expect(isCustomizedActionKey('invertGrayscale')).toBe(false);
    // Persisting it would shadow a later change to the default binding.
    expect(stored()).not.toHaveProperty('invertGrayscale');
  });

  it('drops the override when a binding is changed back', async () => {
    setActionKey('invertGrayscale', 'j');
    await nextTick();
    setActionKey('invertGrayscale', 'i');
    await nextTick();

    expect(actionToKey.value.invertGrayscale).toBe('i');
    expect(stored()).not.toHaveProperty('invertGrayscale');
  });
});
