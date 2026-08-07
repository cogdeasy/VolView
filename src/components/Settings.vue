<template>
  <v-card>
    <v-card-title class="d-flex flex-row align-center">Settings</v-card-title>
    <v-card-text>
      <v-btn
        class="my-2"
        @click="openKeyboardShortcuts"
        prepend-icon="mdi-keyboard"
        color="secondary"
      >
        Keyboard Shortcuts and View Controls
      </v-btn>
      <v-switch
        :label="`Dark Theme (${dark ? 'On' : 'Off'})`"
        v-model="dark"
      ></v-switch>

      <div class="mt-2">
        <div class="pv-text-label mb-1">Control density</div>
        <div class="pv-text-caption pv-text-muted mb-2">
          Comfortable keeps hit targets large; compact fits more rows on screen
          for long reading sessions.
        </div>
        <v-btn-toggle
          :model-value="density"
          @update:model-value="onDensityChange"
          mandatory
          divided
          variant="outlined"
          data-testid="density-toggle"
        >
          <v-btn
            v-for="option in densities"
            :key="option"
            :value="option"
            :data-testid="`density-${option}`"
            class="text-capitalize"
          >
            {{ option }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <v-switch
        class="mt-2"
        :label="`Camera Auto Reset (${disableCameraAutoReset ? 'On' : 'Off'})`"
        v-model="disableCameraAutoReset"
      ></v-switch>

      <v-switch
        v-if="errorReportingConfigured"
        :label="`Error Reporting (${reportingEnabled ? 'On' : 'Off'})`"
        v-model="reportingEnabled"
      ></v-switch>

      <v-divider class="mt-2 mb-6"></v-divider>
      <dicom-web-settings />

      <v-divider class="mt-2 mb-6"></v-divider>
      <server-settings />
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useTheme } from 'vuetify';
import { useLocalStorage } from '@vueuse/core';

import { useKeyboardShortcutsStore } from '@/src/store/keyboard-shortcuts';
import { useViewCameraStore } from '@/src/store/view-configs/camera';
import { useUiDensityStore } from '@/src/store/ui-density';
import { Densities, type DensityName } from '@/src/design-tokens';
import DicomWebSettings from './dicom-web/DicomWebSettings.vue';
import ServerSettings from './ServerSettings.vue';
import { DarkTheme, LightTheme, ThemeStorageKey } from '../constants';
import {
  useErrorReporting,
  errorReportingConfigured,
} from '../utils/errorReporting';

export default defineComponent({
  setup() {
    const theme = useTheme();
    const store = useLocalStorage(ThemeStorageKey, theme.global.name.value);
    const dark = ref(theme.global.name.value === DarkTheme);

    watch(dark, (isDark) => {
      theme.global.name.value = isDark ? DarkTheme : LightTheme;
      store.value = theme.global.name.value;
    });

    const errorReportingStore = useErrorReporting();
    const reportingEnabled = ref(!errorReportingStore.disableReporting);
    watch(reportingEnabled, (enabled) => {
      errorReportingStore.disableReporting = !enabled;
    });

    const { disableCameraAutoReset } = storeToRefs(useViewCameraStore());

    const densityStore = useUiDensityStore();
    const { density } = storeToRefs(densityStore);
    const onDensityChange = (value: DensityName) => {
      densityStore.setDensity(value);
    };

    const keyboardStore = useKeyboardShortcutsStore();
    const openKeyboardShortcuts = () => {
      keyboardStore.settingsOpen = true;
    };

    return {
      dark,
      reportingEnabled,
      errorReportingConfigured,
      openKeyboardShortcuts,
      disableCameraAutoReset,
      density,
      densities: Densities,
      onDensityChange,
    };
  },
  components: {
    DicomWebSettings,
    ServerSettings,
  },
});
</script>
