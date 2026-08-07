import { describe, expect, it } from 'vitest';
import { mat3 } from 'gl-matrix';
import type { Vector3 } from '@kitware/vtk.js/types';

import { Brand } from '@/src/branding';
import {
  renderReportHtml,
  renderReportText,
  type Report,
} from '@/src/core/findings/report';
import {
  inPlaneImageAxes,
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

  it('heads the patient, study and series groups in the text export', () => {
    // Each group carries a Description-like label, so an unheaded flat list
    // reads as duplicate fields.
    const text = renderReportText(report());

    expect(text).toContain('PATIENT\nName: Doe Jane');
    expect(text).toContain('STUDY\nDescription: Cardiac MR');
    expect(text).toContain('SERIES\nModality: MR');
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
    const doc = report();
    doc.findings[0].title = `Rokitansky's "sign"`;
    const html = renderReportHtml(doc);

    expect(html).toContain('Dilated &lt;cavity&gt; &amp; thin wall');
    expect(html).not.toContain('<cavity>');
    // Quotes too: the same escaping guards attribute values.
    expect(html).toContain('Rokitansky&#39;s &quot;sign&quot;');
    expect(html).not.toContain("Rokitansky's");
  });

  it('drops a key image whose source is not a raster data url', () => {
    // The exported document runs outside the app's sandbox, and a key image
    // can arrive from someone else's `.volview.zip`.
    const doc = report();
    doc.findings[0].keyImage!.dataURL =
      'data:image/png;base64,AAAA" onerror="alert(1)';

    const html = renderReportHtml(doc);

    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
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

  it('takes rectangle extents along a tilted image own axes', () => {
    const angle = Math.PI / 6;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    // Columns are the image axes: the slice plane is rotated 30° about z.
    const orientation = mat3.fromValues(cos, sin, 0, -sin, cos, 0, 0, 0, 1);
    const normal: Vector3 = [0, 0, 1];
    const corner: Vector3 = [10, 20, 5];
    const opposite: Vector3 = [
      corner[0] + 7 * cos - 4 * sin,
      corner[1] + 7 * sin + 4 * cos,
      5,
    ];

    const { width, height, area } = rectangleDimensions(
      corner,
      opposite,
      normal,
      inPlaneImageAxes(orientation, normal)
    );
    expect(width).toBeCloseTo(7);
    expect(height).toBeCloseTo(4);
    expect(area).toBeCloseTo(28);

    // The extents are reported longest first, not axis by axis, so which of
    // the two in-plane axes comes first cannot change the answer.
    const [firstAxis, secondAxis] = inPlaneImageAxes(orientation, normal);
    expect(
      rectangleDimensions(corner, opposite, normal, [secondAxis, firstAxis])
    ).toEqual({ width, height, area });

    // Patient axes alone read the rotated rectangle's bounding box instead.
    expect(rectangleDimensions(corner, opposite, normal).area).toBeGreaterThan(
      area
    );
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
