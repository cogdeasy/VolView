import { describe, expect, it } from 'vitest';
import type { Vector3 } from '@kitware/vtk.js/types';
import {
  formatArea,
  formatLength,
  formatRectangleSize,
  rectangleMeasurements,
  rulerLength,
} from '@/src/core/annotations/measurements';

const axialFrame = {
  planeOrigin: [0, 0, 5] as Vector3,
  planeNormal: [0, 0, 1] as Vector3,
};

describe('rulerLength', () => {
  it('measures the distance between two points', () => {
    expect(rulerLength([0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
  });
});

describe('rectangleMeasurements', () => {
  it('measures in-plane extents of an axial rectangle', () => {
    const { width, height, area } = rectangleMeasurements(
      axialFrame,
      [1, 2, 5],
      [4, 8, 5]
    );
    expect(width).toBeCloseTo(3);
    expect(height).toBeCloseTo(6);
    expect(area).toBeCloseTo(18);
  });

  it('is independent of corner ordering', () => {
    const forward = rectangleMeasurements(axialFrame, [1, 2, 5], [4, 8, 5]);
    const reversed = rectangleMeasurements(axialFrame, [4, 8, 5], [1, 2, 5]);
    expect(reversed.width).toBeCloseTo(forward.width);
    expect(reversed.height).toBeCloseTo(forward.height);
  });

  it('measures rectangles on a sagittal plane', () => {
    const { width, height, area } = rectangleMeasurements(
      { planeOrigin: [3, 0, 0], planeNormal: [1, 0, 0] },
      [3, 0, 0],
      [3, 2, 5]
    );
    expect(new Set([width, height].map((v) => Math.round(v)))).toEqual(
      new Set([2, 5])
    );
    expect(area).toBeCloseTo(10);
  });

  it('ignores out-of-plane drift between the corners', () => {
    const { width, height } = rectangleMeasurements(
      axialFrame,
      [0, 0, 5],
      [2, 3, 9]
    );
    expect(width).toBeCloseTo(2);
    expect(height).toBeCloseTo(3);
  });
});

describe('formatting', () => {
  it('formats lengths, areas and rectangle sizes', () => {
    expect(formatLength(12.345)).toBe('12.35 mm');
    expect(formatArea(4)).toBe('4.00 mm²');
    expect(formatRectangleSize({ width: 1, height: 2.5, area: 2.5 })).toBe(
      '1.00 × 2.50 mm'
    );
  });
});
