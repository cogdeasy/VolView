import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Text pushed to the app's ARIA live regions.
 *
 * Assistive technology only reads a live region when its text *changes*, so a
 * repeated message is suffixed with an invisible marker to force a re-read.
 */
export const useAnnouncementStore = defineStore('announcements', () => {
  const polite = ref('');
  const assertive = ref('');

  const withChangeMarker = (previous: string, message: string) =>
    previous.replace(/\u200b$/, '') === message ? `${message}\u200b` : message;

  function announce(message: string) {
    polite.value = withChangeMarker(polite.value, message);
  }

  function announceUrgent(message: string) {
    assertive.value = withChangeMarker(assertive.value, message);
  }

  return { polite, assertive, announce, announceUrgent };
});
