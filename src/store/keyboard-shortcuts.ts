import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useKeyboardShortcutsStore = defineStore(
  'keyboardShortcuts',
  () => {
    /** Visibility of the shortcut cheat sheet / editor dialog. */
    const settingsOpen = ref(false);
    /** Whether that dialog shows its editable bindings. */
    const editing = ref(false);

    function openCheatSheet() {
      editing.value = false;
      settingsOpen.value = true;
    }

    function openEditor() {
      editing.value = true;
      settingsOpen.value = true;
    }

    return {
      settingsOpen,
      editing,
      openCheatSheet,
      openEditor,
    };
  }
);
