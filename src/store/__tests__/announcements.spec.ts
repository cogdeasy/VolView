import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { useAnnouncementStore } from '@/src/store/announcements';

/** Lets the store close its current batch, as a new tick would. */
const nextTick = () => Promise.resolve();

const spoken = (text: string) => text.replace(/\u200b$/, '');

describe('announcements store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('changes the live region text on every repeat of a message', async () => {
    const store = useAnnouncementStore();
    const seen: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      store.announce('Ruler tool active');
      seen.push(store.polite);
      await nextTick();
    }

    // Screen readers only speak a live region when its text changes.
    seen.forEach((text, index) => {
      expect(spoken(text)).toBe('Ruler tool active');
      if (index > 0) expect(text).not.toBe(seen[index - 1]);
    });
  });

  it('keeps polite and urgent messages apart', () => {
    const store = useAnnouncementStore();
    store.announce('Loading data');
    store.announceUrgent('Error: failed to load');

    expect(spoken(store.polite)).toBe('Loading data');
    expect(spoken(store.assertive)).toBe('Error: failed to load');
  });

  it('speaks every message raised in the same tick', () => {
    const store = useAnnouncementStore();
    store.announceUrgent('Error: a.dcm failed');
    store.announceUrgent('Error: b.dcm failed');

    // A live region holds one value per render, so a burst has to be joined:
    // writing them in turn would leave only the last one to be read out.
    expect(spoken(store.assertive)).toBe(
      'Error: a.dcm failed. Error: b.dcm failed'
    );
  });

  it('does not repeat an identical message within one burst', () => {
    const store = useAnnouncementStore();
    store.announce('Loading data');
    store.announce('Loading data');

    expect(spoken(store.polite)).toBe('Loading data');
  });

  it('starts a new announcement on the next tick', async () => {
    const store = useAnnouncementStore();
    store.announce('Loading data');
    await nextTick();
    store.announce('Loading complete');

    expect(spoken(store.polite)).toBe('Loading complete');
  });
});
