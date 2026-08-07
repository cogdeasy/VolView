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
 * A slice step has to cover this share of a voxel for the slice plane to be
 * identifiable by where it sits.
 */
const MIN_PITCH_FRACTION = 0.1;

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
 * Unit patient-space direction the volume's slices advance in for the given
 * anatomical axis, pointing the way that axis' patient coordinate grows.
 *
 * A tilted acquisition — gantry tilt on a head CT is the everyday one — slides
 * its slices along a direction that is not one of the patient axes, so a slice
 * plane is identified by how far it sits along this normal rather than by any
 * single patient coordinate.
 */
export function sliceNormal(metadata: ImageMetadata, axis: LPSAxis): Vector3 {
  const component = WORLD_COMPONENT[axis];
  const origin: Vector3 = [0, 0, 0];
  const step: Vector3 = [0, 0, 0];
  step[metadata.lpsOrientation[axis]] = 1;
  vec3.transformMat4(origin, origin, metadata.indexToWorld);
  vec3.transformMat4(step, step, metadata.indexToWorld);
  vec3.subtract(step, step, origin);
  if (vec3.length(step) < Number.EPSILON) {
    const fallback: Vector3 = [0, 0, 0];
    fallback[component] = 1;
    return fallback;
  }
  vec3.normalize(step, step);
  // Anchored to the anatomical direction rather than to index order, so the
  // coordinate means the same thing for two studies acquired head-first and
  // feet-first.
  return step[component] < 0 ? (vec3.negate(step, step) as Vector3) : step;
}

/**
 * Patient-coordinate position of a slice along the given anatomical axis:
 * signed distance along the slice normal, so it identifies the slice plane
 * whatever the volume's tilt.
 */
export function sliceToPhysicalPosition(
  metadata: ImageMetadata,
  axis: LPSAxis,
  slice: number
): number {
  const indexPoint: Vector3 = [0, 0, 0];
  indexPoint[metadata.lpsOrientation[axis]] = slice;
  vec3.transformMat4(indexPoint, indexPoint, metadata.indexToWorld);
  return dot(indexPoint, sliceNormal(metadata, axis));
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

  // Tilt is handled exactly, by measuring along the slice normal. A volume
  // whose slices barely advance at all is another matter: no position can
  // tell them apart.
  const degeneratePitch = [current, prior].some((metadata) => {
    const spacing = metadata.spacing[metadata.lpsOrientation[axis]];
    return (
      Math.abs(slicePitch(metadata, axis)) <
      Math.abs(spacing) * MIN_PITCH_FRACTION
    );
  });
  if (degeneratePitch) {
    return {
      mode: 'index',
      reason:
        'Consecutive slices in one of the studies cover no patient distance, ' +
        'so a position cannot identify them.',
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
 *
 * Only a true inverse away from the ends of the prior volume: a nudge pushes
 * the mapped slice past the last one, and both directions clamp, so with an
 * offset of +3 the prior's slice 0 maps back to the current's 0 while that
 * maps forward to prior 3 again. The pair settles there because the caller
 * discards the echo of its own write rather than because the round trip is
 * exact.
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
 * Moves a world point onto a slice plane, keeping its in-plane position.
 */
export function placeOnSlicePlane(
  point: ArrayLike<number>,
  normal: Vector3,
  planePosition: number
): Vector3 {
  const shift = planePosition - dot(point, normal);
  return [
    point[0] + shift * normal[0],
    point[1] + shift * normal[1],
    point[2] + shift * normal[2],
  ];
}

/**
 * Takes `source`'s position within the slice plane while keeping `target`'s
 * own plane. Used to carry pan and zoom between studies without disturbing
 * each pane's slice.
 */
export function copyInPlaneComponents(
  source: ArrayLike<number>,
  target: ArrayLike<number>,
  normal: Vector3
): Vector3 {
  return placeOnSlicePlane(source, normal, dot(target, normal));
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
  // Date.UTC rolls a nonsensical date over rather than rejecting it, and a
  // confidently wrong study interval is worse than an unknown one.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
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
  // Switched on the figure that would be printed rather than on the day count
  // behind it: a prior two days short of two years rounds to twenty-four
  // months, and no one reads a prior that way.
  const months = Math.round(magnitude / 30.44);
  if (months < 24) return plural(months, 'month');
  return plural(Math.round(magnitude / 365.25), 'year');
}
