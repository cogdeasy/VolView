import { describe, expect, it } from 'vitest';

import { Brand } from '@/src/branding';
import {
  renderReportHtml,
  renderReportText,
  type Report,
} from '@/src/core/findings/report';
import {
  polygonArea,
  rectangleDimensions,
} from '@/src/core/findings/measurements';
import { typesForModality } from '@/src/core/findings/taxonomy';
import type { FindingType } from '@/src/types/finding';

const report = (): Report => ({
  generatedAt: '2026-01-02 09:30',
  patient: [
    { label: 'Name', value: 'Doe Jane' },
    { label: 'ID', value: 'PID-1' },
  ],
  study: [{ label: 'Description', value: 'Cardiac MR' }],
  series: [{ label: 'Modality', value: 'MR' }],
  impression: 'Enlarged left ventricle.',
  findings: [
    {
      title: 'LV long axis',
      type: 'Chamber measurement',
      bodySite: 'Left ventricle',
      laterality: 'Left',
      categoryLabel: 'Severity',
      category: 'Moderate',
      description: 'Dilated <cavity> & thin wall',
      location: 'Axial slice 12 of 30',
      coordinates: 'IJK 10, 20, 11',
      measurements: [
        {
          kind: 'Ruler',
          label: 'Lesion',
          quantities: [{ label: 'Length', text: '42.5 mm' }],
        },
      ],
      keyImage: {
        dataURL: 'data:image/png;base64,AAAA',
        caption: 'LV long axis — Axial, slice 12',
      },
    },
  ],
});

describe('report rendering', () => {
  it('puts the numbers, the structure and the branding in the text export', () => {
    const text = renderReportText(report());

    expect(text).toContain(Brand.productName.toUpperCase());
    expect(text).toContain('IMPRESSION');
    expect(text).toContain('Enlarged left ventricle.');
    expect(text).toContain('1. LV long axis');
    expect(text).toContain('Length 42.5 mm');
    expect(text).toContain('Severity: Moderate');
    expect(text).toContain('Axial slice 12 of 30');
  });

  it('marks an empty report rather than rendering blanks', () => {
    const empty = { ...report(), impression: '  ', findings: [] };
    const text = renderReportText(empty);
    expect(text).toContain('FINDINGS\n—');
  });

  it('renders a self-contained html document with the key image inline', () => {
    const html = renderReportHtml(report());

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    // No external references: the file has to open on its own.
    expect(html).not.toMatch(/<(link|script)\b/);
    expect(html).toContain('42.5 mm');
  });

  it('escapes user text', () => {
    const html = renderReportHtml(report());
    expect(html).toContain('Dilated &lt;cavity&gt; &amp; thin wall');
    expect(html).not.toContain('<cavity>');
  });

  it('uses a print-safe surface when printing a dark session', () => {
    const dark = renderReportHtml(report(), { theme: 'dark' });
    const printed = renderReportHtml(report(), {
      theme: 'dark',
      forPrint: true,
    });
    expect(dark).toContain('color-scheme: dark');
    expect(printed).toContain('color-scheme: light');
  });
});

describe('measurement math', () => {
  it('takes rectangle extents in the slice plane', () => {
    const { width, height, area } = rectangleDimensions(
      [10, 20, 5],
      [14, 27, 5],
      [0, 0, 1]
    );
    expect(width).toBeCloseTo(7);
    expect(height).toBeCloseTo(4);
    expect(area).toBeCloseTo(28);
  });

  it('measures the area of a planar polygon in 3D', () => {
    expect(
      polygonArea([
        [0, 0, 3],
        [4, 0, 3],
        [4, 2, 3],
        [0, 2, 3],
      ])
    ).toBeCloseTo(8);
  });
});

describe('taxonomy', () => {
  const types: FindingType[] = [
    {
      id: 'a',
      label: 'CT only',
      modalities: ['CT'],
      defaultBodySite: '',
      categoryScale: 'severity',
    },
    {
      id: 'b',
      label: 'Any modality',
      modalities: [],
      defaultBodySite: '',
      categoryScale: 'severity',
    },
  ];

  it('offers modality-specific types first, then the generic ones', () => {
    expect(typesForModality(types, 'ct').map((type) => type.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('falls back to the whole taxonomy for an unknown modality', () => {
    expect(typesForModality(types, 'US').map((type) => type.id)).toEqual(['b']);
    expect(typesForModality(types, '').map((type) => type.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
