import { describe, expect, it } from 'vitest';
import type { WorklistStudy } from '@/src/types/worklist';
import {
  availableModalities,
  defaultFilters,
  filterStudies,
  formatAge,
  formatDicomDate,
  formatDicomDateTime,
  formatDicomTime,
  formatPatientName,
  isFilterActive,
  matchesSearch,
  sortStudies,
  studyTimestamp,
} from '@/src/utils/worklist';

function makeStudy(overrides: Partial<WorklistStudy> = {}): WorklistStudy {
  return {
    key: 'study-1',
    origin: 'synthetic',
    patientName: 'Doe^Jane',
    patientId: 'PVV-1',
    patientBirthDate: '19800101',
    patientSex: 'F',
    accessionNumber: 'ACC-1',
    modality: 'CT',
    description: 'CT Chest',
    bodyPart: 'CHEST',
    studyDate: '20260101',
    studyTime: '120000',
    seriesCount: 1,
    imageCount: 10,
    priority: 'routine',
    readStatus: 'unread',
    assignedReader: 'Dr. A',
    series: [],
    volumeKeys: [],
    ...overrides,
  };
}

describe('worklist formatting', () => {
  it('formats DICOM dates and times', () => {
    expect(formatDicomDate('20260214')).to.equal('2026-02-14');
    expect(formatDicomDate('')).to.equal('');
    expect(formatDicomDate('not-a-date')).to.equal('not-a-date');
    expect(formatDicomTime('134502.000000')).to.equal('13:45');
    expect(formatDicomTime('13')).to.equal('');
    expect(formatDicomDateTime('20260214', '134502')).to.equal(
      '2026-02-14 13:45'
    );
    expect(formatDicomDateTime('20260214', '')).to.equal('2026-02-14');
  });

  it('renders caret-delimited patient names in reading order', () => {
    expect(formatPatientName('Doyle^Patrick^J')).to.equal('Patrick J Doyle');
    expect(formatPatientName('  Anonymous  ')).to.equal('Anonymous');
    expect(formatPatientName('')).to.equal('');
  });

  it('computes age at the study date', () => {
    expect(formatAge('19800615', '20260101')).to.equal('045Y');
    // Birthday has not happened yet in the study year.
    expect(formatAge('19800615', '20260601')).to.equal('045Y');
    expect(formatAge('19800615', '20260615')).to.equal('046Y');
    expect(formatAge('', '20260101')).to.equal('');
  });

  it('orders studies by date and time', () => {
    const earlier = makeStudy({ studyTime: '080000' });
    const later = makeStudy({ studyTime: '180000' });
    expect(studyTimestamp(later)).to.be.greaterThan(studyTimestamp(earlier));
  });
});

describe('worklist search and filters', () => {
  it('matches on every whitespace-separated term', () => {
    const study = makeStudy();
    expect(matchesSearch(study, '')).to.equal(true);
    expect(matchesSearch(study, 'jane chest')).to.equal(true);
    expect(matchesSearch(study, 'ACC-1')).to.equal(true);
    expect(matchesSearch(study, 'jane brain')).to.equal(false);
  });

  it('filters by modality, priority and read status', () => {
    const studies = [
      makeStudy({ key: 'a', modality: 'CT', priority: 'stat' }),
      makeStudy({ key: 'b', modality: 'MR', readStatus: 'read' }),
    ];

    expect(
      filterStudies(studies, { ...defaultFilters(), modalities: ['MR'] }).map(
        (study) => study.key
      )
    ).to.deep.equal(['b']);

    expect(
      filterStudies(studies, {
        ...defaultFilters(),
        priorities: ['stat'],
      }).map((study) => study.key)
    ).to.deep.equal(['a']);

    expect(
      filterStudies(studies, {
        ...defaultFilters(),
        readStatuses: ['read'],
      }).map((study) => study.key)
    ).to.deep.equal(['b']);
  });

  it('filters by relative date range', () => {
    const now = new Date(2026, 1, 10);
    const studies = [
      makeStudy({ key: 'today', studyDate: '20260210' }),
      makeStudy({ key: 'lastweek', studyDate: '20260205' }),
      makeStudy({ key: 'undated', studyDate: '' }),
    ];

    expect(
      filterStudies(
        studies,
        { ...defaultFilters(), dateRange: 'today' },
        now
      ).map((study) => study.key)
    ).to.deep.equal(['today']);

    expect(
      filterStudies(
        studies,
        { ...defaultFilters(), dateRange: 'last7days' },
        now
      ).map((study) => study.key)
    ).to.deep.equal(['today', 'lastweek']);

    expect(
      filterStudies(studies, { ...defaultFilters(), dateRange: 'any' }, now)
    ).to.have.length(3);
  });

  it('reports whether any filter narrows the list', () => {
    expect(isFilterActive(defaultFilters())).to.equal(false);
    expect(isFilterActive({ ...defaultFilters(), search: '  ' })).to.equal(
      false
    );
    expect(isFilterActive({ ...defaultFilters(), search: 'ct' })).to.equal(
      true
    );
    expect(
      isFilterActive({ ...defaultFilters(), dateRange: 'today' })
    ).to.equal(true);
  });

  it('lists the modalities present', () => {
    expect(
      availableModalities([
        makeStudy({ modality: 'MR' }),
        makeStudy({ modality: 'CT' }),
        makeStudy({ modality: 'CT' }),
        makeStudy({ modality: '' }),
      ])
    ).to.deep.equal(['CT', 'MR']);
  });
});

describe('worklist sorting', () => {
  const studies = [
    makeStudy({
      key: 'a',
      patientName: 'Zeta^Ann',
      studyDate: '20260101',
      priority: 'routine',
      readStatus: 'read',
    }),
    makeStudy({
      key: 'b',
      patientName: 'Alpha^Bob',
      studyDate: '20260301',
      priority: 'stat',
      readStatus: 'unread',
    }),
  ];

  it('alphabetizes patients by family name', () => {
    expect(
      sortStudies(studies, { key: 'patientName', direction: 'asc' }).map(
        (study) => study.key
      )
    ).to.deep.equal(['b', 'a']);
  });

  it('sorts newest study first when descending', () => {
    expect(
      sortStudies(studies, { key: 'studyDateTime', direction: 'desc' }).map(
        (study) => study.key
      )
    ).to.deep.equal(['b', 'a']);
  });

  it('puts STAT and unread first', () => {
    expect(
      sortStudies(studies, { key: 'priority', direction: 'asc' })[0].key
    ).to.equal('b');
    expect(
      sortStudies(studies, { key: 'readStatus', direction: 'asc' })[0].key
    ).to.equal('b');
  });

  it('does not mutate the input', () => {
    const input = [...studies];
    sortStudies(input, { key: 'patientName', direction: 'desc' });
    expect(input.map((study) => study.key)).to.deep.equal(['a', 'b']);
  });
});
