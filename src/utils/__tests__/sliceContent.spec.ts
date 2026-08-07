import { describe, expect, it } from 'vitest';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  boundsOverlapViewport,
  maxScalarOnSlice,
  sliceShouldRenderVisiblePixels,
} from '@/src/utils/sliceContent';

function makeImage(dims: [number, number, number], values: number[]) {
  const image = vtkImageData.newInstance();
  image.setDimensions(dims);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      numberOfComponents: 1,
      values: Float32Array.from(values),
    })
  );
  return image;
}

describe('maxScalarOnSlice', () => {
  // 2x2x2 volume: K=0 slice is all zero, K=1 slice contains a bright voxel.
  const image = makeImage([2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 500]);

  it('reports zero for an empty slice', () => {
    expect(maxScalarOnSlice(image, 2, 0)).toBe(0);
  });

  it('finds the maximum on a populated slice', () => {
    expect(maxScalarOnSlice(image, 2, 1)).toBe(500);
  });

  it('walks in-plane axes for non-K axes', () => {
    expect(maxScalarOnSlice(image, 0, 1)).toBe(500);
    expect(maxScalarOnSlice(image, 0, 0)).toBe(0);
    expect(maxScalarOnSlice(image, 1, 1)).toBe(500);
  });

  it('returns null for out-of-range requests', () => {
    expect(maxScalarOnSlice(image, 2, 7)).toBeNull();
    expect(maxScalarOnSlice(image, 2, -1)).toBeNull();
    expect(maxScalarOnSlice(image, 3, 0)).toBeNull();
  });
});

describe('sliceShouldRenderVisiblePixels', () => {
  it('expects pixels when data rises above the window floor', () => {
    expect(sliceShouldRenderVisiblePixels(500, 400, 200)).toBe(true);
  });

  it('expects a black frame when all data sits below the window floor', () => {
    // Air-only slice viewed with a bone window: legitimately black.
    expect(sliceShouldRenderVisiblePixels(-1000, 1000, 400)).toBe(false);
  });

  it('treats the window floor itself as black', () => {
    expect(sliceShouldRenderVisiblePixels(0, 400, 200)).toBe(false);
  });

  it('declines to answer without data', () => {
    expect(sliceShouldRenderVisiblePixels(null, 400, 200)).toBeNull();
    expect(sliceShouldRenderVisiblePixels(500, NaN, 200)).toBeNull();
  });

  it('expects a black frame under the pre-load default window', () => {
    // useWindowingConfig reports (1, 2^32-1) until real stats arrive, which
    // is exactly when a black canvas must not be reported as a failure.
    expect(sliceShouldRenderVisiblePixels(500, 1, 2 ** 32 - 1)).toBe(false);
  });
});

describe('boundsOverlapViewport', () => {
  const unitBounds = [0, 10, 0, 10, 0, 10];
  /** Maps world coordinates into normalized display by scaling and shifting. */
  const projector =
    (scale: number, offsetX: number, offsetY: number) =>
    (x: number, y: number): [number, number] => [
      x * scale + offsetX,
      y * scale + offsetY,
    ];

  it('sees an image filling the viewport', () => {
    expect(boundsOverlapViewport(unitBounds, projector(0.1, 0, 0))).toBe(true);
  });

  it('sees an image the camera has zoomed into', () => {
    // Every corner is off screen but the middle of the image is not.
    expect(boundsOverlapViewport(unitBounds, projector(1, -4, -4))).toBe(true);
  });

  it('reports an image panned out of frame', () => {
    expect(boundsOverlapViewport(unitBounds, projector(0.1, 3, 0))).toBe(false);
    expect(boundsOverlapViewport(unitBounds, projector(0.1, 0, -5))).toBe(
      false
    );
  });

  it('declines to answer on unusable input', () => {
    expect(boundsOverlapViewport([0, 1], projector(1, 0, 0))).toBeNull();
    expect(boundsOverlapViewport([1, -1, 0, 1, 0, 1], projector(1, 0, 0))).toBe(
      null
    );
    expect(boundsOverlapViewport(unitBounds, () => null)).toBeNull();
    expect(
      boundsOverlapViewport(unitBounds, () => [NaN, 0] as [number, number])
    ).toBeNull();
  });
});
