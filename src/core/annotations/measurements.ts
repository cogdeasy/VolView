import type { Vector3 } from '@kitware/vtk.js/types';
import { distance2BetweenPoints } from '@kitware/vtk.js/Common/Core/Math';
import {
  FrameOfReference,
  getPlaneTransforms,
} from '@/src/utils/frameOfReference';

export type RectangleMeasurements = {
  /** in-plane extent along the first plane axis, in mm */
  width: number;
  /** in-plane extent along the second plane axis, in mm */
  height: number;
  /** width * height, in mm^2 */
  area: number;
};

export function rulerLength(firstPoint: Vector3, secondPoint: Vector3) {
  return Math.sqrt(distance2BetweenPoints(firstPoint, secondPoint));
}

/**
 * Measures a rectangle defined by two opposite corners lying on a plane.
 */
export function rectangleMeasurements(
  frameOfReference: FrameOfReference,
  firstPoint: Vector3,
  secondPoint: Vector3
): RectangleMeasurements {
  const { to2D } = getPlaneTransforms(frameOfReference);
  const [firstX, firstY] = to2D(firstPoint);
  const [secondX, secondY] = to2D(secondPoint);
  const width = Math.abs(secondX - firstX);
  const height = Math.abs(secondY - firstY);
  return { width, height, area: width * height };
}

const DECIMALS = 2;

export function formatLength(millimeters: number) {
  return `${millimeters.toFixed(DECIMALS)} mm`;
}

export function formatArea(squareMillimeters: number) {
  return `${squareMillimeters.toFixed(DECIMALS)} mm²`;
}

export function formatRectangleSize({ width, height }: RectangleMeasurements) {
  return `${width.toFixed(DECIMALS)} × ${height.toFixed(DECIMALS)} mm`;
}
