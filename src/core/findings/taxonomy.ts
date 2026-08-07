import type {
  FindingCategoryScale,
  FindingType,
  Laterality,
} from '@/src/types/finding';

/**
 * A deliberately small starter taxonomy. It is editable at runtime (see the
 * findings store), so this is a set of sensible defaults rather than a
 * controlled terminology — a real deployment would bind these entries to
 * RadLex/SNOMED codes.
 */
export const BUILTIN_FINDING_TYPES: FindingType[] = [
  {
    id: 'mass',
    label: 'Mass / Lesion',
    modalities: [],
    defaultBodySite: '',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'nodule',
    label: 'Nodule',
    modalities: ['CT', 'MR', 'PT'],
    defaultBodySite: 'Lung',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'cyst',
    label: 'Cyst',
    modalities: [],
    defaultBodySite: '',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'stenosis',
    label: 'Stenosis',
    modalities: ['CT', 'MR', 'XA', 'US'],
    defaultBodySite: 'Carotid artery',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'aneurysm',
    label: 'Aneurysm',
    modalities: ['CT', 'MR', 'XA'],
    defaultBodySite: 'Cerebral artery',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'calcification',
    label: 'Calcification',
    modalities: ['CT', 'MG', 'XA'],
    defaultBodySite: '',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'effusion',
    label: 'Effusion',
    modalities: ['CT', 'MR', 'US'],
    defaultBodySite: 'Pleural space',
    categoryScale: 'severity',
    builtin: true,
  },
  {
    id: 'chamber-measurement',
    label: 'Chamber measurement',
    modalities: ['MR', 'US'],
    defaultBodySite: 'Left ventricle',
    categoryScale: 'none',
    builtin: true,
  },
  {
    id: 'breast-lesion',
    label: 'Breast lesion',
    modalities: ['MG', 'US', 'MR'],
    defaultBodySite: 'Breast',
    categoryScale: 'birads',
    builtin: true,
  },
];

export const SEVERITY_CATEGORIES = [
  'Normal',
  'Mild',
  'Moderate',
  'Severe',
  'Critical',
];

export const BIRADS_CATEGORIES = [
  '0 — Incomplete',
  '1 — Negative',
  '2 — Benign',
  '3 — Probably benign',
  '4 — Suspicious',
  '5 — Highly suggestive of malignancy',
  '6 — Known biopsy-proven malignancy',
];

export function categoriesForScale(scale: FindingCategoryScale): string[] {
  if (scale === 'severity') return SEVERITY_CATEGORIES;
  if (scale === 'birads') return BIRADS_CATEGORIES;
  return [];
}

export const CATEGORY_SCALE_LABELS: Record<FindingCategoryScale, string> = {
  severity: 'Severity',
  birads: 'BI-RADS',
  none: 'Category',
};

/**
 * Types offered for a modality: those that name it, then the modality-agnostic
 * ones. An unknown modality gets the whole taxonomy rather than nothing.
 */
export function typesForModality(
  types: FindingType[],
  modality: string | undefined
): FindingType[] {
  const code = (modality ?? '').trim().toUpperCase();
  if (!code) return types;
  const specific = types.filter((type) =>
    type.modalities.some((m) => m.toUpperCase() === code)
  );
  const generic = types.filter((type) => type.modalities.length === 0);
  const offered = [...specific, ...generic];
  return offered.length > 0 ? offered : types;
}

/** Suggestions only — the body site field stays free text. */
export const COMMON_BODY_SITES = [
  'Aorta',
  'Brain',
  'Breast',
  'Carotid artery',
  'Cerebral artery',
  'Kidney',
  'Left atrium',
  'Left ventricle',
  'Liver',
  'Lung',
  'Lymph node',
  'Pleural space',
  'Right ventricle',
  'Spleen',
  'Thyroid',
];

export const LATERALITY_LABELS: Record<Laterality, string> = {
  left: 'Left',
  right: 'Right',
  midline: 'Midline',
  unknown: 'Not specified',
};
