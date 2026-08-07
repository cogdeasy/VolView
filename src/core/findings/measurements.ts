import type { Vector3 } from '@kitware/vtk.js/types';
import { mat3, vec3 } from 'gl-matrix';
import type { Laterality } from '@/src/types/finding';

export function distance(a: Vector3, b: Vector3) {
  return vec3.distance(a as vec3, b as vec3);
}

export function centroid(points: Vector3[]): Vector3 {
  if (points.length === 0) return [0, 0, 0];
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
    [0, 0, 0] as Vector3
  );
  return sum.map((component) => component / points.length) as Vector3;
}

/** The two of `axes` least parallel to a plane's normal, i.e. spanning it. */
function axesInPlane(
  axes: Vector3[],
  planeNormal: Vector3
): [Vector3, Vector3] {
  const normal = vec3.normalize(vec3.create(), planeNormal as vec3);
  const [first, second] = axes
    .map((axis) => ({
      axis,
      alignment: Math.abs(
        vec3.dot(vec3.normalize(vec3.create(), axis as vec3), normal)
      ),
    }))
    .sort((a, b) => a.alignment - b.alignment)
    .slice(0, 2)
    .map(({ axis }) => axis);
  return [first, second];
}

/**
 * The two image axes spanning a slice plane. A rectangle is drawn axis-aligned
 * in the view, and the view's camera is oriented off the image's own direction
 * matrix, so its edges run along these — not along the patient axes, unless the
 * acquisition happens to be axis-aligned.
 */
export function inPlaneImageAxes(
  orientation: mat3,
  planeNormal: Vector3
): [Vector3, Vector3] {
  const columns = [0, 1, 2].map(
    (col) => [...orientation.slice(col * 3, col * 3 + 3)] as Vector3
  );
  return axesInPlane(columns, planeNormal);
}

const WORLD_AXES: Vector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * Rectangle extents in its own plane. The two corners span the diagonal, so
 * each edge is that diagonal projected onto one of the axes the rectangle was
 * drawn on. Without those axes the patient axes are assumed, which is only
 * exact for an axis-aligned acquisition.
 */
export function rectangleDimensions(
  first: Vector3,
  second: Vector3,
  planeNormal: Vector3,
  inPlaneAxes?: [Vector3, Vector3]
) {
  const diagonal = vec3.sub(vec3.create(), first as vec3, second as vec3);
  const [width, height] = (inPlaneAxes ?? axesInPlane(WORLD_AXES, planeNormal))
    .map((axis) =>
      Math.abs(vec3.dot(diagonal, vec3.normalize(vec3.create(), axis as vec3)))
    )
    .sort((a, b) => b - a);
  return { width, height, area: width * height };
}

export function polygonPerimeter(points: Vector3[]) {
  if (points.length < 2) return 0;
  return points.reduce(
    (total, point, i) =>
      total + distance(point, points[(i + 1) % points.length]),
    0
  );
}

/** Area of a planar polygon in 3D, via the Newell/cross-product sum. */
export function polygonArea(points: Vector3[]) {
  if (points.length < 3) return 0;
  const total = points.reduce(
    (acc, point, i) => {
      const next = points[(i + 1) % points.length];
      const cross = vec3.cross(vec3.create(), point as vec3, next as vec3);
      return vec3.add(acc, acc, cross);
    },
    vec3.fromValues(0, 0, 0)
  );
  return vec3.length(total) / 2;
}

/**
 * Laterality from LPS world coordinates: +x is the patient's left. Points near
 * the mid-sagittal plane read as midline rather than being forced to a side.
 */
const MIDLINE_TOLERANCE_MM = 5;

export function lateralityFromPoints(points: Vector3[]): Laterality {
  if (points.length === 0) return 'unknown';
  const [x] = centroid(points);
  if (Math.abs(x) <= MIDLINE_TOLERANCE_MM) return 'midline';
  return x > 0 ? 'left' : 'right';
}
