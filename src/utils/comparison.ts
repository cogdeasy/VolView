import { vec3 } from 'gl-matrix';
import type { Vector3 } from '@kitware/vtk.js/types';
import type { ImageMetadata } from '@/src/types/image';
import type { LPSAxis } from '@/src/types/lps';
import { clampValue } from '@/src/utils';

/**
 * Index of the patient-coordinate (LPS world) component that each anatomical
 * axis slides along.
 */
const WORLD_COMPONENT: Record<LPSAxis, number> = {
  Sagittal: 0,
  Coronal: 1,
  Axial: 2,
};

/** Direction cosines are considered equal below this dot-product deviation. */
const ORIENTATION_TOLERANCE = 1e-2;

/**
 * How the reader's slice cursor is carried from one study to the other.
 *
 * - `physical`: by patient coordinate, so a lesion stays put even when the two
 *   studies have different slice thicknesses or extents.
 * - `index`: by normalized slice index, the fallback used when the two studies
 *   do not share a comparable frame of reference.
 */
export type AlignmentMode = 'physical' | 'index';

export interface AlignmentAssessment {
  mode: AlignmentMode;
  /** Human-readable justification, shown in the UI. */
  reason: string;
}

const isDegenerate = (metadata: ImageMetadata, axis: LPSAxis) =>
  metadata.dimensions[metadata.lpsOrientation[axis]] <= 1;

/**
 * Patient-coordinate position of a slice along the given anatomical axis.
 */
export function sliceToPhysicalPosition(
  metadata: ImageMetadata,
  axis: LPSAxis,
  slice: number
): number {
  const indexPoint: Vector3 = [0, 0, 0];
  indexPoint[metadata.lpsOrientation[axis]] = slice;
  vec3.transformMat4(indexPoint, indexPoint, metadata.indexToWorld);
  return indexPoint[WORLD_COMPONENT[axis]];
}

/**
 * Signed patient-coordinate distance between two adjacent slices.
 */
export function slicePitch(metadata: ImageMetadata, axis: LPSAxis): number {
  return (
    sliceToPhysicalPosition(metadata, axis, 1) -
    sliceToPhysicalPosition(metadata, axis, 0)
  );
}

export function maxSlice(metadata: ImageMetadata, axis: LPSAxis): number {
  return Math.max(0, metadata.dimensions[metadata.lpsOrientation[axis]] - 1);
}

/**
 * Nearest slice to a patient-coordinate position, clamped to the volume.
 */
export function physicalPositionToSlice(
  metadata: ImageMetadata,
  axis: LPSAxis,
  position: number
): number {
  const pitch = slicePitch(metadata, axis);
  if (Math.abs(pitch) < Number.EPSILON) return 0;
  const origin = sliceToPhysicalPosition(metadata, axis, 0);
  const slice = Math.round((position - origin) / pitch);
  return clampValue(slice, 0, maxSlice(metadata, axis));
}

/**
 * Patient-coordinate span covered by a volume along an axis, low value first.
 */
export function physicalRange(
  metadata: ImageMetadata,
  axis: LPSAxis
): [number, number] {
  const a = sliceToPhysicalPosition(metadata, axis, 0);
  const b = sliceToPhysicalPosition(metadata, axis, maxSlice(metadata, axis));
  return a <= b ? [a, b] : [b, a];
}

/**
 * Decides whether two studies can be scrolled together by patient coordinate.
 *
 * Registration is out of scope, so the only honest way to link by physical
 * position is when both volumes already describe the same patient space: the
 * same direction cosines and an overlapping extent along the scroll axis.
 */
export function assessAlignment(
  current: ImageMetadata,
  prior: ImageMetadata,
  axis: LPSAxis
): AlignmentAssessment {
  if (isDegenerate(current, axis) || isDegenerate(prior, axis)) {
    return {
      mode: 'index',
      reason: 'One of the studies is a single slice along this axis.',
    };
  }

  const orientationsMatch = current.orientation.every(
    (value, i) =>
      Math.abs(value - prior.orientation[i]) <= ORIENTATION_TOLERANCE
  );
  if (!orientationsMatch) {
    return {
      mode: 'index',
      reason:
        'The studies were acquired with different image orientations, so ' +
        'patient coordinates are not comparable.',
    };
  }

  const [currentLow, currentHigh] = physicalRange(current, axis);
  const [priorLow, priorHigh] = physicalRange(prior, axis);
  const overlap =
    Math.min(currentHigh, priorHigh) - Math.max(currentLow, priorLow);
  if (overlap <= 0) {
    return {
      mode: 'index',
      reason:
        'The studies cover no overlapping anatomy in patient coordinates.',
    };
  }

  return {
    mode: 'physical',
    reason: 'The studies share a comparable frame of reference.',
  };
}

