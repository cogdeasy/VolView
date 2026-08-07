import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import type { Maybe } from '@/src/types';
import type { LPSAxis } from '@/src/types/lps';
import type { ImageMetadata } from '@/src/types/image';
import { useViewStore } from '@/src/store/views';
import { useDICOMStore, getDisplayName } from '@/src/store/datasets-dicom';
import { useImageStore } from '@/src/store/datasets-images';
import { useImageCacheStore } from '@/src/store/image-cache';
import { isDicomImage } from '@/src/utils/dataSelection';
import { onImageDeleted } from '@/src/composables/onImageDeleted';
import { clampValue } from '@/src/utils';
import {
  comparisonPaneSpec,
  type ComparisonRole,
} from '@/src/core/comparison/layout';
import {
  assessAlignment,
  formatDicomDate,
  formatStudyInterval,
  parseDicomDate,
  type AlignmentAssessment,
} from '@/src/utils/comparison';

/** The three navigation channels the reader can link or unlink. */
export type ComparisonLink = 'slice' | 'windowLevel' | 'camera';

export interface StudyDescriptor {
  imageID: string;
  patientName: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  /** Raw DICOM DA value, empty when unknown. */
  studyDate: string;
  /** ISO date, or null when unknown. */
  displayDate: string | null;
  /** Groups series belonging to the same study. */
  studyKey: string;
  /** Cine series are poor comparison candidates, so they are never auto-picked. */
  isCine: boolean;
}

export interface ComparisonPane {
  viewID: string;
  imageID: string;
  role: ComparisonRole;
  axis: LPSAxis;
}

const UNKNOWN_PATIENT = 'Unknown patient';

/** How far the manual nudge may pull the prior study, in slices. */
export const MAX_SLICE_OFFSET = 50;

