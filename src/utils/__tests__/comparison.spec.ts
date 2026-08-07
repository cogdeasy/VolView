import { describe, it, expect } from 'vitest';
import { vec3, mat3, mat4 } from 'gl-matrix';
import type { Vector3 } from '@kitware/vtk.js/types';
import { ImageMetadata } from '@/src/types/image';
import {
  assessAlignment,
  copyInPlaneComponents,
  currentSliceToPriorSlice,
  formatStudyInterval,
  formatDicomDate,
  physicalPositionToSlice,
  placeOnSlicePlane,
  priorSliceToCurrentSlice,
  sliceToPhysicalPosition,
} from '@/src/utils/comparison';
import { getLPSDirections } from '../lps';

interface VolumeSpec {
  spacing?: Vector3;
  origin?: Vector3;
  dimensions?: Vector3;
  /** Rotation about the S axis, in degrees, to break the frame of reference. */
  yaw?: number;
}

function makeMetadata({
  spacing = [1, 1, 1],
  origin = [0, 0, 0],
  dimensions = [20, 20, 20],
  yaw = 0,
}: VolumeSpec = {}): ImageMetadata {
  const radians = (yaw * Math.PI) / 180;
  const orientation = mat3.create();
  mat3.fromRotation(orientation, radians);

  const rotation = mat4.create();
  mat4.fromRotation(rotation, radians, [0, 0, 1]);

  const indexToWorld = mat4.create();
  mat4.fromTranslation(indexToWorld, origin);
  mat4.multiply(indexToWorld, indexToWorld, rotation);
  mat4.scale(indexToWorld, indexToWorld, spacing);

  const worldToIndex = mat4.create();
  mat4.invert(worldToIndex, indexToWorld);

  return {
    name: 'test',
    orientation,
    lpsOrientation: getLPSDirections(orientation),
    spacing: vec3.clone(spacing),
    origin: vec3.clone(origin),
    dimensions: vec3.clone(dimensions),
    worldBounds: [0, 20, 0, 20, 0, 20],
    worldToIndex,
    indexToWorld,
  };
}

describe('comparison slice mapping', () => {
  it('converts between slice index and patient position', () => {
    const metadata = makeMetadata({
      spacing: [1, 1, 2.5],
      origin: [0, 0, -30],
    });
    expect(sliceToPhysicalPosition(metadata, 'Axial', 4)).toBeCloseTo(-20);
    expect(physicalPositionToSlice(metadata, 'Axial', -20)).toBe(4);
  });

  it('clamps positions outside the volume', () => {
    const metadata = makeMetadata({ dimensions: [20, 20, 10] });
    expect(physicalPositionToSlice(metadata, 'Axial', -100)).toBe(0);
    expect(physicalPositionToSlice(metadata, 'Axial', 100)).toBe(9);
  });

  it('maps by patient position across differing slice thickness', () => {
    // Prior is twice as thick and starts 10 mm superior of the current study.
    const current = makeMetadata({
      spacing: [1, 1, 1],
      dimensions: [20, 20, 40],
    });
    const prior = makeMetadata({
      spacing: [1, 1, 2],
      origin: [0, 0, 10],
      dimensions: [20, 20, 40],
    });

    // Current slice 30 sits at z = 30, i.e. prior slice (30 - 10) / 2 = 10.
    expect(
      currentSliceToPriorSlice(current, prior, 'Axial', 30, 'physical')
    ).toBe(10);
    expect(
      priorSliceToCurrentSlice(current, prior, 'Axial', 10, 'physical')
    ).toBe(30);
  });

  it('applies the manual nudge in prior slices and inverts it', () => {
    const current = makeMetadata({ dimensions: [20, 20, 40] });
    const prior = makeMetadata({ dimensions: [20, 20, 40] });

    expect(
      currentSliceToPriorSlice(current, prior, 'Axial', 20, 'physical', 3)
    ).toBe(23);
    expect(
      priorSliceToCurrentSlice(current, prior, 'Axial', 23, 'physical', 3)
    ).toBe(20);
  });

  it('clamps the mapped slice to the prior volume', () => {
    const current = makeMetadata({ dimensions: [20, 20, 40] });
    const prior = makeMetadata({ dimensions: [20, 20, 10] });

    expect(
      currentSliceToPriorSlice(current, prior, 'Axial', 39, 'physical')
    ).toBe(9);
    expect(
      currentSliceToPriorSlice(current, prior, 'Axial', 0, 'physical', -5)
    ).toBe(0);
  });

  it('falls back to normalized index when frames are incomparable', () => {
    const current = makeMetadata({ dimensions: [20, 20, 41] });
    const prior = makeMetadata({ dimensions: [20, 20, 21] });

    expect(currentSliceToPriorSlice(current, prior, 'Axial', 40, 'index')).toBe(
      20
    );
    expect(currentSliceToPriorSlice(current, prior, 'Axial', 20, 'index')).toBe(
      10
    );
    expect(priorSliceToCurrentSlice(current, prior, 'Axial', 10, 'index')).toBe(
      20
    );
  });
});

