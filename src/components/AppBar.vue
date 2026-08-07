<script setup>
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiDensityStore } from '@/src/store/ui-density';
import CloseableDialog from '@/src/components/CloseableDialog.vue';
import AboutBox from '@/src/components/AboutBox.vue';
import PhilipsFullLogo from '@/src/components/icons/PhilipsFullLogo.vue';
import PhilipsLogo from '@/src/components/icons/PhilipsLogo.vue';
import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';

const emit = defineEmits(['click:left-menu']);

const { mobile } = useDisplay();
const aboutBoxDialog = ref(false);
const keyboardStore = useKeyboardShortcutsStore();
const densityStore = useUiDensityStore();
// VToolbar wants a bare number and derives its own offset from `density`;
// the token is authoritative here, so density is pinned to `default`.
const appBarHeight = computed(() =>
  Number.parseFloat(densityStore.tokens.appBarHeight)
);
</script>

<template>
  <v-app-bar
    app
    clipped-left
    density="default"
    color="surface-raised"
    :height="appBarHeight"
  >
    <v-btn
      variant="text"
      icon="mdi-menu"
      :rounded="0"
      class="toolbar-button"
      @click="emit('click:left-menu')"
    />
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
.v-app-bar {
  border-bottom: var(--pv-border-width-hairline) solid
    rgb(var(--v-theme-border));
}

.toolbar-button {
  min-height: 100%; /* fill toolbar height */
}
</style>
