import { createVuetify } from 'vuetify';
import { useLocalStorage } from '@vueuse/core';

import {
  DarkPalette,
  LightPalette,
  Density,
  DefaultDensity,
} from '@/src/design-tokens';
import {
  DefaultTheme,
  DarkTheme,
  LightTheme,
  LegacyThemes,
  ThemeStorageKey,
} from '@/src/constants';

/**
 * Emphasis opacities are part of the token layer because they change measured
 * contrast: `.text-medium-emphasis` is `on-surface` blended into the surface at
 * this alpha, which is >= 6:1 in both themes at 0.7.
 */
function themeVariables(palette) {
  return {
    'border-color': palette['border-strong'],
    'border-opacity': 1,
    'high-emphasis-opacity': 1,
    'medium-emphasis-opacity': 0.7,
    'disabled-opacity': 0.38,
    'hover-opacity': 0.08,
    'focus-opacity': 0.12,
    'selected-opacity': 0.1,
    'activated-opacity': 0.12,
    'pressed-opacity': 0.14,
    'dragged-opacity': 0.08,
  };
}

const vuetify = createVuetify({
  theme: {
    defaultTheme: DefaultTheme,
    themes: {
      [DarkTheme]: {
        dark: true,
        colors: { ...DarkPalette },
        variables: themeVariables(DarkPalette),
      },
      [LightTheme]: {
        dark: false,
        colors: { ...LightPalette },
        variables: themeVariables(LightPalette),
      },
    },
  },
  // Philips defaults, so components inherit the design language instead of
  // repeating density/variant/rounding props at every call site.
  defaults: {
    global: {
      density: Density[DefaultDensity].vuetify,
    },
    VBtn: {
      variant: 'flat',
      rounded: 'pv-md',
      // Philips uses sentence case; Material's uppercase button text is loud
      // and hurts legibility of clinical terms.
      class: 'text-none',
    },
    VCard: {
      rounded: 'pv-md',
    },
    VSheet: {
      rounded: 'pv-md',
    },
    VChip: {
      rounded: 'pv-sm',
    },
    // `hideDetails: 'auto'` reclaims the message slot under fields that have
    // nothing to say. It is paired with `persistentHint` so a field that does
    // have a hint reserves the slot permanently instead of growing on focus
    // and shoving the rest of the dialog down.
    VTextField: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VTextarea: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VSelect: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VCombobox: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VAutocomplete: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VFileInput: {
      variant: 'outlined',
      hideDetails: 'auto',
      persistentHint: true,
    },
    VSwitch: {
      color: 'primary',
      hideDetails: 'auto',
    },
    VCheckbox: {
      color: 'primary',
      hideDetails: 'auto',
    },
    VRadioGroup: {
      color: 'primary',
    },
    VSlider: {
      color: 'primary',
      hideDetails: 'auto',
    },
    VRangeSlider: {
      color: 'primary',
      hideDetails: 'auto',
    },
    VProgressLinear: {
      color: 'primary',
    },
    VTabs: {
      color: 'primary',
    },
    VTooltip: {
      // Styling hangs off `.v-tooltip` in tokens.css, not off this class, so a
      // call site passing its own `content-class` stays themed.
      contentClass: 'pv-tooltip',
    },
  },
  display: {
    mobileBreakpoint: 'lg',
    thresholds: {
      lg: 1024,
    },
  },
});

const theme = useLocalStorage(ThemeStorageKey, DefaultTheme);
if (LegacyThemes.has(theme.value)) {
  theme.value = LegacyThemes.get(theme.value);
} else if (theme.value !== DarkTheme && theme.value !== LightTheme) {
  theme.value = DefaultTheme;
}
vuetify.theme.global.name.value = theme.value;

export default vuetify;
