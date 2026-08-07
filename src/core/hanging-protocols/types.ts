import { z } from 'zod';
import { layoutConfig } from '@/src/utils/layoutParsing';
import { WLAutoRanges } from '@/src/constants';

/**
 * A hanging protocol is a named, user-authored recipe for how a study should
 * be presented the moment it opens: the layout and its per-view orientations,
 * the window/level, the volume rendering preset, where the slices start and
 * which chrome is visible.
 */

export const autoRangeKey = z.enum(
  Object.keys(WLAutoRanges) as [string, ...string[]]
);

/**
 * How the protocol decides on a window/level.
 *
 * - `preset`: a named clinical preset (see windowPresets.ts).
 * - `manual`: explicit width/level, e.g. captured from the current view.
 * - `auto`: one of the histogram-percentile auto ranges.
 * - `dicom`: defer to the window values in the DICOM header.
 */
export const windowLevelSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), preset: z.string() }),
  z.object({
    kind: z.literal('manual'),
    width: z.number(),
    level: z.number(),
  }),
  z.object({ kind: z.literal('auto'), auto: autoRangeKey }),
  z.object({ kind: z.literal('dicom') }),
]);

export const volumeSpec = z.object({
  /** vtk.js color transfer function preset name. */
  preset: z.string(),
  /** Opacity/transfer-function shift, as used by the rendering module. */
  opacityShift: z.number(),
});

/** Where the 2D views land when the study opens. */
export const slicePolicy = z.enum(['first', 'middle', 'preserve']);

export const overlaysSpec = z.object({
  /** Corner text: patient/series name, orientation labels, slice and W/L. */
  viewLabels: z.boolean(),
  /** Measurement and annotation widgets. */
  annotations: z.boolean(),
});

export const focusedModule = z.enum(['Data', 'Annotations', 'Rendering']);

/**
 * DICOM attributes a protocol matches on. Every populated rule must hold for
 * the protocol to match; an empty rule set matches nothing (so a protocol is
 * only ever applied automatically when the author asked for it).
 */
export const matchRules = z.object({
  modality: z.array(z.string()).optional(),
  bodyPart: z.array(z.string()).optional(),
  /** Case-insensitive regular expression against StudyDescription. */
  studyDescription: z.string().optional(),
  /** Case-insensitive regular expression against SeriesDescription. */
  seriesDescription: z.string().optional(),
  minSeriesCount: z.number().int().nonnegative().optional(),
  maxSeriesCount: z.number().int().nonnegative().optional(),
});

export const hangingProtocol = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  /** Shipped with the product. Editable, but restorable. */
  builtIn: z.boolean(),
  enabled: z.boolean(),
  layout: layoutConfig,
  windowLevel: windowLevelSpec,
  volume: volumeSpec,
  slicePolicy,
  overlays: overlaysSpec,
  focusedModule,
  match: matchRules,
});

export const HANGING_PROTOCOL_FILE_VERSION = 1;

export const hangingProtocolFile = z.object({
  kind: z.literal('philips-volume-viewer-hanging-protocols'),
  version: z.literal(HANGING_PROTOCOL_FILE_VERSION),
  protocols: z.array(hangingProtocol),
});

export type AutoRangeKey = keyof typeof WLAutoRanges;
export type WindowLevelSpec = z.infer<typeof windowLevelSpec>;
export type VolumeSpec = z.infer<typeof volumeSpec>;
export type SlicePolicy = z.infer<typeof slicePolicy>;
export type OverlaysSpec = z.infer<typeof overlaysSpec>;
export type FocusedModule = z.infer<typeof focusedModule>;
export type MatchRules = z.infer<typeof matchRules>;
export type HangingProtocol = z.infer<typeof hangingProtocol>;
export type HangingProtocolFile = z.infer<typeof hangingProtocolFile>;

/** The DICOM attributes a protocol is matched against. */
export interface StudyContext {
  modality: string;
  bodyPart: string;
  studyDescription: string;
  seriesDescription: string;
  seriesCount: number;
}

export const emptyStudyContext = (): StudyContext => ({
  modality: '',
  bodyPart: '',
  studyDescription: '',
  seriesDescription: '',
  seriesCount: 0,
});
