import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';

import { loadSampleData } from '@/src/actions/loadSampleData';
import {
  SAMPLE_DATA,
  SAMPLE_WORKLIST_METADATA,
  WORKLIST_DEMO_STUDIES,
} from '@/src/config';
import { useDataBrowserStore } from '@/src/store/data-browser';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useImageStore } from '@/src/store/datasets-images';
import { useMessageStore } from '@/src/store/messages';
import { useViewStore } from '@/src/store/views';
import { SampleDataset } from '@/src/types';
import type {
  ReadStatus,
  SortKey,
  WorklistFilters,
  WorklistSeries,
  WorklistSort,
  WorklistStudy,
} from '@/src/types/worklist';
import {
  availableModalities,
  defaultFilters,
  filterStudies,
  isFilterActive,
  sortStudies,
} from '@/src/utils/worklist';

/** DICOM DA for a date the given number of days before today. */
function daysAgoToDicomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Study-level counts, so a row can never disagree with its own series. */
function seriesTotals(series: WorklistSeries[]) {
  return {
    seriesCount: series.length,
    imageCount: series.reduce((total, entry) => total + entry.imageCount, 0),
  };
}

/** The modality that best characterizes a multi-modality study. */
function primaryModality(modalities: string[]): string {
  const counts = new Map<string, number>();
  modalities
    .map((modality) => modality?.trim())
    .filter(Boolean)
    .forEach((modality) =>
      counts.set(modality, (counts.get(modality) ?? 0) + 1)
    );
  let best = '';
  let bestCount = 0;
  counts.forEach((count, modality) => {
    if (count > bestCount) {
      best = modality;
      bestCount = count;
    }
  });
  return best;
}

