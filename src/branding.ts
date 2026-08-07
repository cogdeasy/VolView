/**
 * Single source of truth for product branding.
 *
 * Every user-visible name, link and brand color is read from here so the
 * application can be re-skinned by editing this file alone.
 */

export const BrandColors = {
  /** Philips Blue (Pantone 2175 C) */
  primary: '#0B5ED7',
  primaryDark: '#0A4FB4',
  primaryLight: '#3D82E3',
  accent: '#00A3E0',
  /** Lockup color on dark surfaces, where the brand blue does not read. */
  onDark: '#FFFFFF',
  selectionDark: '#0A3F8F',
  selectionLight: '#CFE0FA',
  /**
   * Study-comparison pane accents. The current study carries the accent cyan
   * so the reader's eye lands on it first; the prior study is deliberately
   * neutral so it never competes with the live read.
   */
  currentStudy: '#00A3E0',
  priorStudy: '#8A94A6',
  /**
   * A pane holding a study that is on neither side of the pair. Dimmer than
   * either role, so it reads as standing outside the comparison rather than
   * as the prior study it would otherwise be coloured like.
   */
  unpairedStudy: '#6E7787',
  /**
   * Chrome drawn over image data. The scrim keeps text legible on any
   * anatomy without lifting the black point of the viewport, and advisory
   * text is warm enough to read as a caveat rather than an error.
   */
  overlayScrim: 'rgba(0, 0, 0, 0.72)',
  onOverlay: '#E8ECF2',
  overlayCaution: '#FFCC80',
} as const;

export const Brand = {
  company: 'Philips',
  companyLegalName: 'Koninklijke Philips N.V.',
  productName: 'Philips Volume Viewer',
  /** Product name without the company prefix, for use next to the wordmark. */
  productShortName: 'Volume Viewer',
  tagline: 'Innovation and you',
  description:
    'Philips Volume Viewer is a browser-based radiological viewer for ' +
    'interactive, cinematic 3D visualization and annotation of DICOM data.',
  urls: {
    company: 'https://www.philips.com',
    healthcare: 'https://www.philips.com/healthcare',
    sourceCode: 'https://github.com/cogdeasy/VolView',
    issues: 'https://github.com/cogdeasy/VolView/issues',
    documentation: 'https://cogdeasy.github.io/VolView',
    serverDocumentation: 'https://cogdeasy.github.io/VolView/server.html',
  },
  colors: BrandColors,
} as const;

/** Copyright line shown in the about dialog. */
export const copyright = () =>
  `© ${new Date().getFullYear()} ${Brand.companyLegalName}. All rights reserved.`;
