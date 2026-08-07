import { watchEffect } from 'vue';
import type { Ref } from 'vue';
import type { DefaultsInstance } from 'vuetify';

import {
  baseCssVariables,
  densityCssVariables,
  Density,
} from '@/src/design-tokens';
import { useUiDensityStore } from '@/src/store/ui-density';

type VuetifyLike = { defaults: Ref<DefaultsInstance> };

function writeVariables(vars: Record<string, string>) {
  const { style } = document.documentElement;
  Object.entries(vars).forEach(([name, value]) => {
    style.setProperty(name, value);
  });
}

/**
 * Publishes the design tokens to the DOM as `--pv-*` custom properties and
 * keeps Vuetify's global `density` default in sync with the density token.
 *
 * Must run after Pinia is installed, because the density token lives in a
 * store so that Settings can change it at runtime.
 */
export function installDesignTokens(vuetify: VuetifyLike) {
  writeVariables(baseCssVariables());

  const densityStore = useUiDensityStore();

  return watchEffect(() => {
    const { density } = densityStore;
    writeVariables(densityCssVariables(density));
    document.documentElement.dataset.pvDensity = density;

    const globalDefaults = vuetify.defaults.value?.global;
    if (globalDefaults) {
      globalDefaults.density = Density[density].vuetify;
    }
  });
}

export default installDesignTokens;
