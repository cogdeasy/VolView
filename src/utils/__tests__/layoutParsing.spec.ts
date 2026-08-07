import { describe, it, expect } from 'vitest';
import {
  layoutToConfig,
  parseLayoutConfig,
  type LayoutConfig,
} from '@/src/utils/layoutParsing';

describe('layoutToConfig', () => {
  const roundTrip = (config: LayoutConfig) => {
    const { layout, views } = parseLayoutConfig(config);
    return layoutToConfig(layout, (slotIndex) => views[slotIndex]);
  };

  it('round-trips a grid layout into an equivalent nested config', () => {
    const parsed = parseLayoutConfig(
      roundTrip([
        ['axial', 'coronal'],
        ['sagittal', 'volume'],
      ])
    );
    expect(parsed.views.map((view) => view.name)).toEqual([
      'Axial',
      'Coronal',
      'Sagittal',
      'Volume',
    ]);
    expect(parsed.views.map((view) => view.type)).toEqual([
      '2D',
      '2D',
      '2D',
      '3D',
    ]);
  });

  it('preserves per-view orientation in nested layouts', () => {
    const config = roundTrip({
      direction: 'row',
      items: ['axial', { direction: 'column', items: ['coronal', 'sagittal'] }],
    });
    const { layout, views } = parseLayoutConfig(config);
    expect(layout.direction).toBe('row');
    expect(views.map((view) => view.options)).toEqual([
      { orientation: 'Axial' },
      { orientation: 'Coronal' },
      { orientation: 'Sagittal' },
    ]);
  });

  it('falls back to an axial view for an unoccupied slot', () => {
    const { layout } = parseLayoutConfig([['axial']]);
    expect(layoutToConfig(layout, () => undefined)).toEqual({
      direction: 'column',
      items: [{ direction: 'row', items: ['axial'] }],
    });
  });
});
