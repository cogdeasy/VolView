import { describe, it, expect } from 'vitest';
import { DefaultNamedLayouts } from '@/src/config';
import {
  describeLayout,
  describeWindowLevel,
  findNamedLayout,
} from '@/src/core/hanging-protocols/describe';

describe('protocol descriptions', () => {
  it('names the views in a layout', () => {
    expect(describeLayout([['axial']])).toBe('Axial (1 view)');
    expect(describeLayout(DefaultNamedLayouts['Four Up'])).toBe(
      'Axial, Coronal, Sagittal, Volume (4 views)'
    );
  });

  it('describes window/level specs', () => {
    expect(describeWindowLevel({ kind: 'preset', preset: 'ct-brain' })).toBe(
      'Brain (W 80 / L 40)'
    );
    expect(describeWindowLevel({ kind: 'manual', width: 350, level: 50 })).toBe(
      'W 350 / L 50'
    );
    expect(describeWindowLevel({ kind: 'dicom' })).toBe('From DICOM header');
  });

  it('recognizes a layout that equals a named layout', () => {
    expect(
      findNamedLayout(DefaultNamedLayouts['Axial Only'], DefaultNamedLayouts)
    ).toBe('Axial Only');
    // Same views, different arrangement.
    expect(
      findNamedLayout(
        { direction: 'row', items: ['axial', 'coronal'] },
        DefaultNamedLayouts
      )
    ).toBeNull();
  });
});
