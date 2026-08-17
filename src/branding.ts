/**
 * Single source of truth for product branding.
 *
 * Every user-visible name, link and brand color is read from here so the
 * application can be re-skinned by editing this file alone.
 */

export const BrandColors = {
  /** GSK Orange */
  primary: '#F36633',
  primaryDark: '#D9531F',
  primaryLight: '#F9A31B',
  accent: '#FA7819',
  /** Lockup color on dark surfaces, where the brand orange does not read. */
  onDark: '#FFFFFF',
  selectionDark: '#8A3B12',
  selectionLight: '#FCE0CE',
} as const;

export const Brand = {
  company: 'GSK',
  companyLegalName: 'GSK plc',
  productName: 'GSK Volume Viewer',
  /** Product name without the company prefix, for use next to the wordmark. */
  productShortName: 'Volume Viewer',
  tagline: 'Ahead together',
  description:
    'GSK Volume Viewer is a browser-based radiological viewer for ' +
    'interactive, cinematic 3D visualization and annotation of DICOM data.',
  urls: {
    company: 'https://www.gsk.com',
    healthcare: 'https://www.gsk.com/en-gb/research-and-development/',
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
