/**
 * Philips Volume Viewer design tokens.
 *
 * This module is the single source of truth for the *visual system*: type,
 * space, radii, elevation, density and the semantic colors that make up the
 * application chrome. `src/branding.ts` remains the source of truth for the
 * brand primitives (names, URLs, the three Philips brand colors); everything
 * here is derived from those primitives or is a neutral that supports them.
 *
 * A designer restyling the product should only ever need to edit this file.
 * Consumers pick tokens up in three ways:
 *
 *  1. Vuetify theme colors (`src/plugins/vuetify.js`), giving `bg-*`/`text-*`
 *     utility classes and `--v-theme-*` custom properties.
 *  2. `--pv-*` CSS custom properties emitted by `installDesignTokens()`
 *     (`src/plugins/designTokens.ts`) and consumed by `src/styles/tokens.css`.
 *  3. Vuetify component `defaults`, so components inherit Philips density,
 *     variant and rounding without per-usage props.
 */

import { BrandColors } from '@/src/branding';

// The brand primitives are re-exported so that this module is a superset:
// `@/src/design-tokens` is the only import a re-skin needs.
export * from '@/src/branding';

/* -------------------------------------------------------------------------- */
/* Typography                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Philips' corporate typeface is Neue Frutiger World, which is licensed and
 * cannot be redistributed with an open-source build. Source Sans 3 (SIL OFL
 * 1.1) is the substitute: a humanist sans in the same lineage as Frutiger with
 * open apertures, a tall x-height and unambiguous figures, which is what
 * matters for patient identifiers and measurements. It is self-hosted through
 * `@fontsource-variable/source-sans-3`, so there is no runtime dependency on a
 * font CDN.
 *
 * To swap in the real typeface, drop the licensed webfonts into `public/fonts`,
 * declare them with `@font-face` in `src/styles/fonts.css`, and change
 * `FontStacks.sans` below to lead with `'Neue Frutiger World'`.
 * Nothing else in the codebase names a font.
 */
