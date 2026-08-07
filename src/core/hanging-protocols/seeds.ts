import type { HangingProtocol } from '@/src/core/hanging-protocols/types';

/**
 * Protocols shipped with the product. They are seeded into local storage on
 * first run, after which the reader's own copies are authoritative; the
 * manager can restore these at any time.
 *
 * Precedence is list order: the narrower head/neck angiography protocol is
 * evaluated before the general head CT so a CTA does not hang on a brain
 * window.
 */
export const BUILT_IN_PROTOCOLS: ReadonlyArray<HangingProtocol> = [
  {
    id: 'builtin-cta-head-neck',
    name: 'CTA Head and Neck',
    description:
      'Angiographic window with a large volume view for vessel review.',
    builtIn: true,
    enabled: true,
    layout: {
      direction: 'row',
      items: [
        { type: '3D', name: 'Volume', viewDirection: 'Posterior' },
        {
          direction: 'column',
          items: [
            { type: '2D', orientation: 'Axial' },
            { type: '2D', orientation: 'Coronal' },
          ],
        },
      ],
    },
    windowLevel: { kind: 'preset', preset: 'ct-angio' },
    volume: { preset: 'CT-Coronary-Arteries-3', opacityShift: 0 },
    slicePolicy: 'middle',
    overlays: { viewLabels: true, annotations: true },
    focusedModule: 'Rendering',
    match: {
      modality: ['CT'],
      studyDescription: 'cta|angio|head\\s*and\\s*neck|carotid',
    },
  },
  {
    id: 'builtin-head-ct',
    name: 'Head CT',
    description:
      'Brain window on a large axial view with coronal and sagittal reference.',
    builtIn: true,
    enabled: true,
    layout: {
      direction: 'row',
      items: [
        { type: '2D', orientation: 'Axial' },
        {
          direction: 'column',
          items: [
            { type: '2D', orientation: 'Coronal' },
            { type: '2D', orientation: 'Sagittal' },
          ],
        },
      ],
    },
    windowLevel: { kind: 'preset', preset: 'ct-brain' },
    volume: { preset: 'CT-Bone', opacityShift: 0 },
    slicePolicy: 'middle',
    overlays: { viewLabels: true, annotations: true },
    focusedModule: 'Annotations',
    match: {
      modality: ['CT'],
      bodyPart: ['HEAD', 'BRAIN', 'SKULL'],
      studyDescription: 'head|brain|skull',
    },
  },
  {
    id: 'builtin-neck-ct',
    name: 'Neck CT with Contrast',
    description:
      'Soft tissue neck window with coronal and sagittal reference for nodes ' +
      'and airway.',
    builtIn: true,
    enabled: true,
    layout: {
      direction: 'row',
      items: [
        { type: '2D', orientation: 'Axial' },
        {
          direction: 'column',
          items: [
            { type: '2D', orientation: 'Coronal' },
            { type: '2D', orientation: 'Sagittal' },
          ],
        },
      ],
    },
    windowLevel: { kind: 'preset', preset: 'ct-soft-tissue' },
    volume: { preset: 'CT-AAA', opacityShift: 0 },
    slicePolicy: 'middle',
    overlays: { viewLabels: true, annotations: true },
    focusedModule: 'Annotations',
    match: {
      modality: ['CT'],
      bodyPart: ['NECK', 'THYROID', 'LARYNX'],
      studyDescription: 'neck|soft\\s*tissue|thyroid|larynx',
    },
  },
  {
    id: 'builtin-chest-ct',
    name: 'Chest CT',
    description: 'Lung window, axial-dominant, annotations ready for nodules.',
    builtIn: true,
    enabled: true,
    layout: {
      direction: 'row',
      items: [
        { type: '2D', orientation: 'Axial' },
        { type: '2D', orientation: 'Coronal' },
      ],
    },
    windowLevel: { kind: 'preset', preset: 'ct-lung' },
    volume: { preset: 'CT-Chest-Vessels', opacityShift: 0 },
    slicePolicy: 'middle',
    overlays: { viewLabels: true, annotations: true },
    focusedModule: 'Annotations',
    match: {
      modality: ['CT'],
      bodyPart: ['CHEST', 'THORAX', 'LUNG'],
      studyDescription: 'chest|thorax|lung|pulmonary',
    },
  },
  {
    id: 'builtin-cardiac-mr',
    name: 'Cardiac MR',
    description:
      'Four-up cardiac review; MR has no Hounsfield scale, so the window ' +
      'follows the histogram rather than a fixed preset.',
    builtIn: true,
    enabled: true,
    layout: [
      ['axial', 'coronal'],
      ['sagittal', 'volume'],
    ],
    windowLevel: { kind: 'auto', auto: 'MediumContrast' },
    volume: { preset: 'MR-Default', opacityShift: 0 },
    slicePolicy: 'middle',
    overlays: { viewLabels: true, annotations: true },
    focusedModule: 'Data',
    match: {
      modality: ['MR'],
      studyDescription: 'cardiac|heart|cine',
    },
  },
];
