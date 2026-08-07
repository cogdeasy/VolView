import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useAnnouncementStore } from '@/src/store/announcements';

describe('announcements store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('changes the live region text on every repeat of a message', () => {
    const store = useAnnouncementStore();
    const seen: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      store.announce('Ruler tool active');
      seen.push(store.polite);
    }

    // Screen readers only speak a live region when its text changes.
    seen.forEach((text, index) => {
      expect(text.replace(/\u200b$/, '')).toBe('Ruler tool active');
      if (index > 0) expect(text).not.toBe(seen[index - 1]);
    });
  });

  it('keeps polite and urgent messages apart', () => {
    const store = useAnnouncementStore();
    store.announce('Loading data');
    store.announceUrgent('Error: failed to load');

    expect(store.polite.replace(/\u200b$/, '')).toBe('Loading data');
    expect(store.assertive.replace(/\u200b$/, '')).toBe(
      'Error: failed to load'
    );
  });
});
