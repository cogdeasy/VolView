/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Used to assert in unit tests that every text/background pair in the Philips
 * chrome clears AA, so a token change that breaks accessibility fails CI
 * rather than shipping.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;
export const WCAG_AA_NON_TEXT = 3;

export type Rgb = { r: number; g: number; b: number };

/** Parses `#rgb`, `#rrggbb` and `#rrggbbaa` (alpha ignored). */
export function parseHexColor(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, '');
  const expanded =
    value.length === 3 || value.length === 4
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(expanded)) {
    throw new Error(`Not a hex color: ${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === 'string' ? parseHexColor(color) : color;
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** Contrast ratio between two opaque colors, in the range [1, 21]. */
export function contrastRatio(
  foreground: string | Rgb,
  background: string | Rgb
): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast ratio rounded to two decimals, for reporting. */
export function contrastRatioRounded(
  foreground: string | Rgb,
  background: string | Rgb
): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}

export function meetsContrast(
  foreground: string | Rgb,
  background: string | Rgb,
  threshold: number = WCAG_AA_TEXT
): boolean {
  return contrastRatio(foreground, background) >= threshold;
}
