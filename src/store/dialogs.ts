import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Open/closed state of the app's global dialogs.
 *
 * These used to be component-local refs, which made the dialogs reachable only
 * by clicking their button. Hoisting them into a store lets the command
 * palette (and any keyboard shortcut) open the same dialogs.
 */
export const useDialogStore = defineStore('dialogs', () => {
  const commandPaletteOpen = ref(false);
  const settingsOpen = ref(false);
  const saveSessionOpen = ref(false);
  const notificationsOpen = ref(false);
  const aboutOpen = ref(false);

  function closeAll() {
    commandPaletteOpen.value = false;
    settingsOpen.value = false;
    saveSessionOpen.value = false;
    notificationsOpen.value = false;
    aboutOpen.value = false;
  }

  return {
    commandPaletteOpen,
    settingsOpen,
    saveSessionOpen,
    notificationsOpen,
    aboutOpen,
    closeAll,
  };
});
