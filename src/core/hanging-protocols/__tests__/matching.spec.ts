import { describe, it, expect } from 'vitest';
import {
  evaluateProtocol,
  explainSelection,
  selectProtocol,
} from '@/src/core/hanging-protocols/matching';
import { BUILT_IN_PROTOCOLS } from '@/src/core/hanging-protocols/seeds';
import type {
  HangingProtocol,
  MatchRules,
  StudyContext,
} from '@/src/core/hanging-protocols/types';

const makeProtocol = (
  id: string,
  match: MatchRules,
  overrides: Partial<HangingProtocol> = {}
): HangingProtocol => ({
  id,
  name: id,
  description: '',
  builtIn: false,
  enabled: true,
  layout: [['axial']],
  windowLevel: { kind: 'dicom' },
  volume: { preset: 'CT-AAA', opacityShift: 0 },
  slicePolicy: 'middle',
  overlays: { viewLabels: true, annotations: true },
  focusedModule: 'Data',
  match,
  ...overrides,
});

const makeContext = (overrides: Partial<StudyContext> = {}): StudyContext => ({
  modality: 'CT',
  bodyPart: 'HEAD',
  studyDescription: 'CT HEAD WITHOUT CONTRAST',
  seriesDescription: 'AXIAL BRAIN',
  seriesCount: 3,
  ...overrides,
});

describe('hanging protocol matching', () => {
  it('matches on modality, body part and study description', () => {
    const protocol = makeProtocol('head', {
      modality: ['CT'],
      bodyPart: ['HEAD'],
      studyDescription: 'head|brain',
    });
    const evaluation = evaluateProtocol(protocol, makeContext());
    expect(evaluation.matched).toBe(true);
    expect(evaluation.criteria).toHaveLength(3);
  });

  it('requires every declared rule to hold', () => {
    const protocol = makeProtocol('chest', {
      modality: ['CT'],
      bodyPart: ['CHEST'],
    });
    const evaluation = evaluateProtocol(protocol, makeContext());
    expect(evaluation.matched).toBe(false);
    expect(
      evaluation.criteria.find((c) => c.criterion === 'Body part')?.matched
    ).toBe(false);
  });

  it('ignores case and matches body part as a substring', () => {
    const protocol = makeProtocol('head', { bodyPart: ['head'] });
    expect(
      evaluateProtocol(protocol, makeContext({ bodyPart: 'HEADNECK' })).matched
    ).toBe(true);
  });

  it('never matches a protocol with no rules', () => {
    expect(
      evaluateProtocol(makeProtocol('empty', {}), makeContext()).matched
    ).toBe(false);
  });

  it('treats an invalid regular expression as a non-match', () => {
    const protocol = makeProtocol('bad', { studyDescription: '(' });
    expect(evaluateProtocol(protocol, makeContext()).matched).toBe(false);
  });

  it('matches series count bounds', () => {
    const protocol = makeProtocol('multi', {
      modality: ['CT'],
      minSeriesCount: 2,
      maxSeriesCount: 4,
    });
    expect(evaluateProtocol(protocol, makeContext()).matched).toBe(true);
    expect(
      evaluateProtocol(protocol, makeContext({ seriesCount: 9 })).matched
    ).toBe(false);
  });
});

describe('protocol precedence', () => {
  const angio = makeProtocol('angio', {
    modality: ['CT'],
    studyDescription: 'cta|angio',
  });
  const head = makeProtocol('head', { modality: ['CT'], bodyPart: ['HEAD'] });
  const context = makeContext({ studyDescription: 'CTA HEAD AND NECK' });

  it('picks the first matching protocol in list order', () => {
    expect(selectProtocol([angio, head], context).protocol?.id).toBe('angio');
    expect(selectProtocol([head, angio], context).protocol?.id).toBe('head');
  });

  it('skips disabled protocols', () => {
    const disabled = { ...angio, enabled: false };
    expect(selectProtocol([disabled, head], context).protocol?.id).toBe('head');
  });

  it('prefers a manual override over any match', () => {
    const selection = selectProtocol([angio, head], context, {
      overrideId: 'head',
    });
    expect(selection.protocol?.id).toBe('head');
    expect(selection.reason).toBe('override');
  });

  it('falls back to the default when nothing matches', () => {
    const selection = selectProtocol(
      [angio, head],
      makeContext({ modality: 'US', bodyPart: '', studyDescription: 'FETUS' }),
      { defaultId: 'head' }
    );
    expect(selection.reason).toBe('default');
    expect(selection.protocol?.id).toBe('head');
  });

  it('reports no protocol when nothing matches and there is no default', () => {
    const selection = selectProtocol([angio], makeContext({ modality: 'US' }));
    expect(selection.protocol).toBeNull();
    expect(selection.reason).toBe('none');
    expect(explainSelection(selection)).toMatch(/no protocol matched/i);
  });

  it('explains why the winner applied', () => {
    const selection = selectProtocol([angio, head], context);
    expect(explainSelection(selection)).toContain('angio matched on');
    expect(explainSelection(selection)).toContain('CTA HEAD AND NECK');
  });
});

describe('built-in protocols', () => {
  const select = (context: StudyContext) =>
    selectProtocol([...BUILT_IN_PROTOCOLS], context).protocol?.id;

  it('hangs a head CT on the brain window protocol', () => {
    expect(
      select(
        makeContext({
          studyDescription: 'CT HEAD WO CONTRAST',
          bodyPart: 'HEAD',
        })
      )
    ).toBe('builtin-head-ct');
  });

  it('prefers the angiography protocol for a CTA head and neck', () => {
    expect(
      select(
        makeContext({
          studyDescription: 'CTA HEAD AND NECK',
          bodyPart: 'HEAD',
        })
      )
    ).toBe('builtin-cta-head-neck');
  });

  it('hangs a chest CT on the lung window protocol', () => {
    expect(
      select(
        makeContext({
          studyDescription: 'CT CHEST WITH CONTRAST',
          bodyPart: 'CHEST',
        })
      )
    ).toBe('builtin-chest-ct');
  });

  it('hangs a soft tissue neck CT on the neck protocol', () => {
    expect(
      select(
        makeContext({
          studyDescription: 'CT NECK SOFT TISSUE W/ CONTR',
          bodyPart: 'NECK',
        })
      )
    ).toBe('builtin-neck-ct');
  });

  it('hangs cardiac MR on the cardiac protocol', () => {
    expect(
      select(
        makeContext({
          modality: 'MR',
          bodyPart: 'HEART',
          studyDescription: 'MRI CARDIAC 3D AND CINE',
        })
      )
    ).toBe('builtin-cardiac-mr');
  });

  it('uses the brain window taught for head CT', () => {
    const headCT = BUILT_IN_PROTOCOLS.find(
      (protocol) => protocol.id === 'builtin-head-ct'
    );
    expect(headCT?.windowLevel).toEqual({ kind: 'preset', preset: 'ct-brain' });
  });
});