interface SliceMapping {
  from: ImageMetadata;
  to: ImageMetadata;
  axis: LPSAxis;
  slice: number;
  mode: AlignmentMode;
}

function mapSlice({ from, to, axis, slice, mode }: SliceMapping): number {
  if (mode === 'physical') {
    return physicalPositionToSlice(
      to,
      axis,
      sliceToPhysicalPosition(from, axis, slice)
    );
  }

  const fromMax = maxSlice(from, axis);
  const toMax = maxSlice(to, axis);
  if (fromMax === 0) return 0;
  return clampValue(Math.round((slice / fromMax) * toMax), 0, toMax);
}

/**
 * Slice of the prior study that shows the same anatomy as `currentSlice`.
 *
 * `offset` is the reader's manual nudge, expressed in prior-study slices.
 */
export function currentSliceToPriorSlice(
  current: ImageMetadata,
  prior: ImageMetadata,
  axis: LPSAxis,
  currentSlice: number,
  mode: AlignmentMode,
  offset = 0
): number {
  const mapped = mapSlice({
    from: current,
    to: prior,
    axis,
    slice: currentSlice,
    mode,
  });
  return clampValue(mapped + offset, 0, maxSlice(prior, axis));
}

/**
 * Inverse of {@link currentSliceToPriorSlice}, so scrolling either pane keeps
 * the pair anatomically aligned.
 */
export function priorSliceToCurrentSlice(
  current: ImageMetadata,
  prior: ImageMetadata,
  axis: LPSAxis,
  priorSlice: number,
  mode: AlignmentMode,
  offset = 0
): number {
  const unnudged = clampValue(priorSlice - offset, 0, maxSlice(prior, axis));
  return mapSlice({
    from: prior,
    to: current,
    axis,
    slice: unnudged,
    mode,
  });
}

/**
 * Patient-coordinate shift the manual nudge represents on the prior study,
 * used to move a counterpart annotation with the reader's correction.
 */
export function offsetToPhysicalShift(
  prior: ImageMetadata,
  axis: LPSAxis,
  offset: number
): number {
  return offset * slicePitch(prior, axis);
}

/**
 * Copies the two in-plane components of `source` onto `target`, leaving the
 * component along the view normal untouched. Used to carry pan and zoom
 * between studies without disturbing each pane's own slice plane.
 */
export function copyInPlaneComponents(
  source: ArrayLike<number>,
  target: ArrayLike<number>,
  axis: LPSAxis
): Vector3 {
  const normal = WORLD_COMPONENT[axis];
  const result: Vector3 = [target[0], target[1], target[2]];
  for (let i = 0; i < 3; i += 1) {
    if (i !== normal) result[i] = source[i];
  }
  return result;
}

/**
 * Moves a world point onto a slice plane, keeping its in-plane position.
 */
export function placeOnSlicePlane(
  point: ArrayLike<number>,
  axis: LPSAxis,
  planePosition: number
): Vector3 {
  const result: Vector3 = [point[0], point[1], point[2]];
  result[WORLD_COMPONENT[axis]] = planePosition;
  return result;
}

/** Parses a DICOM DA value (YYYYMMDD). */
export function parseDicomDate(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/[-.]/g, '');
  if (!/^\d{8}$/.test(trimmed)) return null;
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(4, 6));
  const day = Number(trimmed.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Formats a DICOM DA value the way a radiologist reads it. */
export function formatDicomDate(value: string | undefined): string | null {
  const date = parseDicomDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "6 months earlier" style description of how far a study sits from the
 * current one. Returns null when either study date is unknown.
 */
export function formatStudyInterval(
  currentDate: string | undefined,
  priorDate: string | undefined
): string | null {
  const current = parseDicomDate(currentDate);
  const prior = parseDicomDate(priorDate);
  if (!current || !prior) return null;

  const days = Math.round((current.getTime() - prior.getTime()) / DAY_MS);
  const magnitude = Math.abs(days);
  if (magnitude === 0) return 'same day';

  const direction = days > 0 ? 'earlier' : 'later';
  const plural = (count: number, unit: string) =>
    `${count} ${unit}${count === 1 ? '' : 's'} ${direction}`;

  if (magnitude < 14) return plural(magnitude, 'day');
  if (magnitude < 60) return plural(Math.round(magnitude / 7), 'week');
  if (magnitude < 730) return plural(Math.round(magnitude / 30.44), 'month');
  return plural(Math.round(magnitude / 365.25), 'year');
}
