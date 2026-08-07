import { computed, type ComputedRef } from 'vue';
import { useTheme } from 'vuetify';
import { BrandColors } from '@/src/branding';

/**
 * Brand colors for the worklist, resolved for the active theme and exposed as
 * custom properties so the stylesheets never name a color.
 */
export function useWorklistTheme(): ComputedRef<Record<string, string>> {
  const theme = useTheme();
  return computed(() => {
    const dark = theme.current.value.dark;
    const { worklist, status } = BrandColors;
    return {
      '--worklist-header-bg': dark ? worklist.headerDark : worklist.headerLight,
      '--worklist-surface': dark ? worklist.surfaceDark : worklist.surfaceLight,
      '--worklist-row-hover': dark
        ? worklist.rowHoverDark
        : worklist.rowHoverLight,
      '--worklist-accent': BrandColors.accent,
      '--worklist-primary': dark
        ? BrandColors.primaryLight
        : BrandColors.primary,
      '--worklist-critical': status.critical,
      '--worklist-on-critical': BrandColors.onDark,
      '--worklist-in-progress': dark
        ? status.inProgressDark
        : status.inProgressLight,
      '--worklist-complete': dark ? status.completeDark : status.completeLight,
    };
  });
}
