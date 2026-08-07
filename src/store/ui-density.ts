import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

import {
  Densities,
  Density,
  DefaultDensity,
  type DensityName,
} from '@/src/design-tokens';

export const DensityStorageKey = 'app-density';

function isDensityName(value: unknown): value is DensityName {
  return Densities.includes(value as DensityName);
}

/**
 * The chrome density token. `comfortable` is the default (see
 * `DefaultDensity`); `compact` trades whitespace for rows on screen and is
 * intended for long reading sessions on smaller displays.
 */
export const useUiDensityStore = defineStore('uiDensity', () => {
  const stored = useLocalStorage<DensityName>(
    DensityStorageKey,
    DefaultDensity
  );
  if (!isDensityName(stored.value)) {
    stored.value = DefaultDensity;
  }

  const density = computed({
    get: () => stored.value,
    set: (value: DensityName) => {
      stored.value = isDensityName(value) ? value : DefaultDensity;
    },
  });

  const tokens = computed(() => Density[density.value]);
  const isCompact = computed(() => density.value === 'compact');

  function setDensity(value: DensityName) {
    density.value = value;
  }

  function toggleDensity() {
    density.value = isCompact.value ? 'comfortable' : 'compact';
  }

  return { density, tokens, isCompact, setDensity, toggleDensity };
});

export default useUiDensityStore;
