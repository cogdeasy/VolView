<script setup>
import { ref } from 'vue';
import { useDisplay } from 'vuetify';
import CloseableDialog from '@/src/components/CloseableDialog.vue';
import AboutBox from '@/src/components/AboutBox.vue';
import PhilipsFullLogo from '@/src/components/icons/PhilipsFullLogo.vue';
import PhilipsLogo from '@/src/components/icons/PhilipsLogo.vue';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';

const emit = defineEmits(['click:left-menu']);

const { mobile } = useDisplay();
const aboutBoxDialog = ref(false);
const keyboardStore = useKeyboardShortcutsStore();
</script>

<template>
  <v-app-bar app clipped-left :height="48">
    <v-btn icon="mdi-menu" @click="emit('click:left-menu')" />
    <v-toolbar-title class="d-flex flex-row align-center">
      <philips-logo v-if="mobile" />
      <philips-full-logo v-else />
    </v-toolbar-title>
    <v-btn
      variant="text"
      icon
      :rounded="0"
      class="toolbar-button"
      @click="keyboardStore.settingsOpen = !keyboardStore.settingsOpen"
    >
      <v-icon icon="mdi-keyboard"></v-icon>
      <v-tooltip activator="parent" location="bottom">
        Keyboard Shortcuts
      </v-tooltip>
    </v-btn>
    <v-btn
      variant="text"
      icon
      :rounded="0"
      class="toolbar-button"
      @click="aboutBoxDialog = !aboutBoxDialog"
    >
      <v-icon icon="mdi-information-outline"></v-icon>
      <v-tooltip activator="parent" location="bottom">About</v-tooltip>
    </v-btn>
  </v-app-bar>
  <closeable-dialog v-model="aboutBoxDialog">
    <about-box />
  </closeable-dialog>
</template>

<style src="@/src/components/styles/utils.css"></style>
<style scoped>
.toolbar-button {
  min-height: 100%; /* fill toolbar height */
}
</style>
