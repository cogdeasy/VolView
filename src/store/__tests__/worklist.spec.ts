import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useWorklistStore } from '@/src/store/worklist';

vi.mock('@/src/actions/loadSampleData', () => ({
  loadSampleData: vi.fn().mockResolvedValue('volume-1'),
}));

const patient = {
  PatientID: 'PID-1',
  PatientName: 'Vance^Robert',
  PatientBirthDate: '19600101',
  PatientSex: 'M',
};

const study = {
  StudyID: '1',
  StudyInstanceUID: 'study-uid-1',
  StudyDate: '20260210',
  StudyTime: '101500',
  AccessionNumber: 'ACC-42',
  StudyDescription: 'CT Chest with contrast',
};

function addLoadedVolume(volumeKey: string, overrides = {}) {
  useDICOMStore()._updateDatabase(patient, study, {
    NumberOfSlices: 120,
    VolumeID: volumeKey,
    Modality: 'CT',
    SeriesInstanceUID: `series-${volumeKey}`,
    SeriesNumber: '2',
    SeriesDescription: 'Axial 1.0 mm',
    WindowLevel: '',
    WindowWidth: '',
    BodyPartExamined: 'CHEST',
    kind: 'volume',
    ...overrides,
  });
}

describe('Worklist store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows the worklist until data is loaded', () => {
    const worklist = useWorklistStore();
    expect(worklist.visible).toBe(true);

    addLoadedVolume('volume-1');
    expect(worklist.visible).toBe(false);

    worklist.show();
    expect(worklist.visible).toBe(true);

    worklist.hide();
    expect(worklist.visible).toBe(false);
  });

  it('returns to the worklist when the last study is closed', async () => {
    const worklist = useWorklistStore();
    addLoadedVolume('volume-1');
    await nextTick();
    worklist.hide();

    useDICOMStore().deleteVolume('volume-1');
    await nextTick();

    expect(worklist.visible).toBe(true);
  });

  it('builds rows from the DICOM patient/study/series hierarchy', () => {
    const worklist = useWorklistStore();
    addLoadedVolume('volume-1');
    addLoadedVolume('volume-2', {
      SeriesNumber: '3',
      SeriesDescription: 'Coronal 3.0 mm',
      NumberOfSlices: 40,
    });

    const loaded = worklist.studies.filter(
      (entry) => entry.origin === 'loaded'
    );
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      patientName: 'Vance^Robert',
      patientId: 'PID-1',
      accessionNumber: 'ACC-42',
      modality: 'CT',
      bodyPart: 'CHEST',
      description: 'CT Chest with contrast',
      seriesCount: 2,
      imageCount: 160,
      readStatus: 'unread',
    });
    expect(loaded[0].series.map((series) => series.description)).toEqual([
      'Axial 1.0 mm',
      'Coronal 3.0 mm',
    ]);
  });

  it('pads the list with sample and demo entries', () => {
    const worklist = useWorklistStore();
    const origins = new Set(worklist.studies.map((entry) => entry.origin));
    expect(origins.has('synthetic')).toBe(true);
    expect(worklist.studies.length).toBeGreaterThan(10);
  });

  it('marks a study in progress when it is opened, and never regresses it', async () => {
    const worklist = useWorklistStore();
    addLoadedVolume('volume-1');
    const [loaded] = worklist.studies.filter(
      (entry) => entry.origin === 'loaded'
    );

    await worklist.openStudy(loaded);
    expect(
      worklist.studies.find((entry) => entry.key === loaded.key)?.readStatus
    ).toBe('in-progress');

    worklist.setReadStatus(loaded.key, 'read');
    await worklist.openStudy(
      worklist.studies.find((entry) => entry.key === loaded.key)!
    );
    expect(
      worklist.studies.find((entry) => entry.key === loaded.key)?.readStatus
    ).toBe('read');
  });

  it('surfaces a demo-entry notice instead of silently doing nothing', async () => {
    const worklist = useWorklistStore();
    const synthetic = worklist.studies.find(
      (entry) => entry.origin === 'synthetic'
    )!;

    await worklist.openStudy(synthetic);

    expect(worklist.demoEntry?.key).toBe(synthetic.key);
    worklist.dismissDemoEntry();
    expect(worklist.demoEntry).toBeNull();
  });

  it('applies search and sort to the visible rows', () => {
    const worklist = useWorklistStore();
    worklist.filters.search = 'zzz-no-such-patient';
    expect(worklist.visibleStudies).toHaveLength(0);
    expect(worklist.filtersActive).toBe(true);

    worklist.resetFilters();
    expect(worklist.filtersActive).toBe(false);

    worklist.setSort('patientName');
    expect(worklist.sort).toEqual({ key: 'patientName', direction: 'asc' });
    worklist.setSort('patientName');
    expect(worklist.sort).toEqual({ key: 'patientName', direction: 'desc' });
  });
});
