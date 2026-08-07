import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { useWorklistStore } from '@/src/store/worklist';
import {
  shouldIgnoreKeyboardShortcuts,
  useKeyboardShortcuts,
} from '../useKeyboardShortcuts';

const { invoked } = vi.hoisted(() => ({ invoked: [] as string[] }));

vi.mock('../actions', () => ({
  ACTION_TO_FUNC: new Proxy(
    {},
    {
      get: (_target, action: string) => () => invoked.push(action),
    }
  ),
}));

/** Holds the key down long enough for the shortcut watcher to flush. */
async function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  await nextTick();
  window.dispatchEvent(new KeyboardEvent('keyup', { key }));
  await nextTick();
}

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

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invoked.length = 0;
  });

  it('does not reach the viewer while the worklist covers it', async () => {
    const worklist = useWorklistStore();
    useKeyboardShortcuts();
    expect(worklist.visible).toBe(true);

    await pressKey('z');
    expect(invoked).toEqual([]);

    worklist.hide();
    await pressKey('z');
    expect(invoked).toEqual(['zoom']);
  });
});
