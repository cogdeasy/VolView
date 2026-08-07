import { defineStore } from 'pinia';
import { ref, Ref } from 'vue';

interface Channel {
  text: Ref<string>;
  /** Messages announced since the current batch opened. */
  batch: string[];
  /** The text the live region held before the current batch opened. */
  before: string;
  open: boolean;
}

/**
 * Text pushed to the app's ARIA live regions.
 *
 * Assistive technology only reads a live region when its text *changes*, so a
 * repeated message is suffixed with an invisible marker to force a re-read.
 *
 * A live region can also only ever hold one value per render, so several
 * messages raised in the same tick - an import that fails on three files, say -
 * are joined into a single announcement instead of overwriting one another.
 */
export const useAnnouncementStore = defineStore('announcements', () => {
  const polite = ref('');
  const assertive = ref('');

  // The marker is toggled rather than appended, so a message repeated any
  // number of times still changes the text each time.
  const withChangeMarker = (previous: string, message: string) =>
    previous.endsWith('\u200b') ? message : `${message}\u200b`;

  const channels: Record<'polite' | 'assertive', Channel> = {
    polite: { text: polite, batch: [], before: '', open: false },
    assertive: { text: assertive, batch: [], before: '', open: false },
  };

  function push(channel: Channel, message: string) {
    if (!channel.open) {
      channel.open = true;
      channel.batch = [];
      channel.before = channel.text.value;
      // Closes at the end of the tick, once Vue has rendered this batch.
      Promise.resolve().then(() => {
        channel.open = false;
      });
    }

    if (channel.batch.includes(message)) return;
    channel.batch.push(message);
    channel.text.value = withChangeMarker(
      channel.before,
      channel.batch.join('. ')
    );
  }

  function announce(message: string) {
    push(channels.polite, message);
  }

  function announceUrgent(message: string) {
    push(channels.assertive, message);
  }

  return { polite, assertive, announce, announceUrgent };
});