export const FontStacks = {
  sans:
    "'Source Sans 3 Variable', 'Source Sans 3', 'Frutiger', " +
    "'Segoe UI', system-ui, -apple-system, sans-serif",
  /** Tabular data: DICOM tags, window/level values, coordinates. */
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

export type TypeStyle = {
  size: string;
  lineHeight: string;
  weight: number;
  letterSpacing: string;
  transform?: string;
};

/**
 * A restrained six-step scale. Clinical chrome does not need display type; the
 * largest step exists only for the empty-state and drag-and-drop prompts.
 */
export const TypeScale = {
  /** Empty states and full-screen prompts only. */
  display: {
    size: '2rem',
    lineHeight: '2.5rem',
    weight: 300,
    letterSpacing: '-0.01em',
  },
  /** Dialog titles. */
  title: {
    size: '1.25rem',
    lineHeight: '1.75rem',
    weight: 600,
    letterSpacing: '0',
  },
  /** Section headings inside panels and dialogs. */
  subtitle: {
    size: '1rem',
    lineHeight: '1.5rem',
    weight: 600,
    letterSpacing: '0',
  },
  /** Default UI text. */
  body: {
    size: '0.875rem',
    lineHeight: '1.375rem',
    weight: 400,
    letterSpacing: '0.005em',
  },
  /** Control labels and buttons. Sentence case, never uppercase. */
  label: {
    size: '0.8125rem',
    lineHeight: '1.25rem',
    weight: 600,
    letterSpacing: '0.01em',
    transform: 'none',
  },
  /** Secondary/metadata text. */
  caption: {
    size: '0.75rem',
    lineHeight: '1.125rem',
    weight: 400,
    letterSpacing: '0.02em',
  },
} as const satisfies Record<string, TypeStyle>;

export type TypeScaleName = keyof typeof TypeScale;

/* -------------------------------------------------------------------------- */
/* Space, radii, elevation                                                     */
/* -------------------------------------------------------------------------- */

/** 4px base grid. Every padding/margin in the chrome should land on it. */
export const Spacing = {
  none: '0px',
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '48px',
} as const;

/** Philips hardware and UI use a soft, small radius; nothing is pill-shaped. */
export const Radius = {
  none: '0px',
  sm: '2px',
  md: '4px',
  lg: '8px',
  xl: '12px',
  circle: '50%',
} as const;

/**
 * Elevation is expressed as shadow only — surfaces do not change tint with
 * elevation, so the chrome stays visually calm next to the image data.
 */
export const Elevation = {
  none: 'none',
  raised: '0 1px 2px rgba(0, 0, 0, 0.28)',
  overlay: '0 4px 12px rgba(0, 0, 0, 0.32)',
  dialog: '0 12px 32px rgba(0, 0, 0, 0.40)',
} as const;

/** Hairlines. Kept as tokens so a designer can thicken the whole chrome. */
export const BorderWidth = {
  hairline: '1px',
  emphasis: '2px',
} as const;

/* -------------------------------------------------------------------------- */
/* Density                                                                     */
/* -------------------------------------------------------------------------- */

export const Densities = ['comfortable', 'compact'] as const;
export type DensityName = (typeof Densities)[number];

/**
 * Default density.
 *
 * Radiology reading is dense work, but the chrome here is *collapsible* — the
 * module panel toggles away entirely and the viewport takes the whole window —
 * so we do not need to buy image area by shrinking controls. `comfortable`
 * keeps hit targets at or above the WCAG 2.2 target-size minimum and matches
 * the Philips design language's generous whitespace. `compact` is one click
 * away in Settings for long reading sessions and small displays.
 */
export const DefaultDensity: DensityName = 'comfortable';

export type DensityTokens = {
  /** Vuetify `density` prop value applied to every component by default. */
  vuetify: 'comfortable' | 'compact';
  /** Square edge of the left tool strip buttons, and thus the strip width. */
  toolButtonSize: string;
  /** Icon edge inside a tool strip button. */
  toolIconSize: string;
  /** Vertical rhythm inside panels and dialogs. */
  stackGap: string;
  /** Inline padding of panels, cards and dialog bodies. */
  inlinePadding: string;
  /** Block padding of panel/dialog sections. */
  blockPadding: string;
  /** Height of a row in the data browser lists. */
  listRowHeight: string;
  /** App bar height. */
  appBarHeight: string;
  /** Module switcher tab height. Must fit an icon stacked over a caption. */
  tabHeight: string;
};

export const Density: Record<DensityName, DensityTokens> = {
  comfortable: {
    vuetify: 'comfortable',
    toolButtonSize: '44px',
    toolIconSize: '22px',
    stackGap: Spacing.md,
    inlinePadding: Spacing.lg,
    blockPadding: Spacing.md,
    listRowHeight: '44px',
    appBarHeight: '52px',
    tabHeight: '52px',
  },
  compact: {
    vuetify: 'compact',
    toolButtonSize: '36px',
    toolIconSize: '18px',
    stackGap: Spacing.sm,
    inlinePadding: Spacing.md,
    blockPadding: Spacing.sm,
    listRowHeight: '34px',
    appBarHeight: '44px',
    tabHeight: '44px',
  },
};

/* -------------------------------------------------------------------------- */
/* Semantic colors                                                             */
/* -------------------------------------------------------------------------- */

export type SemanticPalette = {
  /** Behind everything; the frame the images sit in. */
  background: string;
  /** Panels and cards. */
  surface: string;
  /** Dialogs, menus and the app bar. */
  'surface-raised': string;
  /** Tool strip and viewport gutters: recedes behind the image. */
  'surface-sunken': string;
  'on-background': string;
  'on-surface': string;
  'on-surface-raised': string;
  'on-surface-sunken': string;
  /** Secondary text: labels, metadata, helper copy. */
  'text-muted': string;
  /** Decorative hairline between chrome regions. */
  border: string;
  /** Boundary that carries meaning (inputs, outlined cards): >= 3:1. */
  'border-strong': string;
  /**
   * Vuetify's own surface ramp. Kept aligned with the tokens above so any
   * Vuetify internal that reaches for them stays on-brand.
   */
  'surface-bright': string;
  'surface-light': string;
  /**
   * Vuetify uses this pair for things drawn *on top of* a surface — slider
   * tracks and ticks, switch tracks, flat chips. It therefore has to contrast
   * with the surface, which inverts Material's convention in the dark theme:
   * a variant surface darker than our near-black chrome would be invisible, so
   * the dark theme's is a mid grey with a near-black `on-` pair. Both
   * directions are contrast-tested.
   */
  'surface-variant': string;
  'on-surface-variant': string;
  primary: string;
  'on-primary': string;
  secondary: string;
  'on-secondary': string;
  /**
   * Brand cyan as a *graphic* accent — indicators, focus rings, rules. Never
   * used behind text; see `secondary` for interactive cyan.
   */
  accent: string;
  error: string;
  'on-error': string;
  warning: string;
  'on-warning': string;
  success: string;
  'on-success': string;
  info: string;
  'on-info': string;
  'selection-bg-color': string;
  'selection-border-color': string;
  'on-selection': string;
};

/**
 * The accent-contrast fix.
 *
 * Philips accent cyan `#00A3E0` is beautiful as a graphic mark and hopeless as
 * a text background: white on it measures 2.87:1, so `color="secondary"`
 * buttons read as disabled. Both themes keep cyan, but pair it with a
 * foreground that clears WCAG AA:
 *
 *  - dark theme: the untouched brand cyan with a near-black foreground
 *    (`#001824` on `#00A3E0` = 6.33:1). On a dark UI the bright fill is the
 *    right visual weight anyway.
 *  - light theme: a darkened cyan `#005468`. Unlike the shallower `#00789F`,
 *    this one clears AA in *both* directions — white on it (8.51:1) for filled
 *    buttons, and it-on-surface for the `text`/`tonal` variants Vuetify renders
 *    with the color as the foreground. `tonal` is the binding case: it tints
 *    the fill with the color itself, so the pairing lands lower than on a plain
 *    surface (5.48:1 on the sunken surface rather than 6.58:1).
 *
 * The undarkened `#00A3E0` stays available as `accent` for non-text graphics.
 */
const AccessibleAccent = {
  onDarkFill: BrandColors.accent,
  onDarkForeground: '#001824',
  onLightFill: '#005468',
  onLightForeground: '#FFFFFF',
  /** Cyan tuned to clear 3:1 as a graphic on light surfaces. */
  lightGraphic: '#00789F',
} as const;

/**
 * Philips blue is dark enough that on a dark surface it fails as text. The
 * dark theme therefore uses a one-step lighter tint that clears AA against the
 * darkest chrome surface (4.55:1 on the dialog surface).
 */
const AccessiblePrimary = {
  dark: '#4A8BE6',
  onDark: '#06152B',
  light: BrandColors.primary,
  onLight: '#FFFFFF',
} as const;

export const DarkPalette: SemanticPalette = {
  background: '#0B0E12',
  surface: '#161A21',
  'surface-raised': '#1F242C',
  'surface-sunken': '#070A0D',
  'on-background': '#E6EAF0',
  'on-surface': '#E6EAF0',
  'on-surface-raised': '#E6EAF0',
  'on-surface-sunken': '#E6EAF0',
  'text-muted': '#A7B1BF',
  border: '#2A313B',
  'border-strong': '#626F80',
  'surface-bright': '#1F242C',
  'surface-light': '#252B34',
  'surface-variant': '#8A94A3',
  'on-surface-variant': '#10151C',
  primary: AccessiblePrimary.dark,
  'on-primary': AccessiblePrimary.onDark,
  secondary: AccessibleAccent.onDarkFill,
  'on-secondary': AccessibleAccent.onDarkForeground,
  accent: BrandColors.accent,
  error: '#FF7B7B',
  'on-error': '#2B0505',
  warning: '#FFB74D',
  'on-warning': '#2B1A00',
  success: '#66D19E',
  'on-success': '#042516',
  info: '#69B7F5',
  'on-info': '#04182B',
  'selection-bg-color': BrandColors.selectionDark,
  'selection-border-color': AccessiblePrimary.dark,
  'on-selection': '#EAF1FC',
};

export const LightPalette: SemanticPalette = {
  background: '#E9EEF4',
  surface: '#F7F9FC',
  'surface-raised': '#FFFFFF',
  'surface-sunken': '#DCE3EB',
  'on-background': '#10151C',
  'on-surface': '#10151C',
  'on-surface-raised': '#10151C',
  'on-surface-sunken': '#10151C',
  'text-muted': '#4A5563',
  border: '#C9D2DC',
  'border-strong': '#6B7A8A',
  'surface-bright': '#FFFFFF',
  'surface-light': '#EFF3F8',
  'surface-variant': '#5A6572',
  'on-surface-variant': '#FFFFFF',
  primary: AccessiblePrimary.light,
  'on-primary': AccessiblePrimary.onLight,
  secondary: AccessibleAccent.onLightFill,
  'on-secondary': AccessibleAccent.onLightForeground,
  accent: AccessibleAccent.lightGraphic,
  error: '#B3261E',
  'on-error': '#FFFFFF',
  warning: '#8A5300',
  'on-warning': '#FFFFFF',
  success: '#0F6B45',
  'on-success': '#FFFFFF',
  info: '#0B5ED7',
  'on-info': '#FFFFFF',
  'selection-bg-color': BrandColors.selectionLight,
  'selection-border-color': AccessiblePrimary.light,
  'on-selection': '#0B1B33',
};

export const Palettes = {
  dark: DarkPalette,
  light: LightPalette,
} as const;

/* -------------------------------------------------------------------------- */
/* CSS custom properties                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Theme-independent tokens, emitted on `:root` as `--pv-*` custom properties
 * so plain CSS files can consume the same scale the TypeScript does.
 */
export function baseCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {
    '--pv-font-family': FontStacks.sans,
    '--pv-font-family-mono': FontStacks.mono,
  };

  (Object.keys(TypeScale) as TypeScaleName[]).forEach((name) => {
    const style: TypeStyle = TypeScale[name];
    vars[`--pv-font-size-${name}`] = style.size;
    vars[`--pv-line-height-${name}`] = style.lineHeight;
    vars[`--pv-font-weight-${name}`] = String(style.weight);
    vars[`--pv-letter-spacing-${name}`] = style.letterSpacing;
    if (style.transform) {
      vars[`--pv-text-transform-${name}`] = style.transform;
    }
  });

  Object.entries(Spacing).forEach(([name, value]) => {
    vars[`--pv-space-${name}`] = value;
  });
  Object.entries(Radius).forEach(([name, value]) => {
    vars[`--pv-radius-${name}`] = value;
  });
  Object.entries(Elevation).forEach(([name, value]) => {
    vars[`--pv-elevation-${name}`] = value;
  });
  Object.entries(BorderWidth).forEach(([name, value]) => {
    vars[`--pv-border-width-${name}`] = value;
  });

  return vars;
}

/** Density-dependent tokens, re-emitted whenever the density token changes. */
export function densityCssVariables(
  density: DensityName
): Record<string, string> {
  const tokens = Density[density];
  return {
    '--pv-density-tool-button-size': tokens.toolButtonSize,
    '--pv-density-tool-icon-size': tokens.toolIconSize,
    '--pv-density-stack-gap': tokens.stackGap,
    '--pv-density-inline-padding': tokens.inlinePadding,
    '--pv-density-block-padding': tokens.blockPadding,
    '--pv-density-list-row-height': tokens.listRowHeight,
    '--pv-density-app-bar-height': tokens.appBarHeight,
    '--pv-density-tab-height': tokens.tabHeight,
  };
}
