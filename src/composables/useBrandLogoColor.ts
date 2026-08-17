import { computed, type ComputedRef } from 'vue';
import { useTheme } from 'vuetify';
import { Brand } from '@/src/branding';

/**
 * Color for the lockup text: the brand orange reads on light backgrounds,
 * white on dark ones.
 */
export function useBrandLogoColor(): ComputedRef<string> {
  const theme = useTheme();
  return computed(() =>
    theme.current.value.dark ? Brand.colors.onDark : Brand.colors.primary
  );
}
