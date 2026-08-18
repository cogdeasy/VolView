import { createVuetify } from 'vuetify';
import { useLocalStorage } from '@vueuse/core';

import { BrandColors } from '@/src/branding';
import {
  DefaultTheme,
  DarkTheme,
  LightTheme,
  LegacyThemes,
  ThemeStorageKey,
} from '@/src/constants';

const vuetify = createVuetify({
  theme: {
    defaultTheme: DefaultTheme,
    themes: {
      [DarkTheme]: {
        dark: true,
        colors: {
          primary: BrandColors.primaryLight,
          secondary: BrandColors.accent,
          'selection-bg-color': BrandColors.selectionDark,
          'selection-border-color': BrandColors.selectionDark,
        },
      },
      [LightTheme]: {
        dark: false,
        colors: {
          primary: BrandColors.primary,
          secondary: BrandColors.accent,
          'selection-bg-color': BrandColors.selectionLight,
          'selection-border-color': BrandColors.selectionLight,
          surface: '#f0f0f0',
          'on-surface-variant': '#d0d0d0',
        },
      },
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
vuetify.theme.change(theme.value);

export default vuetify;
