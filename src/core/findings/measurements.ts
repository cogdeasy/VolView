import type { Vector3 } from '@kitware/vtk.js/types';
import { vec3 } from 'gl-matrix';
import type { Laterality } from '@/src/types/finding';

export type MeasurementQuantity = {
  label: string;
  value: number;
  units: string;
};

export const formatQuantity = (quantity: MeasurementQuantity) =>
  `${quantity.value.toFixed(2)} ${quantity.units}`;

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

/**
 * Rectangle extents in its own plane. The two corners span the rectangle, so
 * the edge lengths are the corner delta's components along the two axes that
 * are not the plane normal.
 */
export function rectangleDimensions(
  first: Vector3,
  second: Vector3,
  planeNormal: Vector3
) {
  const delta = first.map((component, i) => Math.abs(component - second[i]));
  const inPlane = delta
    .map((component, i) => ({ component, normal: Math.abs(planeNormal[i]) }))
    // Drop the out-of-plane axis: on an orthogonal slice its delta is 0 anyway,
    // but sorting by the normal keeps an off-orthogonal plane sane.
    .sort((a, b) => a.normal - b.normal)
    .slice(0, 2)
    .map(({ component }) => component)
    .sort((a, b) => b - a);
  const [width, height] = inPlane;
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
