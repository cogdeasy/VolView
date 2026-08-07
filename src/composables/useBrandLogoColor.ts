import { computed, type ComputedRef } from 'vue';
import { useTheme } from 'vuetify';
import { Brand } from '@/src/branding';

/**
 * Color for the Philips lockup: the brand blue reads on light backgrounds,
 * white on dark ones.
 */
export function useBrandLogoColor(): ComputedRef<string> {
  const theme = useTheme();
  return computed(() =>
    theme.current.value.dark ? '#ffffff' : Brand.colors.primary
  );
}