describe('assessAlignment', () => {
  it('accepts studies sharing a frame of reference', () => {
    const current = makeMetadata({ dimensions: [20, 20, 40] });
    const prior = makeMetadata({
      spacing: [1, 1, 3],
      dimensions: [20, 20, 20],
    });
    expect(assessAlignment(current, prior, 'Axial').mode).toBe('physical');
  });

  it('rejects studies acquired at different orientations', () => {
    const current = makeMetadata();
    const prior = makeMetadata({ yaw: 30 });
    const assessment = assessAlignment(current, prior, 'Axial');
    expect(assessment.mode).toBe('index');
    expect(assessment.reason).toMatch(/orientation/i);
  });

  it('rejects studies covering disjoint anatomy', () => {
    const current = makeMetadata({ dimensions: [20, 20, 20] });
    const prior = makeMetadata({
      origin: [0, 0, 500],
      dimensions: [20, 20, 20],
    });
    const assessment = assessAlignment(current, prior, 'Axial');
    expect(assessment.mode).toBe('index');
    expect(assessment.reason).toMatch(/overlapping/i);
  });

  it('rejects single-slice volumes', () => {
    const current = makeMetadata({ dimensions: [20, 20, 1] });
    const prior = makeMetadata();
    expect(assessAlignment(current, prior, 'Axial').mode).toBe('index');
  });
});

describe('world point helpers', () => {
  it('copies only the in-plane components', () => {
    expect(copyInPlaneComponents([1, 2, 3], [7, 8, 9], 'Axial')).toEqual([
      1, 2, 9,
    ]);
    expect(copyInPlaneComponents([1, 2, 3], [7, 8, 9], 'Sagittal')).toEqual([
      7, 2, 3,
    ]);
  });

  it('moves a point onto a slice plane', () => {
    expect(placeOnSlicePlane([1, 2, 3], 'Axial', 42)).toEqual([1, 2, 42]);
  });
});

describe('study dates', () => {
  it('formats DICOM dates', () => {
    expect(formatDicomDate('20240314')).toBe('2024-03-14');
    expect(formatDicomDate('')).toBeNull();
    expect(formatDicomDate('garbage')).toBeNull();
  });

  it('rejects dates that do not exist rather than rolling them over', () => {
    expect(formatDicomDate('20241332')).toBeNull();
    expect(formatDicomDate('20240230')).toBeNull();
    expect(formatDicomDate('20240229')).toBe('2024-02-29');
    expect(formatStudyInterval('20240314', '20241332')).toBeNull();
  });

  it('describes the interval between studies', () => {
    expect(formatStudyInterval('20240314', '20230914')).toBe(
      '6 months earlier'
    );
    expect(formatStudyInterval('20240314', '20240313')).toBe('1 day earlier');
    expect(formatStudyInterval('20240314', '20240314')).toBe('same day');
    expect(formatStudyInterval('20240314', '20200314')).toBe('4 years earlier');
    // A "prior" that is actually newer is still described honestly.
    expect(formatStudyInterval('20230914', '20240314')).toBe('6 months later');
    expect(formatStudyInterval('20240314', undefined)).toBeNull();
  });
});