export const useWorklistStore = defineStore('worklist', () => {
  const dicomStore = useDICOMStore();
  const imageStore = useImageStore();
  const viewStore = useViewStore();
  const dataBrowserStore = useDataBrowserStore();

  const filters = reactive<WorklistFilters>(defaultFilters());
  const sort = ref<WorklistSort>({ key: 'studyDateTime', direction: 'desc' });
  const selectedKey = ref<string | null>(null);

  /** Explicitly re-opened from the app bar, even though data is loaded. */
  const pinnedOpen = ref(false);
  /** Explicitly left, so the empty viewer's own entry points are reachable. */
  const dismissed = ref(false);

  /** Study key -> status, for statuses the user has moved on. */
  const readStatusOverrides = reactive<Record<string, ReadStatus>>({});
  /** Sample name -> data selection produced by downloading it. */
  const importedSamples = reactive<Record<string, string>>({});

  const openingKey = ref<string | null>(null);
  const openingProgress = ref(0);
  /** Synthetic study the user tried to open; drives the demo-entry dialog. */
  const demoEntry = ref<WorklistStudy | null>(null);

  const hasData = computed(
    () =>
      imageStore.idList.length > 0 ||
      Object.keys(dicomStore.volumeInfo).length > 0
  );

  const visible = computed(
    () => pinnedOpen.value || (!hasData.value && !dismissed.value)
  );

  // Closing the last study returns the reader to the worklist, the way
  // finishing a case does in a reading workstation.
  watch(hasData, (dataPresent, hadData) => {
    if (hadData && !dataPresent) dismissed.value = false;
  });

  /**
   * Rows built from DICOM tags of data the user has actually loaded. Priority
   * and reader are not carried in the image header, so they stay unset.
   */
  const loadedStudies = computed<WorklistStudy[]>(() =>
    Object.keys(dicomStore.studyInfo).map((studyKey) => {
      const study = dicomStore.studyInfo[studyKey];
      const patientKey = dicomStore.studyPatient[studyKey];
      const patient = dicomStore.patientInfo[patientKey];
      const volumes = [...(dicomStore.studyVolumes[studyKey] ?? [])]
        .map((key) => dicomStore.volumeInfo[key])
        .sort(
          (a, b) => Number(a.SeriesNumber ?? 0) - Number(b.SeriesNumber ?? 0)
        );
      const volumeKeys = volumes.map((volume) => volume.VolumeID);
      return {
        key: `loaded:${studyKey}`,
        origin: 'loaded' as const,
        patientName: patient?.PatientName ?? '',
        patientId: patient?.PatientID ?? '',
        patientBirthDate: patient?.PatientBirthDate ?? '',
        patientSex: patient?.PatientSex ?? '',
        accessionNumber: study.AccessionNumber ?? '',
        modality: primaryModality(volumes.map((volume) => volume.Modality)),
        description: study.StudyDescription || study.StudyID || '',
        bodyPart:
          volumes.find((volume) => volume.BodyPartExamined?.trim())
            ?.BodyPartExamined ?? '',
        studyDate: study.StudyDate ?? '',
        studyTime: study.StudyTime ?? '',
        seriesCount: volumes.length,
        imageCount: volumes.reduce(
          (total, volume) => total + (volume.NumberOfSlices ?? 0),
          0
        ),
        priority: 'routine' as const,
        readStatus: readStatusOverrides[`loaded:${studyKey}`] ?? 'unread',
        assignedReader: '',
        volumeKeys,
        series: volumes.map((volume) => ({
          key: volume.VolumeID,
          seriesNumber: volume.SeriesNumber ?? '',
          description: volume.SeriesDescription ?? '',
          modality: volume.Modality ?? '',
          imageCount: volume.NumberOfSlices ?? 0,
        })),
      };
    })
  );

  /**
   * Whether what a sample produced is still loaded: DICOM samples are tracked
   * by their study, plain image samples (.mha and friends) by their image.
   */
  function isImportLoaded(marker: string): boolean {
    if (marker in dicomStore.studyInfo) return true;
    return imageStore.idList.includes(marker);
  }

  /**
   * Whether a sample's data is already loaded, whichever entry point fetched
   * it. The sample browser reads this too, so the two lists agree on what has
   * been downloaded.
   */
  function isSampleLoaded(sampleName: string): boolean {
    const marker = importedSamples[sampleName];
    return !!marker && isImportLoaded(marker);
  }

  /** Whether a real DICOM row now stands in the list for what a sample loaded. */
  function isSampleReplacedByStudy(sampleName: string): boolean {
    const marker = importedSamples[sampleName];
    return !!marker && marker in dicomStore.studyInfo;
  }

  /**
   * The image a sample loaded, when it did not land in the DICOM hierarchy.
   * Plain-image samples (.mha and friends) grow no `loaded:` row of their own,
   * so their sample row stays and becomes the handle on the loaded data.
   */
  function loadedSampleImage(sampleName: string): string {
    const marker = importedSamples[sampleName];
    if (!marker || isSampleReplacedByStudy(sampleName)) return '';
    return imageStore.idList.includes(marker) ? marker : '';
  }

  /** Rows for downloadable sample datasets: real pixels, invented patients. */
  const sampleStudies = computed<WorklistStudy[]>(() => {
    if (dataBrowserStore.hideSampleData) return [];
    // A sample is struck off once a real study row stands in for it; closing
    // that study puts the sample row back.
    return SAMPLE_DATA.filter(
      (sample) => !isSampleReplacedByStudy(sample.name)
    ).flatMap((sample) => {
      const meta = SAMPLE_WORKLIST_METADATA[sample.name];
      if (!meta) return [];
      const key = `sample:${sample.name}`;
      // The dataset's own artwork stands in for the first series' thumbnail;
      // the rest have none until the study is downloaded.
      const series = meta.series.map((entry, index) => ({
        ...entry,
        key: `${key}:${index}`,
        ...(index === 0 ? { thumbnail: sample.image } : {}),
      }));
      const loadedImage = loadedSampleImage(sample.name);
      return [
        {
          ...meta,
          key,
          origin: 'sample' as const,
          studyDate: daysAgoToDicomDate(meta.daysAgo),
          studyTime: meta.time,
          readStatus: readStatusOverrides[key] ?? meta.readStatus,
          volumeKeys: loadedImage ? [loadedImage] : [],
          sample,
          series,
          ...seriesTotals(series),
        },
      ];
    });
  });

  /**
   * Fabricated rows, so the worklist reads like a real reading list. They are
   * demonstration content and follow the same switch as the sample datasets:
   * a build with sample data off shows only studies that can actually open.
   */
  const syntheticStudies = computed<WorklistStudy[]>(() => {
    if (dataBrowserStore.hideSampleData) return [];
    return WORKLIST_DEMO_STUDIES.map((demo) => {
      const series = demo.series.map((entry, index) => ({
        ...entry,
        key: `demo:${demo.key}:${index}`,
      }));
      return {
        ...demo,
        key: `demo:${demo.key}`,
        origin: 'synthetic' as const,
        studyDate: daysAgoToDicomDate(demo.daysAgo),
        studyTime: demo.time,
        readStatus: readStatusOverrides[`demo:${demo.key}`] ?? demo.readStatus,
        volumeKeys: [],
        series,
        ...seriesTotals(series),
      };
    });
  });

  const studies = computed<WorklistStudy[]>(() => [
    ...loadedStudies.value,
    ...sampleStudies.value,
    ...syntheticStudies.value,
  ]);

  const modalityOptions = computed(() => availableModalities(studies.value));

  const visibleStudies = computed(() =>
    sortStudies(filterStudies(studies.value, filters), sort.value)
  );

  const filtersActive = computed(() => isFilterActive(filters));

  // Resolved against every study, not the filtered view, so refining a search
  // does not yank the preview out from under the reader.
  const selectedStudy = computed(
    () => studies.value.find((study) => study.key === selectedKey.value) ?? null
  );

  const unreadCount = computed(
    () => studies.value.filter((study) => study.readStatus === 'unread').length
  );

  const statCount = computed(
    () =>
      studies.value.filter(
        (study) => study.priority === 'stat' && study.readStatus !== 'read'
      ).length
  );

  function select(key: string | null) {
    selectedKey.value = key;
  }

  function setSort(key: SortKey) {
    if (sort.value.key === key) {
      sort.value = {
        key,
        direction: sort.value.direction === 'asc' ? 'desc' : 'asc',
      };
    } else {
      // Dates read newest-first; everything else reads A-Z.
      sort.value = { key, direction: key === 'studyDateTime' ? 'desc' : 'asc' };
    }
  }

  function resetFilters() {
    Object.assign(filters, defaultFilters());
  }

  /**
   * Vuetify's clearable controls emit null when cleared; the filter model only
   * ever holds the empty form of its type.
   */
  function setFilter<K extends keyof WorklistFilters>(
    key: K,
    value: WorklistFilters[K] | null | undefined
  ) {
    filters[key] = value ?? defaultFilters()[key];
  }

  function setReadStatus(key: string, status: ReadStatus) {
    readStatusOverrides[key] = status;
  }

  /**
   * Records data a sample produced, whichever entry point downloaded it, so
   * the sample row gives way to the real study instead of doubling it up. A
   * multi-series sample is tracked by its study, so deleting one of its series
   * does not bring the sample row back alongside the study it still owns.
   */
  function noteSampleImported(sampleName: string, selection: string) {
    importedSamples[sampleName] =
      dicomStore.volumeStudy[selection] || selection;
  }

  /** Opening a study starts a read; it never regresses a finished one. */
  function markOpened(key: string, current: ReadStatus) {
    if (current === 'unread') setReadStatus(key, 'in-progress');
  }

  function show() {
    pinnedOpen.value = true;
  }

  function hide() {
    pinnedOpen.value = false;
    dismissed.value = true;
  }

  /** Data arrived by another route (URL params, drag and drop, DICOMweb). */
  function dismissForExternalLoad() {
    pinnedOpen.value = false;
    dismissed.value = true;
  }

  function dismissDemoEntry() {
    demoEntry.value = null;
  }

  async function openSample(study: WorklistStudy, sample: SampleDataset) {
    openingKey.value = study.key;
    openingProgress.value = 0;
    try {
      const volumeKey = await loadSampleData(sample, {
        progress: (percent) => {
          openingProgress.value = Number.isFinite(percent) ? percent * 100 : 0;
        },
      });
      // An import that yielded nothing displayable leaves the reader on the
      // worklist with an error, rather than on a viewer with no study in it.
      if (!volumeKey) {
        useMessageStore().addError('Study contains no displayable data');
        return;
      }
      const studyKey = dicomStore.volumeStudy[volumeKey];
      noteSampleImported(sample.name, volumeKey);
      // Only the row that actually owns the data changes status; a synthetic
      // row that borrowed a sample has still not been read.
      if (study.sample === sample) markOpened(study.key, study.readStatus);
      // The row the reader came from is now replaced by the real DICOM row, so
      // the reading they just started, and the preview, follow it there.
      if (studyKey) {
        const loadedKey = `loaded:${studyKey}`;
        markOpened(loadedKey, readStatusOverrides[loadedKey] ?? 'unread');
        if (selectedKey.value === study.key) selectedKey.value = loadedKey;
      }
      hide();
    } catch (error) {
      useMessageStore().addError('Failed to open study', {
        error: error as Error,
      });
    } finally {
      openingKey.value = null;
      openingProgress.value = 0;
    }
  }

  async function openStudy(study: WorklistStudy) {
    if (openingKey.value) return;

    // Pixels already in memory open instantly, whether they belong to a DICOM
    // study or to a sample that downloaded into the image store.
    const [firstVolume] = study.volumeKeys;
    if (firstVolume) {
      viewStore.setDataForAllViews(firstVolume);
      markOpened(study.key, study.readStatus);
      hide();
      return;
    }

    if (study.origin === 'loaded') return;

    if (study.sample) {
      await openSample(study, study.sample);
      return;
    }

    // Nothing to open: say so rather than doing nothing.
    demoEntry.value = study;
  }

  /** Opens the sample dataset offered as a stand-in for a synthetic row. */
  async function openDemoSubstitute(sample: SampleDataset) {
    if (openingKey.value) return;
    const study = demoEntry.value;
    demoEntry.value = null;
    if (!study) return;
    await openSample(study, sample);
  }

  return {
    filters,
    sort,
    selectedKey,
    selectedStudy,
    studies,
    visibleStudies,
    modalityOptions,
    filtersActive,
    unreadCount,
    statCount,
    visible,
    hasData,
    openingKey,
    openingProgress,
    demoEntry,
    select,
    setSort,
    resetFilters,
    setFilter,
    setReadStatus,
    noteSampleImported,
    isSampleLoaded,
    show,
    hide,
    dismissForExternalLoad,
    dismissDemoEntry,
    openStudy,
    openDemoSubstitute,
  };
});

export default useWorklistStore;
