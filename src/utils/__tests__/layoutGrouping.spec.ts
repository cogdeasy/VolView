import { describe, it, expect } from 'vitest';
import { groupLayoutNames } from '@/src/utils/layoutGrouping';
import { DefaultNamedLayouts } from '@/src/config';

describe('groupLayoutNames', () => {
  it('groups the default layouts into submenus and keeps the rest flat', () => {
    const entries = groupLayoutNames(Object.keys(DefaultNamedLayouts));

    const groups = entries.filter((entry) => entry.kind === 'group');
    expect(groups.map((group) => group.label)).toEqual([
      'Single Slice View',
      'Focused View',
    ]);
    expect(
      groups.map((group) => group.items.map((item) => item.label))
    ).toEqual([
      ['Axial', 'Coronal', 'Sagittal'],
      ['Axial', 'Coronal', 'Sagittal', '3D'],
    ]);

    const topLevel = entries
      .filter((entry) => entry.kind === 'layout')
      .map((entry) => entry.name);
    expect(topLevel).toEqual(['Four Up', '3D Only', 'Oblique']);
  });

  it('keeps every layout reachable', () => {
    const names = Object.keys(DefaultNamedLayouts);
    const entries = groupLayoutNames(names);

    const reachable = entries.flatMap((entry) =>
      entry.kind === 'group'
        ? entry.items.map((item) => item.name)
        : [entry.name]
    );
    expect(new Set(reachable)).toEqual(new Set(names));
  });

  it('lists custom layouts at the top level', () => {
    const entries = groupLayoutNames(['Axial Only', 'My Layout']);

    expect(entries).toEqual([
      {
        kind: 'group',
        label: 'Single Slice View',
        items: [{ name: 'Axial Only', label: 'Axial' }],
      },
      { kind: 'layout', name: 'My Layout', label: 'My Layout' },
    ]);
  });
});
