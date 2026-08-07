import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { loadSampleData } from '@/src/actions/loadSampleData';
import { SAMPLE_DATA } from '@/src/config';
import { useDataBrowserStore } from '@/src/store/data-browser';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useImageStore } from '@/src/store/datasets-images';
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
    // Unit tests run without VITE_SHOW_SAMPLE_DATA, which hides demo content.
    useDataBrowserStore().hideSampleData = false;
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
    expect(origins.has('sample')).toBe(true);
    expect(origins.has('synthetic')).toBe(true);
    expect(worklist.studies.length).toBeGreaterThan(10);
  });

  it('lists nothing but real studies when demo content is off', () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = true;
    expect(worklist.studies).toHaveLength(0);

    // A build without demo data still lists what the reader opens themselves.
    addLoadedVolume('volume-1');
    expect(worklist.studies.map((entry) => entry.origin)).toEqual(['loaded']);
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

  it('hands the reading over to the study a demo substitute produced', async () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;
    const synthetic = worklist.studies.find(
      (entry) => entry.origin === 'synthetic'
    )!;
    const [substitute] = SAMPLE_DATA;

    addLoadedVolume('volume-1');
    worklist.select(synthetic.key);
    await worklist.openStudy(synthetic);
    await worklist.openDemoSubstitute(substitute);
    await nextTick();

    // The fabricated row was never read; the study that stood in for it was.
    expect(
      worklist.studies.find((entry) => entry.key === synthetic.key)?.readStatus
    ).toBe(synthetic.readStatus);
    expect(worklist.selectedStudy?.key).toBe('loaded:study-uid-1');
    expect(worklist.selectedStudy?.readStatus).toBe('in-progress');
  });

  it('restores a sample row once the study it produced is closed', async () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;
    const sample = worklist.studies.find((entry) => entry.origin === 'sample')!;

    // The mocked loader resolves to 'volume-1'; register the study it stands for.
    addLoadedVolume('volume-1');
    worklist.select(sample.key);
    await worklist.openStudy(sample);
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      false
    );
    // The preview follows the row that replaced the sample.
    expect(worklist.selectedStudy?.origin).toBe('loaded');

    useDICOMStore().deleteVolume('volume-1');
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      true
    );
  });

  it('does not restart a reading that was already finished', async () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;
    const sample = worklist.studies.find((entry) => entry.origin === 'sample')!;

    addLoadedVolume('volume-1');
    worklist.setReadStatus('loaded:study-uid-1', 'read');
    await worklist.openStudy(sample);

    expect(
      worklist.studies.find((entry) => entry.key === 'loaded:study-uid-1')
        ?.readStatus
    ).toBe('read');
  });

  it('hides a sample that imported as a plain image, and restores it', async () => {
    const worklist = useWorklistStore();
    const imageStore = useImageStore();
    useDataBrowserStore().hideSampleData = false;
    const sample = worklist.studies.find((entry) => entry.origin === 'sample')!;

    // Non-DICOM samples import into the image store, not the DICOM hierarchy.
    vi.mocked(loadSampleData).mockResolvedValueOnce('image-1');
    imageStore.idList.push('image-1');
    await worklist.openStudy(sample);
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      false
    );

    imageStore.idList.splice(0, imageStore.idList.length);
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      true
    );
  });

  it('counts what the preview can actually show', () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;

    worklist.studies
      .filter((entry) => entry.origin !== 'loaded')
      .forEach((entry) => {
        expect(entry.seriesCount).toBe(entry.series.length);
        expect(entry.imageCount).toBe(
          entry.series.reduce((total, series) => total + series.imageCount, 0)
        );
      });
  });

  it('strikes off a sample downloaded from the data panel', async () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;
    const sample = worklist.studies.find((entry) => entry.origin === 'sample')!;

    addLoadedVolume('volume-1');
    worklist.noteSampleImported(sample.sample!.name, 'volume-1');
    await nextTick();

    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      false
    );
    // The sample browser reads the same record, so it stops offering it too.
    expect(worklist.isSampleLoaded(sample.sample!.name)).toBe(true);
  });

  it('keeps a sample struck off while any of its series is loaded', async () => {
    const worklist = useWorklistStore();
    useDataBrowserStore().hideSampleData = false;
    const sample = worklist.studies.find((entry) => entry.origin === 'sample')!;

    addLoadedVolume('volume-1');
    addLoadedVolume('volume-2', { SeriesNumber: '3' });
    worklist.noteSampleImported(sample.sample!.name, 'volume-1');
    await nextTick();

    // Closing one series leaves the study — and so the row that owns it.
    useDICOMStore().deleteVolume('volume-1');
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      false
    );

    useDICOMStore().deleteVolume('volume-2');
    await nextTick();
    expect(worklist.studies.some((entry) => entry.key === sample.key)).toBe(
      true
    );
  });

  it('treats a cleared search or filter as empty rather than null', () => {
    const worklist = useWorklistStore();
    worklist.setFilter('search', 'chest');
    worklist.setFilter('modalities', ['CT']);

    // Vuetify's clearable controls emit null.
    worklist.setFilter('search', null);
    worklist.setFilter('modalities', null);

    expect(worklist.filters.search).toBe('');
    expect(worklist.filters.modalities).toEqual([]);
    expect(worklist.filtersActive).toBe(false);
    expect(worklist.visibleStudies).toHaveLength(worklist.studies.length);
  });

  it('keeps the selected study while filters hide it', () => {
    const worklist = useWorklistStore();
    const [first] = worklist.studies;
    worklist.select(first.key);
    worklist.setFilter('search', 'zzz-no-such-patient');

    expect(worklist.visibleStudies).toHaveLength(0);
    expect(worklist.selectedStudy?.key).toBe(first.key);
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
