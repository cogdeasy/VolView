import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Maybe } from '@/src/types';

/**
 * Largest scalar value on a single IJK slice of an image.
 *
 * This is the oracle that separates "the renderer is broken" from "this slice
 * is genuinely black": a blank canvas only means something is wrong if the
 * data says pixels should be visible.
 */
export function maxScalarOnSlice(
  imageData: vtkImageData,
  ijkAxis: number,
  sliceIndex: number
): Maybe<number> {
  const scalars = imageData.getPointData().getScalars();
  if (!scalars) return null;

  const data = scalars.getData() as
    | Float32Array
    | Float64Array
    | Int16Array
    | Uint16Array
    | Uint8Array
    | undefined;
  if (!data || !data.length) return null;

  const dims = imageData.getDimensions();
  if (ijkAxis < 0 || ijkAxis > 2) return null;
  if (sliceIndex < 0 || sliceIndex >= dims[ijkAxis]) return null;

  const comps = scalars.getNumberOfComponents();
  const [dimI, dimJ] = dims;
  const strides = [comps, dimI * comps, dimI * dimJ * comps];

  // Walk the two in-plane axes of the requested slice.
  const planeAxes = [0, 1, 2].filter((a) => a !== ijkAxis);
  const [axisA, axisB] = planeAxes;
  const base = sliceIndex * strides[ijkAxis];

  let max = -Infinity;
  for (let b = 0; b < dims[axisB]; b++) {
    const rowOffset = base + b * strides[axisB];
    for (let a = 0; a < dims[axisA]; a++) {
      const offset = rowOffset + a * strides[axisA];
      for (let c = 0; c < comps; c++) {
        const value = data[offset + c];
        if (value > max) max = value;
      }
    }
  }

  return Number.isFinite(max) ? max : null;
}

const sliceMaxCache = new Map<string, number>();

function cacheKey(
  imageId: string,
  mtime: number,
  ijkAxis: number,
  sliceIndex: number
) {
  return `${imageId}:${mtime}:${ijkAxis}:${sliceIndex}`;
}

export function cachedMaxScalarOnSlice(
  imageId: string,
  imageData: vtkImageData,
  ijkAxis: number,
  sliceIndex: number
): Maybe<number> {
  const key = cacheKey(imageId, imageData.getMTime(), ijkAxis, sliceIndex);
  const cached = sliceMaxCache.get(key);
  if (cached !== undefined) return cached;

  const max = maxScalarOnSlice(imageData, ijkAxis, sliceIndex);
  if (max == null) return null;

  // Bound the cache; slice maxima are cheap to recompute.
  if (sliceMaxCache.size > 4096) sliceMaxCache.clear();
  sliceMaxCache.set(key, max);
  return max;
}

/**
 * Whether a window/level mapping leaves any pixel of the slice above black.
 *
 * vtkImageProperty maps `value` to `(value - (level - width / 2)) / width`,
 * so anything at or below the window's lower bound renders as pure black.
 */
export function sliceShouldRenderVisiblePixels(
  maxScalar: Maybe<number>,
  windowWidth: number,
  windowLevel: number
): Maybe<boolean> {
  if (maxScalar == null) return null;
  if (!Number.isFinite(windowWidth) || !Number.isFinite(windowLevel))
    return null;
  const lowerBound = windowLevel - windowWidth / 2;
  return maxScalar > lowerBound;
}

/**
 * Whether an axis-aligned world bounding box still covers part of the
 * viewport, given a world-to-normalized-display projection.
 *
 * Panning or zooming the image out of frame leaves a legitimately black
 * canvas, so the data alone cannot say whether pixels are owed - where the
 * camera is pointing has to be part of the question.
 */
export function boundsOverlapViewport(
  bounds: number[],
  project: (x: number, y: number, z: number) => Maybe<[number, number]>
): Maybe<boolean> {
  if (bounds.length < 6) return null;
  const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
  if (xMin > xMax || yMin > yMax || zMin > zMax) return null;

  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;

  for (let corner = 0; corner < 8; corner++) {
    const projected = project(
      corner & 1 ? xMax : xMin,
      corner & 2 ? yMax : yMin,
      corner & 4 ? zMax : zMin
    );
    if (!projected) return null;
    const [x, y] = projected;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    left = Math.min(left, x);
    right = Math.max(right, x);
    bottom = Math.min(bottom, y);
    top = Math.max(top, y);
  }

  // Overlap rather than containment: a deeply zoomed-in view has every corner
  // off screen while the middle of the image fills the canvas.
  return right >= 0 && left <= 1 && top >= 0 && bottom <= 1;
}