export const useComparisonStore = defineStore('comparison', () => {
  const viewStore = useViewStore();
  const dicomStore = useDICOMStore();
  const imageStore = useImageStore();
  const imageCacheStore = useImageCacheStore();

  const currentImageID = ref<Maybe<string>>(null);
  const priorImageID = ref<Maybe<string>>(null);
  const links = reactive<Record<ComparisonLink, boolean>>({
    slice: true,
    windowLevel: true,
    camera: true,
  });
  /** Manual alignment nudge, in prior-study slices, kept per study pair. */
  const sliceOffsetByPair = reactive<Record<string, number>>({});

  function describeStudy(imageID: string): StudyDescriptor {
    if (isDicomImage(imageID)) {
      const volume = dicomStore.volumeInfo[imageID];
      const studyKey = dicomStore.volumeStudy[imageID];
      const study = dicomStore.studyInfo[studyKey];
      const patientKey = dicomStore.studyPatient[studyKey];
      const patient = dicomStore.patientInfo[patientKey];
      const studyDate = study?.StudyDate ?? '';
      return {
        imageID,
        patientName: patient?.PatientName || UNKNOWN_PATIENT,
        studyDescription: study?.StudyDescription || 'Study',
        seriesDescription: volume ? getDisplayName(volume) : imageID,
        modality: volume?.Modality ?? '',
        studyDate,
        displayDate: formatDicomDate(studyDate),
        studyKey: studyKey ?? imageID,
        isCine: volume?.kind === 'cine',
      };
    }

    const metadata = imageCacheStore.getImageMetadata(imageID);
    return {
      imageID,
      patientName: UNKNOWN_PATIENT,
      studyDescription: 'Imported image',
      seriesDescription: metadata?.name ?? imageID,
      modality: '',
      studyDate: '',
      displayDate: null,
      studyKey: imageID,
      isCine: false,
    };
  }

  /**
   * Everything loaded that can act as a study in the pair, most recent first.
   */
  const candidates = computed<StudyDescriptor[]>(() => {
    const ids = [
      ...Object.keys(dicomStore.volumeInfo),
      ...imageStore.idList.filter((id) => !isDicomImage(id)),
    ];
    return ids
      .map(describeStudy)
      .sort((a, b) => b.studyDate.localeCompare(a.studyDate));
  });

  // Comparison mode follows the panes on screen rather than the remembered
  // layout name: loading a saved session restores the named views without
  // restoring `currentLayoutName`, so the name outlives what is displayed.
  const isComparisonLayout = computed(() =>
    viewStore.visibleViews.some((view) => !!comparisonPaneSpec(view?.name))
  );

  const current = computed(() =>
    currentImageID.value ? describeStudy(currentImageID.value) : null
  );
  const prior = computed(() =>
    priorImageID.value ? describeStudy(priorImageID.value) : null
  );

  const active = computed(
    () =>
      isComparisonLayout.value &&
      !!currentImageID.value &&
      !!priorImageID.value &&
      currentImageID.value !== priorImageID.value
  );

  /** Layout slots that participate in the comparison, with their study. */
  const panes = computed<ComparisonPane[]>(() => {
    if (!active.value) return [];
    return viewStore.visibleViews.flatMap((view) => {
      const spec = comparisonPaneSpec(view?.name);
      if (!view || !spec) return [];
      const imageID =
        spec.role === 'current' ? currentImageID.value : priorImageID.value;
      if (!imageID) return [];
      return [{ viewID: view.id, imageID, role: spec.role, axis: spec.axis }];
    });
  });

  const axesInUse = computed(() => [
    ...new Set(panes.value.map((pane) => pane.axis)),
  ]);

  function metadataFor(imageID: Maybe<string>): ImageMetadata | null {
    return imageCacheStore.getImageMetadata(imageID) ?? null;
  }

  function alignmentForAxis(axis: LPSAxis): AlignmentAssessment | null {
    const currentMetadata = metadataFor(currentImageID.value);
    const priorMetadata = metadataFor(priorImageID.value);
    if (!currentMetadata || !priorMetadata) return null;
    return assessAlignment(currentMetadata, priorMetadata, axis);
  }

  /**
   * Worst-case assessment across the axes on screen: if any pane has to fall
   * back to index alignment, the pair as a whole is reported that way.
   */
  const alignment = computed<AlignmentAssessment | null>(() => {
    const axes = axesInUse.value.length
      ? axesInUse.value
      : (['Axial'] as LPSAxis[]);
    const assessments = axes
      .map(alignmentForAxis)
      .filter((a): a is AlignmentAssessment => !!a);
    if (!assessments.length) return null;
    return assessments.find(({ mode }) => mode === 'index') ?? assessments[0];
  });

  /** "6 months earlier" style label for the prior study. */
  const priorInterval = computed(() =>
    formatStudyInterval(current.value?.studyDate, prior.value?.studyDate)
  );

  const pairKey = computed(() =>
    currentImageID.value && priorImageID.value
      ? `${currentImageID.value}|${priorImageID.value}`
      : null
  );

  const sliceOffset = computed(() =>
    pairKey.value ? (sliceOffsetByPair[pairKey.value] ?? 0) : 0
  );

  function setSliceOffset(offset: number) {
    if (!pairKey.value) return;
    sliceOffsetByPair[pairKey.value] = clampValue(
      Math.round(offset),
      -MAX_SLICE_OFFSET,
      MAX_SLICE_OFFSET
    );
  }

  function nudgeSliceOffset(delta: number) {
    setSliceOffset(sliceOffset.value + delta);
  }

  function setCurrentImageID(imageID: Maybe<string>) {
    if (imageID && imageID === priorImageID.value) {
      priorImageID.value = currentImageID.value;
    }
    currentImageID.value = imageID;
  }

  function setPriorImageID(imageID: Maybe<string>) {
    if (imageID && imageID === currentImageID.value) {
      currentImageID.value = priorImageID.value;
    }
    priorImageID.value = imageID;
  }

  function swap() {
    const previousCurrent = currentImageID.value;
    currentImageID.value = priorImageID.value;
    priorImageID.value = previousCurrent;
  }

  function setLink(link: ComparisonLink, value: boolean) {
    links[link] = value;
  }

  const allLinked = computed(() =>
    (Object.keys(links) as ComparisonLink[]).every((link) => links[link])
  );

  function setAllLinks(value: boolean) {
    (Object.keys(links) as ComparisonLink[]).forEach((link) => {
      links[link] = value;
    });
  }

  /**
   * Picks the newest study as current and the newest older one as prior.
   * Datasets without a study date fall back to load order.
   */
  function autoSelectStudies() {
    const available = candidates.value;
    if (!available.length) return;

    const stillLoaded = (id: Maybe<string>) =>
      !!id && available.some((study) => study.imageID === id);

    if (!stillLoaded(currentImageID.value)) {
      // Whatever the reader was already looking at becomes the current study —
      // except the prior, which clicking its pane must not promote: closing the
      // current study should not silently make the comparison a self-comparison.
      const activeData = viewStore.getView(viewStore.activeView)?.dataID;
      const beingRead =
        activeData === priorImageID.value ? undefined : activeData;
      const pool = available.filter(
        (study) => study.imageID !== priorImageID.value
      );
      const fallback = pool.length ? pool : available;
      const newest = fallback.find((study) => !study.isCine) ?? fallback[0];
      currentImageID.value = stillLoaded(beingRead)
        ? beingRead
        : newest.imageID;
    }

    if (
      stillLoaded(priorImageID.value) &&
      priorImageID.value !== currentImageID.value
    )
      return;

    const currentStudy = available.find(
      (study) => study.imageID === currentImageID.value
    );
    const currentTime = parseDicomDate(currentStudy?.studyDate)?.getTime();
    const others = available.filter(
      (study) => study.imageID !== currentImageID.value
    );
    const notNewer = (study: StudyDescriptor) => {
      const time = parseDicomDate(study.studyDate)?.getTime();
      return currentTime == null || time == null || time <= currentTime;
    };
    // A different study is a far better prior than another series of the
    // study being read, so it wins even when the dates are unhelpful. A cine
    // series is never a prior at all: the picker will not let the reader
    // choose one, and it has no slices to align.
    const preference = [
      (study: StudyDescriptor) =>
        study.studyKey !== currentStudy?.studyKey &&
        !study.isCine &&
        notNewer(study),
      (study: StudyDescriptor) =>
        study.studyKey !== currentStudy?.studyKey && !study.isCine,
      (study: StudyDescriptor) => !study.isCine,
    ];
    priorImageID.value =
      preference.reduce<Maybe<StudyDescriptor>>(
        (found, predicate) => found ?? others.find(predicate),
        null
      )?.imageID ?? null;
  }

  // A study that is gone can no longer be a side of the pair, and its nudge
  // has nothing left to align.
  onImageDeleted((deletedIDs) => {
    const deleted = new Set(deletedIDs);
    if (currentImageID.value && deleted.has(currentImageID.value))
      currentImageID.value = null;
    if (priorImageID.value && deleted.has(priorImageID.value))
      priorImageID.value = null;
    Object.keys(sliceOffsetByPair)
      .filter((key) => key.split('|').some((id) => deleted.has(id)))
      .forEach((key) => {
        delete sliceOffsetByPair[key];
      });
  });

  // Keep the pair pointing at loaded data while the reader is comparing.
  watch(
    [isComparisonLayout, candidates],
    ([inLayout]) => {
      if (!inLayout) return;
      autoSelectStudies();
    },
    { immediate: true }
  );

  return {
    currentImageID,
    priorImageID,
    links,
    sliceOffsetByPair,
    candidates,
    isComparisonLayout,
    active,
    current,
    prior,
    panes,
    axesInUse,
    alignment,
    priorInterval,
    pairKey,
    sliceOffset,
    allLinked,
    describeStudy,
    metadataFor,
    alignmentForAxis,
    setSliceOffset,
    nudgeSliceOffset,
    setCurrentImageID,
    setPriorImageID,
    swap,
    setLink,
    setAllLinks,
    autoSelectStudies,
  };
});

export default useComparisonStore;
