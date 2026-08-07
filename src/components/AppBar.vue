<script setup>
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import CloseableDialog from '@/src/components/CloseableDialog.vue';
import AboutBox from '@/src/components/AboutBox.vue';
import PhilipsFullLogo from '@/src/components/icons/PhilipsFullLogo.vue';
import PhilipsLogo from '@/src/components/icons/PhilipsLogo.vue';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';
import { useDialogStore } from '@/src/store/dialogs';
import { actionToKey } from '@/src/composables/useKeyboardShortcuts';
import { formatBinding } from '@/src/utils/keyBindings';
import { Brand } from '@/src/branding';

const emit = defineEmits(['click:left-menu']);

const { mobile } = useDisplay();
const dialogStore = useDialogStore();
const { aboutOpen, commandPaletteOpen } = storeToRefs(dialogStore);
const keyboardStore = useKeyboardShortcutsStore();
</script>

<template>
  <v-app-bar app clipped-left :height="48">
    <v-btn
      icon="mdi-menu"
      aria-label="Toggle data browser"
      @click="emit('click:left-menu')"
    />
    <v-toolbar-title class="d-flex flex-row align-center">
      <philips-logo v-if="mobile" :aria-label="Brand.productName" role="img" />
      <philips-full-logo v-else :aria-label="Brand.productName" role="img" />
    </v-toolbar-title>
    <v-btn
      variant="text"
      :rounded="0"
      class="toolbar-button command-palette-button"
      prepend-icon="mdi-magnify"
      :aria-label="`Open command palette, shortcut ${formatBinding(
        actionToKey.showCommandPalette
      )}`"
      @click="commandPaletteOpen = !commandPaletteOpen"
    >
      <span class="text-none">Commands</span>
      <span class="command-palette-hint ml-2">
        {{ formatBinding(actionToKey.showCommandPalette) }}
      </span>
    </v-btn>
    <v-btn
      variant="text"
      icon
      :rounded="0"
      class="toolbar-button"
      :aria-label="`Keyboard shortcuts, shortcut ${formatBinding(
        actionToKey.showKeyboardShortcuts
      )}`"
      @click="keyboardStore.openCheatSheet()"
    >
      <v-icon icon="mdi-keyboard" aria-hidden="true"></v-icon>
      <v-tooltip activator="parent" location="bottom" :aria-hidden="true">
        Keyboard Shortcuts
      </v-tooltip>
    </v-btn>
    <v-btn
      variant="text"
      icon
      :rounded="0"
      class="toolbar-button"
      aria-label="About this application"
      @click="aboutOpen = !aboutOpen"
    >
      <v-icon icon="mdi-information-outline" aria-hidden="true"></v-icon>
      <v-tooltip activator="parent" location="bottom" :aria-hidden="true">
        About
      </v-tooltip>
    </v-btn>
  </v-app-bar>
  <closeable-dialog v-model="aboutOpen" aria-label="About">
    <about-box />
  </closeable-dialog>
</template>

<style src="@/src/components/styles/utils.css"></style>
<style scoped>
.toolbar-button {
  min-height: 100%; /* fill toolbar height */
}

.command-palette-hint {
  padding: 1px 6px;
  border: 1px solid rgba(var(--v-border-color), 0.4);
  border-radius: 4px;
  font-size: 0.6875rem;
  opacity: 0.8;
}
</style>
