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
  /** PatientID, empty when the data carries no patient identity. */
  patientKey: string;
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
  /**
   * Manual alignment nudge, in prior-study slices, kept per study pair and
   * per anatomical axis: a correction made on the axial pair is a number of
   * axial slices and says nothing about the coronal one.
   */
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
        patientKey: patient?.PatientID ?? '',
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
      patientKey: '',
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
    return ids.map(describeStudy).sort((a, b) => {
      // A study with no date is not a recent one: an imported image sorts
      // behind everything dated rather than ahead of it.
      if (!a.studyDate || !b.studyDate)
        return Number(!a.studyDate) - Number(!b.studyDate);
      return b.studyDate.localeCompare(a.studyDate);
    });
  });

  /**
   * The candidates a role may actually be filled with. A cine series has no
   * slices to align and renders a player rather than a slice view, so the
   * pickers offer it disabled — every other way of choosing a study reads this
   * list, so none of them can quietly disagree with the pickers.
   */
  const comparableCandidates = computed(() =>
    candidates.value.filter((study) => !study.isCine)
  );

  // Comparison mode follows the panes on screen rather than the remembered
  // layout name: loading a saved session restores the named views without
  // restoring `currentLayoutName`, so the name outlives what is displayed.
  const isComparisonLayout = computed(() =>
    viewStore.layoutViews.some((view) => !!comparisonPaneSpec(view?.name))
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

  /**
   * The role and axis a view is a comparison pane for, or null.
   *
   * The name says which axis the pane is for; the view says which axis it
   * actually shows. They agree in every layout the app builds, but a restored
   * manifest is taken at its word, and a pane whose name and orientation
   * disagree would have its slices mapped — and its counterparts drawn — along
   * an axis nobody is looking at. Better no pane than a wrong one, which is a
   * judgement everything that treats a view as a pane has to share: the pair,
   * the caption, the counterpart markers and the view-type switcher the pane
   * withholds all resolve a pane through here.
   */
  function paneSpecFor(viewID: Maybe<string>) {
    const view = viewStore.getView(viewID);
    const spec = comparisonPaneSpec(view?.name);
    if (!view || !spec) return null;
    if (view.type !== '2D' || view.options.orientation !== spec.axis)
      return null;
    return spec;
  }

  /**
   * Layout slots that participate in the comparison, with their study.
   *
   * The layout's own views, not the ones on screen: maximizing a pane hides
   * its partner but does not dissolve the pair, and a scroll made while one
   * pane fills the window must still move the study it is being compared
   * against.
   */
  const panes = computed<ComparisonPane[]>(() => {
    if (!active.value) return [];
    return viewStore.layoutViews.flatMap((view) => {
      const spec = paneSpecFor(view?.id);
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

  /**
   * The study a comparison pane is captioned with: its role's study, or
   * whatever the slot actually holds while a binding is still catching up.
   * Null for a view that is not a comparison pane, which is what tells the
   * banner and the overlay that makes room for it apart.
   */
  function paneStudyFor(viewID: Maybe<string>): StudyDescriptor | null {
    const view = viewStore.getView(viewID);
    const spec = paneSpecFor(viewID);
    if (!spec) return null;
    const roleStudy = spec.role === 'current' ? current.value : prior.value;
    if (view?.dataID && view.dataID !== roleStudy?.imageID)
      return describeStudy(view.dataID);
    return roleStudy;
  }

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
   * back to index alignment, the pair as a whole is reported that way. An
   * assessment describes how the panes are being mapped, so with no pane
   * taking part there is nothing to describe.
   */
  const alignment = computed<AlignmentAssessment | null>(() => {
    const assessments = axesInUse.value
      .map(alignmentForAxis)
      .filter((a): a is AlignmentAssessment => !!a);
    if (!assessments.length) return null;
    return assessments.find(({ mode }) => mode === 'index') ?? assessments[0];
  });

  /**
   * Two studies that name different patients cannot be compared by anatomy at
   * all, whatever their geometry says: identical protocols on two people
   * produce volumes that pass every frame-of-reference test here. Data with no
   * patient identity claims nothing either way.
   */
  const patientMismatch = computed(() => {
    const currentPatient = current.value?.patientKey;
    const priorPatient = prior.value?.patientKey;
    return (
      !!currentPatient && !!priorPatient && currentPatient !== priorPatient
    );
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

  const offsetKey = (axis: LPSAxis) =>
    pairKey.value ? `${pairKey.value}|${axis}` : null;

  function sliceOffsetFor(axis: LPSAxis) {
    const key = offsetKey(axis);
    return key ? (sliceOffsetByPair[key] ?? 0) : 0;
  }

  /**
   * The axis the nudge controls act on: the one the reader is working in,
   * falling back to the first pair on screen.
   */
  const nudgeAxis = computed<LPSAxis>(() => {
    const activeAxis = paneSpecFor(viewStore.activeView)?.axis;
    if (activeAxis && axesInUse.value.includes(activeAxis)) return activeAxis;
    return axesInUse.value[0] ?? 'Axial';
  });

  const sliceOffset = computed(() => sliceOffsetFor(nudgeAxis.value));

  function setSliceOffset(offset: number, axis: LPSAxis = nudgeAxis.value) {
    const key = offsetKey(axis);
    if (!key) return;
    sliceOffsetByPair[key] = clampValue(
      Math.round(offset),
      -MAX_SLICE_OFFSET,
      MAX_SLICE_OFFSET
    );
  }

  function nudgeSliceOffset(delta: number, axis: LPSAxis = nudgeAxis.value) {
    setSliceOffset(sliceOffsetFor(axis) + delta, axis);
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

    // A role may only hold a study the pickers would offer. Kind is read off
    // metadata that arrives with the pixels, so a series chosen while it looked
    // like a volume can turn out to be a cine, and the pair would go on mapping
    // slices into a pane that renders a player.
    const selectable = (id: Maybe<string>) =>
      !!id && comparableCandidates.value.some((study) => study.imageID === id);

    if (!selectable(currentImageID.value)) {
      // Whatever the reader was already looking at becomes the current study —
      // except the prior, which clicking its pane must not promote: closing the
      // current study should not silently make the comparison a self-comparison.
      const activeData = viewStore.getView(viewStore.activeView)?.dataID;
      const beingRead =
        activeData === priorImageID.value ? undefined : activeData;
      // A cine series has no slices to align and the picker refuses to offer
      // one, so it is no more a current study than it is a prior: a workspace
      // holding nothing else leaves the role empty and the bar unarmed. Cine
      // is dropped before the prior is set aside, so a cine series lying
      // around cannot stand in for the studies the reader could actually
      // fall back on.
      const usable = comparableCandidates.value;
      const pool = usable.filter(
        (study) => study.imageID !== priorImageID.value
      );
      const fallback = pool.length ? pool : usable;
      const readable = selectable(beingRead) ? beingRead : null;
      currentImageID.value = readable ?? fallback[0]?.imageID ?? null;
    }

    if (!currentImageID.value) {
      priorImageID.value = null;
      return;
    }

    if (
      selectable(priorImageID.value) &&
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
    patientMismatch,
    candidates,
    comparableCandidates,
    isComparisonLayout,
    active,
    current,
    prior,
    panes,
    axesInUse,
    alignment,
    priorInterval,
    pairKey,
    nudgeAxis,
    sliceOffset,
    sliceOffsetFor,
    allLinked,
    describeStudy,
    paneSpecFor,
    paneStudyFor,
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
