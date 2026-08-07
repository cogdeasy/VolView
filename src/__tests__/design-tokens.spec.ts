import { describe, it, expect } from 'vitest';

import {
  DarkPalette,
  LightPalette,
  Density,
  Densities,
  DefaultDensity,
  Spacing,
  TypeScale,
  baseCssVariables,
  densityCssVariables,
  type SemanticPalette,
} from '@/src/design-tokens';
import {
  contrastRatioRounded,
  parseHexColor,
  WCAG_AA_NON_TEXT,
  WCAG_AA_TEXT,
} from '@/src/utils/contrast';

/** Composites `foreground` over `background` at `alpha`, as the browser does. */
function blend(foreground: string, background: string, alpha: number) {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  const mix = (a: number, b: number) => Math.round(alpha * a + (1 - alpha) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/** Must match `medium-emphasis-opacity` in `src/plugins/vuetify.js`. */
const MEDIUM_EMPHASIS_OPACITY = 0.7;

/** Must match `activated-opacity`; it is the tint Vuetify's `tonal` uses. */
const ACTIVATED_OPACITY = 0.12;

type Pair = {
  label: string;
  foreground: string | ReturnType<typeof parseHexColor>;
  background: string;
  threshold: number;
};

/**
 * Every text/background and boundary/background pair the Philips chrome can
 * produce. A token edit that drops any of these below its WCAG AA threshold
 * fails here rather than shipping.
 */
function chromePairs(palette: SemanticPalette): Pair[] {
  const surfaces: Array<[string, string, string]> = [
    ['background', palette.background, palette['on-background']],
    ['surface', palette.surface, palette['on-surface']],
    ['surface-raised', palette['surface-raised'], palette['on-surface-raised']],
    ['surface-sunken', palette['surface-sunken'], palette['on-surface-sunken']],
  ];

  const pairs: Pair[] = [];

  surfaces.forEach(([name, background, onSurface]) => {
    pairs.push({
      label: `on-${name} text on ${name}`,
      foreground: onSurface,
      background,
      threshold: WCAG_AA_TEXT,
    });
    pairs.push({
      label: `medium-emphasis text on ${name}`,
      foreground: blend(onSurface, background, MEDIUM_EMPHASIS_OPACITY),
      background,
      threshold: WCAG_AA_TEXT,
    });
    (
      [
        'text-muted',
        'primary',
        'secondary',
        'error',
        'warning',
        'success',
        'info',
      ] as const
    ).forEach((token) => {
      pairs.push({
        label: `${token} text on ${name}`,
        foreground: palette[token],
        background,
        threshold: WCAG_AA_TEXT,
      });
    });
    // `surface-variant` is drawn on top of a surface (slider tracks and ticks,
    // switch tracks), so it is held to the non-text boundary threshold.
    (
      [
        'border-strong',
        'accent',
        'selection-border-color',
        'surface-variant',
      ] as const
    ).forEach((token) => {
      pairs.push({
        label: `${token} boundary against ${name}`,
        foreground: palette[token],
        background,
        threshold: WCAG_AA_NON_TEXT,
      });
    });
  });

  (
    [
      ['on-primary', 'primary'],
      ['on-secondary', 'secondary'],
      ['on-error', 'error'],
      ['on-warning', 'warning'],
      ['on-success', 'success'],
      ['on-info', 'info'],
      ['on-selection', 'selection-bg-color'],
      ['on-surface-variant', 'surface-variant'],
    ] as const
  ).forEach(([foreground, background]) => {
    pairs.push({
      label: `${foreground} text on ${background} fill`,
      foreground: palette[foreground],
      background: palette[background],
      threshold: WCAG_AA_TEXT,
    });
  });

  return pairs;
}

describe.each([
  ['philips-dark', DarkPalette],
  ['philips-light', LightPalette],
])('%s chrome contrast', (themeName, palette) => {
  const pairs = chromePairs(palette);

  it.each(pairs)(
    `${themeName}: $label clears $threshold:1`,
    ({ foreground, background, threshold }) => {
      expect(
        contrastRatioRounded(foreground, background)
      ).toBeGreaterThanOrEqual(threshold);
    }
  );
});

describe('accent handling', () => {
  it('keeps the brand cyan as the dark-theme interactive fill', () => {
    expect(DarkPalette.secondary).to.equal('#00A3E0');
    expect(DarkPalette.accent).to.equal('#00A3E0');
  });

  it('darkens interactive cyan in the light theme rather than dropping it', () => {
    // The undarkened brand cyan fails AA against white text; the light theme
    // must not use it as an interactive fill.
    expect(LightPalette.secondary).to.not.equal('#00A3E0');
    expect(
      contrastRatioRounded(LightPalette['on-secondary'], LightPalette.secondary)
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    // ...and it stays legible when Vuetify renders it as a foreground
    // (`variant="text"` / `variant="tonal"`).
    expect(
      contrastRatioRounded(LightPalette.secondary, LightPalette.surface)
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  // `variant="tonal"` tints the fill with the color itself, so the pairing is
  // measurably tighter than the same color on a plain surface. This is the
  // case that made the original cyan look disabled, so it is pinned here.
  it.each(
    (
      [
        ['dark', DarkPalette],
        ['light', LightPalette],
      ] as const
    ).flatMap(([theme, palette]) =>
      (['background', 'surface', 'surface-sunken'] as const).map(
        (surface) => [theme, surface, palette] as const
      )
    )
  )(
    'keeps a tonal secondary control legible in %s on %s',
    (_theme, surface, palette) => {
      const fill = blend(
        palette.secondary,
        palette[surface],
        ACTIVATED_OPACITY
      );
      expect(
        contrastRatioRounded(palette.secondary, fill)
      ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  );
});

describe('density tokens', () => {
  it('defaults to comfortable', () => {
    expect(DefaultDensity).to.equal('comfortable');
    expect(Densities).to.deep.equal(['comfortable', 'compact']);
  });

  it('makes every compact metric no larger than the comfortable one', () => {
    const px = (value: string) => Number.parseFloat(value);
    const metrics = [
      'toolButtonSize',
      'toolIconSize',
      'stackGap',
      'inlinePadding',
      'blockPadding',
      'listRowHeight',
      'appBarHeight',
      'tabHeight',
    ] as const;
    metrics.forEach((metric) => {
      expect(px(Density.compact[metric])).toBeLessThan(
        px(Density.comfortable[metric])
      );
    });
  });

  it('keeps comfortable hit targets at the WCAG 2.2 target-size minimum', () => {
    expect(
      Number.parseFloat(Density.comfortable.toolButtonSize)
    ).toBeGreaterThanOrEqual(24);
    expect(
      Number.parseFloat(Density.compact.toolButtonSize)
    ).toBeGreaterThanOrEqual(24);
  });
});

describe('css custom properties', () => {
  it('emits a variable for every scale entry', () => {
    const vars = baseCssVariables();
    Object.keys(Spacing).forEach((name) => {
      expect(vars).toHaveProperty(`--pv-space-${name}`);
    });
    Object.keys(TypeScale).forEach((name) => {
      expect(vars).toHaveProperty(`--pv-font-size-${name}`);
      expect(vars).toHaveProperty(`--pv-line-height-${name}`);
    });
    expect(vars['--pv-font-family']).to.contain('Source Sans 3');
  });

  it('emits density-dependent variables per density', () => {
    expect(
      densityCssVariables('compact')['--pv-density-tool-button-size']
    ).to.equal(Density.compact.toolButtonSize);
    expect(
      densityCssVariables('comfortable')['--pv-density-tool-button-size']
    ).to.equal(Density.comfortable.toolButtonSize);
  });
});
