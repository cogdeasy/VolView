import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { Maybe } from '@/src/types';
import { useViewStore } from '@/src/store/views';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useWindowingStore } from '@/src/store/view-configs/windowing';
import { useImageStatsStore } from '@/src/store/image-stats';
import useViewSliceStore from '@/src/store/view-configs/slicing';
import useVolumeColoringStore from '@/src/store/view-configs/volume-coloring';
import { isDicomImage } from '@/src/utils/dataSelection';
import { isCineImage } from '@/src/core/cine/isCineImage';
import { onImageDeleted } from '@/src/composables/onImageDeleted';
import { layoutToConfig } from '@/src/utils/layoutParsing';
import { DefaultNamedLayouts } from '@/src/config';
import { findNamedLayout } from '@/src/core/hanging-protocols/describe';
import { getImageData } from '@/src/composables/useCurrentImage';
import { PresetNameList } from '@/src/vtk/ColorMaps';
import {
  emptyStudyContext,
  focusedModule as focusedModuleSchema,
  hangingProtocol,
  type AutoRangeKey,
  type FocusedModule,
  type HangingProtocol,
  type OverlaysSpec,
  type StudyContext,
} from '@/src/core/hanging-protocols/types';
import { BUILT_IN_PROTOCOLS } from '@/src/core/hanging-protocols/seeds';
import {
  explainSelection,
  selectProtocol,
  type CriterionResult,
  type SelectionReason,
} from '@/src/core/hanging-protocols/matching';
import {
  getWindowLevelPreset,
  findWindowLevelPreset,
} from '@/src/core/hanging-protocols/windowPresets';
import {
  cloneProtocol,
  parseProtocols,
  serializeProtocols,
} from '@/src/core/hanging-protocols/serialization';

const STORAGE_KEY = 'hangingProtocols';
const SETTINGS_KEY = 'hangingProtocolSettings';

interface Settings {
  defaultProtocolId: string | null;
  autoApply: boolean;
  /** studyInstanceUID -> protocol id the reader picked by hand. */
  overrides: Record<string, string>;
}

const defaultSettings = (): Settings => ({
  defaultProtocolId: null,
  autoApply: true,
  overrides: {},
});

/**
 * A reader accumulates overrides forever otherwise: every study they ever
 * hung by hand would sit in local storage. Insertion order is stable for the
 * string keys used here, so the oldest pins fall off first.
 */
export const MAX_REMEMBERED_OVERRIDES = 200;

export function rememberOverride(
  overrides: Record<string, string>,
  studyUID: string,
  protocolId: string
): Record<string, string> {
  const entries = Object.entries(overrides).filter(([key]) => key !== studyUID);
  entries.push([studyUID, protocolId]);
  return Object.fromEntries(entries.slice(-MAX_REMEMBERED_OVERRIDES));
}

const cloneBuiltIns = () =>
  BUILT_IN_PROTOCOLS.map((protocol) => cloneProtocol(protocol));

export function readStoredProtocols(raw: string): HangingProtocol[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneBuiltIns();
    // An empty list is a list the reader emptied on purpose; only an unusable
    // stored value falls back to the shipped protocols.
    const kept = parsed
      .map((entry) => hangingProtocol.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data);
    // A stored list that had entries but kept none is a schema the code no
    // longer understands, not a reader's choice: leaving them with nothing at
    // all would be worse than the shipped protocols.
    return kept.length || !parsed.length ? kept : cloneBuiltIns();
  } catch {
    return cloneBuiltIns();
  }
}

/**
 * Protocols live in local storage, which is per-browser. A per-user profile
 * that follows the reader between workstations would live server-side: the
 * VolView server (`server/`) would grow a `hanging_protocols` RPC pair
 * (list/save) keyed by the authenticated user, and this store would hydrate
 * from it and write through, keeping local storage as the offline cache.
 */
const protocolStorage = () =>
  useLocalStorage<HangingProtocol[]>(STORAGE_KEY, cloneBuiltIns(), {
    serializer: {
      read: readStoredProtocols,
      write: (value: HangingProtocol[]) => JSON.stringify(value),
    },
  });

export interface AppliedProtocolInfo {
  /** Null when nothing matched and the viewer defaults are in use. */
  protocolId: string | null;
  reason: SelectionReason;
  criteria: CriterionResult[];
  explanation: string;
  studyInstanceUID: string;
  /**
   * The image this report is about. Not always the one in the active pane:
   * the indicator keeps describing whatever hung the panes while the reader
   * focuses another series, and acting on the focused image instead would
   * un-pin, or re-hang, a study the reader is not being told about.
   */
  imageID: string | null;
}

export const useHangingProtocolStore = defineStore('hangingProtocol', () => {
  const protocols = protocolStorage();
  const settings = useLocalStorage<Settings>(SETTINGS_KEY, defaultSettings(), {
    mergeDefaults: true,
  });

  // Runtime display state a protocol drives. Not persisted: it always follows
  // whichever protocol is currently applied.
  const defaultOverlays = (): OverlaysSpec => ({
    viewLabels: true,
    annotations: true,
  });
  const overlays = ref<OverlaysSpec>(defaultOverlays());
  const focusedModule = ref<Maybe<FocusedModule>>(null);
  /**
   * Bumped every time a protocol asks for a panel, so two studies hung by the
   * same protocol both move the reader back to it.
   */
  const focusRequest = ref(0);
  /**
   * The side panel the reader actually has open, published by the module
   * panel. `focusedModule` is only ever what the last protocol asked for, so
   * capturing the current view needs this instead. Panels a protocol cannot
   * name leave it alone: the capture then keeps the last one it can express.
   */
  const openModule = ref<Maybe<FocusedModule>>(null);

  function noteOpenModule(name: string) {
    const parsed = focusedModuleSchema.safeParse(name);
    if (parsed.success) openModule.value = parsed.data;
  }

  const applied = ref<Maybe<AppliedProtocolInfo>>(null);
  const indicatorDismissed = ref(false);
  /**
   * Images whose presentation came from a restored session. Their layout and
   * view configs were saved by the reader and must not be re-hung.
   */
  const restoredImages = ref(new Set<string>());
  /**
   * Images a protocol has actually hung in this tab, mapped to the protocol
   * that hung them, however it was chosen. The phases that need pixel data run
   * later, and only for these: a study the store merely reported on is showing
   * whatever the reader arranged. Holding the protocol per image, rather than
   * reading the globally applied one, keeps those late phases writing this
   * study's settings even if the reader has moved on to another study.
   */
  const hungImages = ref(new Map<string, AppliedProtocolInfo>());
  /**
   * The last study the reader hung by hand, with a counter so that hanging the
   * same study twice is still two events. Watched by the auto-apply composable,
   * which owns the timing of the deferred phases.
   */
  const manualApply = ref<Maybe<{ imageID: string; tick: number }>>(null);
  /** Whether the protocol manager dialog is open. */
  const managerOpen = ref(false);

  const appliedProtocol = computed(
    () =>
      protocols.value.find(
        (protocol) => protocol.id === applied.value?.protocolId
      ) ?? null
  );

  const getProtocol = (id: Maybe<string>) =>
    protocols.value.find((protocol) => protocol.id === id) ?? null;

  // --- study context --- //

  function getStudyContext(imageID: Maybe<string>): StudyContext {
    const context = emptyStudyContext();
    if (!imageID || !isDicomImage(imageID)) return context;

    const dicomStore = useDICOMStore();
    const volume = dicomStore.volumeInfo[imageID];
    if (!volume) return context;

    const studyKey = dicomStore.volumeStudy[imageID];
    const study = studyKey ? dicomStore.studyInfo[studyKey] : undefined;

    return {
      modality: volume.Modality ?? '',
      bodyPart: volume.BodyPartExamined ?? '',
      studyDescription: study?.StudyDescription ?? '',
      seriesDescription: volume.SeriesDescription ?? '',
      // The series of this study loaded into the session, which is all the
      // viewer knows about: nothing here has seen the study in the archive.
      seriesCount: studyKey
        ? (dicomStore.studyVolumes[studyKey]?.length ?? 0)
        : 0,
    };
  }

  const getStudyUID = (imageID: Maybe<string>) => {
    if (!imageID || !isDicomImage(imageID)) return '';
    const dicomStore = useDICOMStore();
    return dicomStore.volumeStudy[imageID] ?? '';
  };

  // --- applying --- //

  interface ApplyOptions {
    /** Leave alone anything the reader has already adjusted by hand. */
    keepReaderEdits?: boolean;
  }

  /**
   * What the protocol itself last wrote, per view and image. The windowing
   * store records who wrote a config; the slice and coloring stores do not, so
   * the protocol remembers its own writes and treats anything else it finds as
   * the reader's.
   */
  const protocolSlices = new Map<string, number>();
  const protocolPresets = new Map<string, string>();
  const writeKey = (viewID: string, imageID: string) => `${viewID}::${imageID}`;

  /**
   * Slice and oblique views window; a volume view has no windowing config, and
   * writing one only leaves a stray entry in the saved session.
   */
  const windowedViewIDs = (views: { id: string; type: string }[]) =>
    views.filter((view) => view.type !== '3D').map((view) => view.id);

  function applyWindowLevel(
    protocol: HangingProtocol,
    viewIDs: string[],
    imageID: string,
    options?: ApplyOptions
  ) {
    const windowingStore = useWindowingStore();
    const spec = protocol.windowLevel;

    // Every view is written even though windowing sync mirrors the first one:
    // sync can be off, and a handful of views makes the redundancy cheap.
    // `userTriggered` is left alone: a protocol window is not a reader edit.
    viewIDs.forEach((viewID) => {
      // A window the reader set by hand outranks the protocol's. This only
      // comes up in the deferred phases: a study can stream for a minute, and
      // a window adjusted while it does must survive the data arriving.
      if (
        options?.keepReaderEdits &&
        windowingStore.getConfig(viewID, imageID)?.userTriggered
      ) {
        return;
      }
      if (spec.kind === 'dicom') {
        windowingStore.resetConfig(viewID, imageID);
        return;
      }
      if (spec.kind === 'auto') {
        windowingStore.updateConfig(viewID, imageID, {
          auto: spec.auto as AutoRangeKey,
          useAuto: true,
        });
        return;
      }
      const preset =
        spec.kind === 'preset' ? getWindowLevelPreset(spec.preset) : spec;
      if (!preset) return;
      // `useAuto: false` is what keeps the auto-range machinery from
      // overwriting the window the protocol asked for.
      windowingStore.updateConfig(viewID, imageID, {
        width: preset.width,
        level: preset.level,
        useAuto: false,
      });
    });
  }

  function applyVolumeColoring(
    protocol: HangingProtocol,
    viewIDs: string[],
    imageID: string,
    options?: ApplyOptions
  ) {
    if (!protocol.volume.preset) return;
    // The coloring store needs the image data to compute a mapping range.
    if (!getImageData(imageID)) return;

    // An imported protocol can name a preset this build does not have; the
    // coloring store would throw on it.
    if (!PresetNameList.includes(protocol.volume.preset)) return;

    const coloringStore = useVolumeColoringStore();
    viewIDs.forEach((viewID) => {
      const key = writeKey(viewID, imageID);
      // A preset the reader picked after the protocol set one outranks it.
      if (options?.keepReaderEdits) {
        const written = protocolPresets.get(key);
        const current = coloringStore.getConfig(viewID, imageID)
          ?.transferFunction.preset;
        if (written !== undefined && current !== written) return;
      }
      coloringStore.setColorPreset(viewID, imageID, protocol.volume.preset);
      protocolPresets.set(key, protocol.volume.preset);
      const config = coloringStore.getConfig(viewID, imageID);
      // Shift only applies to point-based opacity functions, which is what the
      // medical presets use.
      if (config?.opacityFunction && 'shift' in config.opacityFunction) {
        coloringStore.updateOpacityFunction(viewID, imageID, {
          shift: protocol.volume.opacityShift,
        });
      }
    });
  }

  function applySlicePolicy(
    protocol: HangingProtocol,
    viewIDs: string[],
    imageID: string,
    options?: ApplyOptions
  ) {
    if (protocol.slicePolicy === 'preserve') return;
    // Without the pixel data the slice bounds are the placeholder 0..1, so a
    // write here would store a slice that means nothing and would be saved
    // into the session if the reader saved in that window. The policy runs
    // again once the image has loaded.
    if (!getImageData(imageID)) return;
    const sliceStore = useViewSliceStore();
    viewIDs.forEach((viewID) => {
      const key = writeKey(viewID, imageID);
      // A slice the reader scrolled to during a long load outranks the policy.
      // Nothing else writes a slice config unprompted, so a stored slice that
      // is not the one the protocol left there is theirs.
      if (options?.keepReaderEdits) {
        const stored = sliceStore.configs[viewID]?.[imageID];
        if (stored && stored.slice !== protocolSlices.get(key)) return;
      }
      if (protocol.slicePolicy === 'middle') {
        sliceStore.resetSlice(viewID, imageID);
      } else {
        const config = sliceStore.getConfig(viewID, imageID);
        sliceStore.updateConfig(viewID, imageID, { slice: config.min });
      }
      protocolSlices.set(key, sliceStore.getConfig(viewID, imageID).slice);
    });
  }

  /** Forgets the protocol's own writes for an image that has gone away. */
  function forgetWrites(imageID: string) {
    const suffix = `::${imageID}`;
    [protocolSlices, protocolPresets].forEach((record) => {
      [...record.keys()]
        .filter((key) => key.endsWith(suffix))
        .forEach((key) => record.delete(key));
    });
  }

  /**
   * The panes this study is actually in. The layout's own views, not the
   * visible ones: with a pane maximized, `visibleViews` is that pane alone and
   * the rest would keep whatever settings they had before. Panes the reader
   * bound to another series are left out — a config written under that view
   * and this image shows nothing but is still saved into the session.
   */
  const viewsShowing = (imageID: string) =>
    useViewStore().layoutViews.filter((view) => view.dataID === imageID);

  function applyToViews(
    protocol: HangingProtocol,
    views: { id: string; type: string }[],
    imageID: string,
    options?: ApplyOptions
  ) {
    applyWindowLevel(protocol, windowedViewIDs(views), imageID, options);
    // A cine clip is scrubbed by frame and never volume rendered, whatever
    // pane it lands in: a slice or coloring config written for one is read by
    // nothing and is still saved into the session.
    if (isCineImage(imageID)) return;
    applyVolumeColoring(
      protocol,
      views.filter((view) => view.type === '3D').map((view) => view.id),
      imageID,
      options
    );
    applySlicePolicy(
      protocol,
      views.filter((view) => view.type === '2D').map((view) => view.id),
      imageID,
      options
    );
  }

  /**
   * Hangs the study: layout first (which can replace views), then everything
   * that is keyed by view id.
   */
  function applyProtocol(protocol: HangingProtocol, imageID: Maybe<string>) {
    const viewStore = useViewStore();
    // Name the layout only when it really is one of the named ones, so the
    // layout selector highlights it (and never highlights a bogus entry).
    viewStore.setLayoutFromConfig(
      protocol.layout,
      findNamedLayout(protocol.layout, DefaultNamedLayouts)
    );

    if (imageID) {
      // A protocol with more views than the previous layout gets fresh, unbound
      // views; without this they hang as empty panes.
      viewStore.layoutViews
        .filter((view) => !view.dataID)
        .forEach((view) => viewStore.setDataForView(view.id, imageID));
      applyToViews(protocol, viewsShowing(imageID), imageID);
    }

    overlays.value = { ...protocol.overlays };
    focusedModule.value = protocol.focusedModule;
    focusRequest.value += 1;
  }

  /** Nothing is hanging this study: the chrome goes back to viewer defaults. */
  function resetPresentationChrome() {
    overlays.value = defaultOverlays();
    focusedModule.value = null;
  }

  /**
   * The chrome a protocol owns, without the panel focus jump. Used when the
   * reader comes back to a study that is already hung: what is on screen must
   * agree with the protocol the indicator names, but the side panel should not
   * move under them.
   */
  function setPresentationChrome(protocol: HangingProtocol) {
    overlays.value = { ...protocol.overlays };
    focusedModule.value = protocol.focusedModule;
  }

  /**
   * Protocols match DICOM attributes, so a plain volume — an NRRD, a sample
   * image, a model — has nothing to match and gets no indicator at all.
   */
  const isMatchable = (imageID: Maybe<string>) =>
    !!imageID && isDicomImage(imageID);

  /** The protocol that hung this image in this tab, if one did. */
  const hungProtocolId = (imageID: Maybe<string>) =>
    (imageID && hungImages.value.get(imageID)?.protocolId) || null;

  /**
   * Re-runs the parts of this image's protocol that need pixel data: the window
   * (an auto window needs the histogram, and a slice view that mounts before
   * the histogram exists pins the config to the placeholder W/L of 1 / 0.5),
   * the volume preset (which needs a scalar range) and the slice policy (which
   * needs the image dimensions). Called once the image finishes loading, and
   * again once the auto ranges are computed. A study nothing has hung — or
   * whose protocol has since been deleted — is left as it is.
   */
  function applyLoadedImageSettings(imageID: Maybe<string>) {
    const protocol = getProtocol(hungProtocolId(imageID));
    if (!protocol || !imageID) return;
    applyToViews(protocol, viewsShowing(imageID), imageID, {
      keepReaderEdits: true,
    });
  }

  /**
   * Re-runs only the window, for when the histogram arrives after the image
   * has already been finalized.
   */
  function applyAppliedWindowLevel(imageID: Maybe<string>) {
    const protocol = getProtocol(hungProtocolId(imageID));
    if (!protocol || !imageID) return;
    applyWindowLevel(
      protocol,
      windowedViewIDs(viewsShowing(imageID)),
      imageID,
      { keepReaderEdits: true }
    );
  }

  /** Whether the histogram-derived ranges an auto window needs are ready. */
  function autoRangesReady(imageID: Maybe<string>) {
    if (!imageID) return false;
    return (
      Object.keys(useImageStatsStore().getAutoRangeValues(imageID)).length > 0
    );
  }

  /**
   * Records that this image's presentation was restored from a saved session,
   * so opening it must not re-hang it.
   */
  function noteRestoredPresentation(imageIDs: string[]) {
    imageIDs.forEach((imageID) => restoredImages.value.add(imageID));
  }

  /** True if the image's presentation came from a restored session. */
  function reportRestoredPresentation(imageID: Maybe<string>) {
    // The mark is kept, not consumed: navigating away from a restored study
    // and back to it must not hang it either. Applying a protocol by hand
    // clears it.
    if (!imageID || !restoredImages.value.has(imageID)) return false;
    resetPresentationChrome();
    if (!isMatchable(imageID)) {
      applied.value = null;
      return true;
    }
    applied.value = {
      protocolId: null,
      reason: 'restored',
      criteria: [],
      explanation:
        'This study was restored from a saved session, so its saved layout ' +
        'and window are in use instead of a protocol.',
      studyInstanceUID: getStudyUID(imageID),
      imageID,
    };
    indicatorDismissed.value = false;
    return true;
  }

  /**
   * Matches the study against the protocol list and hangs the winner.
   * Returns the protocol that was applied, if any.
   */
  function applyForImage(
    imageID: Maybe<string>,
    options?: { force?: boolean }
  ) {
    /**
     * No protocol hangs this study any more. The record has to go with it:
     * it is what the deferred phases write from and what the indicator names
     * on a revisit, so leaving it would let a protocol the reader has just
     * un-pinned keep claiming — and re-adjusting — the study.
     */
    const nothingHangsIt = () => {
      if (imageID) hungImages.value.delete(imageID);
      applied.value = null;
      resetPresentationChrome();
      return null;
    };

    if (!settings.value.autoApply && !options?.force) {
      // Nothing hangs this study, so the previous study's protocol must not
      // linger in the indicator, the chrome or the after-load phase.
      return nothingHangsIt();
    }

    if (!isMatchable(imageID)) return nothingHangsIt();

    const context = getStudyContext(imageID);
    const studyUID = getStudyUID(imageID);
    const selection = selectProtocol(protocols.value, context, {
      overrideId: studyUID ? settings.value.overrides[studyUID] : null,
      defaultId: settings.value.defaultProtocolId,
    });

    if (!selection.protocol) {
      // Still report the outcome: the reader needs to know the study was not
      // hung by a protocol, and needs one click to pick one.
      if (imageID) hungImages.value.delete(imageID);
      resetPresentationChrome();
      applied.value = {
        protocolId: null,
        reason: 'none',
        criteria: [],
        explanation: explainSelection(selection),
        studyInstanceUID: studyUID,
        imageID: imageID ?? null,
      };
      indicatorDismissed.value = false;
      return null;
    }

    applyProtocol(selection.protocol, imageID);
    const report: AppliedProtocolInfo = {
      protocolId: selection.protocol.id,
      reason: selection.reason,
      criteria: selection.criteria,
      explanation: explainSelection(selection),
      studyInstanceUID: studyUID,
      imageID: imageID ?? null,
    };
    if (imageID) hungImages.value.set(imageID, report);
    applied.value = report;
    indicatorDismissed.value = false;
    return selection.protocol;
  }

  /**
   * Points the indicator at the protocol this study would get, without
   * touching the views. Used when the reader comes back to a study that was
   * already hung: the arrangement they have made since is theirs to keep.
   */
  function reportForImage(imageID: Maybe<string>) {
    // With automatic hanging off, or on data that cannot match, no protocol
    // owns this study — and the previous study's must not be left on screen.
    if (!settings.value.autoApply || !isMatchable(imageID)) {
      applied.value = null;
      resetPresentationChrome();
      return;
    }
    // What actually hung this study outranks what the rules would pick now:
    // the reader may have hand-picked a protocol selection would not choose,
    // or edited the rules since, and the pill and the chrome have to agree
    // with the layout and window on screen.
    const recorded = imageID ? hungImages.value.get(imageID) : null;
    const hungProtocol = getProtocol(recorded?.protocolId);
    if (recorded && hungProtocol) {
      setPresentationChrome(hungProtocol);
      applied.value = recorded;
      indicatorDismissed.value = false;
      return;
    }

    const studyUID = getStudyUID(imageID);
    const selection = selectProtocol(
      protocols.value,
      getStudyContext(imageID),
      {
        overrideId: studyUID ? settings.value.overrides[studyUID] : null,
        defaultId: settings.value.defaultProtocolId,
      }
    );
    // The overlay flags and the focused module are global runtime state, so a
    // study viewed in between will have left its own behind. Put back the ones
    // belonging to the protocol the indicator is about to name.
    if (selection.protocol) setPresentationChrome(selection.protocol);
    else resetPresentationChrome();
    applied.value = {
      protocolId: selection.protocol?.id ?? null,
      reason: selection.reason,
      criteria: selection.criteria,
      explanation: explainSelection(selection),
      studyInstanceUID: studyUID,
      imageID: imageID ?? null,
    };
    indicatorDismissed.value = false;
  }

  /** Reader picked a protocol by hand; remember it for this study. */
  function applyManually(protocolId: string, imageID: Maybe<string>) {
    const protocol = getProtocol(protocolId);
    if (!protocol) return;

    // The reader has overruled whatever a restored session set up.
    if (imageID) restoredImages.value.delete(imageID);

    const studyUID = getStudyUID(imageID);
    // Only a protocol that selection would honour later is worth remembering.
    if (studyUID && protocol.enabled) {
      settings.value.overrides = rememberOverride(
        settings.value.overrides,
        studyUID,
        protocolId
      );
    }

    applyProtocol(protocol, imageID);
    const report: AppliedProtocolInfo = {
      protocolId,
      reason: 'override',
      criteria: [],
      explanation: `${protocol.name} was applied manually${
        studyUID && protocol.enabled ? ' and will be reused for this study' : ''
      }.`,
      studyInstanceUID: studyUID,
      imageID: imageID ?? null,
    };
    if (imageID) {
      hungImages.value.set(imageID, report);
      // A study picked mid-load still owes its volume preset, slice position
      // and window; announcing the apply is what gets those phases scheduled.
      manualApply.value = {
        imageID,
        tick: (manualApply.value?.tick ?? 0) + 1,
      };
    }
    applied.value = report;
    indicatorDismissed.value = false;
  }

  function clearOverride(imageID: Maybe<string>) {
    const studyUID = getStudyUID(imageID);
    if (!studyUID) return;
    settings.value.overrides = Object.fromEntries(
      Object.entries(settings.value.overrides).filter(
        ([key]) => key !== studyUID
      )
    );
  }

  // --- authoring --- //

  const nextId = () =>
    `protocol-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  /**
   * Snapshots what is on screen right now as a new protocol. This is the
   * "save current layout as protocol" affordance.
   */
  function captureCurrentState(
    name: string,
    imageID: Maybe<string>
  ): HangingProtocol {
    const viewStore = useViewStore();
    const windowingStore = useWindowingStore();
    const coloringStore = useVolumeColoringStore();

    // The layout itself, not the visible one: maximizing a view collapses the
    // visible layout to that single pane, and capturing then would store a
    // one-view protocol instead of the arrangement the reader built.
    const slotViews = viewStore.layoutViews;
    const layout = layoutToConfig(
      viewStore.layout,
      (slotIndex) => viewStore.getViewForSlot(slotIndex) ?? undefined
    );

    // The window comes from a view that has one. A volume view is never
    // windowed, so with the 3D pane active the store would hand back a
    // synthesized default and the protocol would record a window the reader
    // never chose.
    const activeView = slotViews.find(
      (view) => view.id === viewStore.activeView
    );
    const windowedView =
      activeView && activeView.type !== '3D'
        ? activeView
        : slotViews.find((view) => view.type !== '3D');
    const wlConfig =
      windowedView && imageID
        ? windowingStore.getConfig(windowedView.id, imageID)
        : null;
    const matchedPreset =
      wlConfig?.width !== undefined && wlConfig?.level !== undefined
        ? findWindowLevelPreset(wlConfig.width, wlConfig.level)
        : undefined;

    let windowLevel: HangingProtocol['windowLevel'] = { kind: 'dicom' };
    if (wlConfig?.useAuto) {
      windowLevel = { kind: 'auto', auto: wlConfig.auto };
    } else if (matchedPreset) {
      windowLevel = { kind: 'preset', preset: matchedPreset.id };
    } else if (wlConfig?.width !== undefined && wlConfig.level !== undefined) {
      windowLevel = {
        kind: 'manual',
        width: wlConfig.width,
        level: wlConfig.level,
      };
    }

    const volumeView = slotViews.find((view) => view.type === '3D');
    const volumeConfig =
      volumeView && imageID
        ? coloringStore.getConfig(volumeView.id, imageID)
        : null;
    const opacityFunction = volumeConfig?.opacityFunction;

    const context = getStudyContext(imageID);

    return {
      id: nextId(),
      name,
      description: 'Captured from the current view.',
      builtIn: false,
      enabled: true,
      layout,
      windowLevel,
      volume: {
        preset: volumeConfig?.transferFunction.preset ?? '',
        opacityShift:
          opacityFunction && 'shift' in opacityFunction
            ? opacityFunction.shift
            : 0,
      },
      slicePolicy: 'middle',
      overlays: { ...overlays.value },
      focusedModule: openModule.value ?? focusedModule.value ?? 'Data',
      match: {
        ...(context.modality ? { modality: [context.modality] } : {}),
        ...(context.bodyPart ? { bodyPart: [context.bodyPart] } : {}),
      },
    };
  }

  /**
   * A protocol the reader authored goes to the top of the list. Precedence is
   * list order, so appending would leave "save the current layout" losing to a
   * built-in with the same rules and never hanging anything.
   */
  function addProtocol(protocol: HangingProtocol) {
    protocols.value = [protocol, ...protocols.value];
  }

  function updateProtocol(id: string, patch: Partial<HangingProtocol>) {
    protocols.value = protocols.value.map((protocol) =>
      protocol.id === id ? { ...protocol, ...patch, id } : protocol
    );
  }

  function removeProtocol(id: string) {
    protocols.value = protocols.value.filter((protocol) => protocol.id !== id);
    if (settings.value.defaultProtocolId === id) {
      settings.value.defaultProtocolId = null;
    }
    if (applied.value?.protocolId === id) {
      applied.value = null;
      // Its overlay flags and focused module would otherwise stay in force
      // with no indicator left to explain them.
      resetPresentationChrome();
    }
    // Nothing hangs the studies it hung any more. Ids are stable, so a
    // restored or imported protocol could otherwise take the same id back and
    // silently re-claim them, deferred settings and all.
    [...hungImages.value.entries()]
      .filter(([, info]) => info.protocolId === id)
      .forEach(([imageID]) => hungImages.value.delete(imageID));
    // Drop the studies that were pinned to it, so they hang by rule again.
    settings.value.overrides = Object.fromEntries(
      Object.entries(settings.value.overrides).filter(
        ([, protocolId]) => protocolId !== id
      )
    );
  }

  function duplicateProtocol(id: string) {
    const source = getProtocol(id);
    if (!source) return null;
    const copy: HangingProtocol = {
      ...cloneProtocol(source),
      id: nextId(),
      name: `${source.name} (copy)`,
      builtIn: false,
    };
    const index = protocols.value.findIndex((protocol) => protocol.id === id);
    const next = [...protocols.value];
    next.splice(index + 1, 0, copy);
    protocols.value = next;
    return copy;
  }

  /** Moves a protocol in the precedence order. */
  function moveProtocol(id: string, offset: number) {
    const index = protocols.value.findIndex((protocol) => protocol.id === id);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= protocols.value.length) return;
    const next = [...protocols.value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    protocols.value = next;
  }

  function setDefaultProtocol(id: string | null) {
    settings.value.defaultProtocolId = id;
  }

  function setAutoApply(enabled: boolean) {
    settings.value.autoApply = enabled;
  }

  /**
   * Puts the shipped protocols back as they were shipped, in place. Precedence
   * is list order, so rebuilding the list built-ins-first would quietly demote
   * everything the reader wrote below everything shipped: restoring a
   * definition must not reorder anything.
   */
  function restoreBuiltIns() {
    const fresh = new Map(
      cloneBuiltIns().map((protocol) => [protocol.id, protocol])
    );
    // Only a protocol still marked built-in is replaced. An imported file can
    // carry a built-in's id (import only re-mints ids that are taken), and a
    // protocol the reader authored is not ours to overwrite.
    const restored = protocols.value.map((protocol) =>
      protocol.builtIn ? (fresh.get(protocol.id) ?? protocol) : protocol
    );
    const present = new Set(protocols.value.map((protocol) => protocol.id));
    const missing = cloneBuiltIns().filter(
      (protocol) => !present.has(protocol.id)
    );
    protocols.value = [...restored, ...missing];
  }

  function exportProtocols(ids?: string[]) {
    const selected = ids?.length
      ? protocols.value.filter((protocol) => ids.includes(protocol.id))
      : protocols.value;
    return serializeProtocols(selected);
  }

  /** Imported protocols are appended; ids that already exist are re-minted. */
  function importProtocols(text: string) {
    const incoming = parseProtocols(text);
    const takenIds = new Set(protocols.value.map((protocol) => protocol.id));
    const added = incoming.map((protocol) => {
      // Also covers a file that repeats an id within itself.
      const id = takenIds.has(protocol.id) ? nextId() : protocol.id;
      takenIds.add(id);
      return { ...protocol, id, builtIn: false };
    });
    protocols.value = [...protocols.value, ...added];
    return added;
  }

  // An image id is derived from the series, so it comes back if the same
  // series is loaded again. Dropping the mark with the image keeps a later,
  // ordinary load of that series hanging normally.
  onImageDeleted((deletedIDs) => {
    deletedIDs.forEach((id) => {
      restoredImages.value.delete(id);
      hungImages.value.delete(id);
      forgetWrites(id);
    });
  });

  return {
    protocols,
    settings,
    overlays,
    focusedModule,
    focusRequest,
    openModule,
    noteOpenModule,
    applied,
    appliedProtocol,
    hungImages,
    manualApply,
    indicatorDismissed,
    managerOpen,
    getProtocol,
    getStudyContext,
    getStudyUID,
    applyProtocol,
    applyLoadedImageSettings,
    applyAppliedWindowLevel,
    autoRangesReady,
    noteRestoredPresentation,
    reportRestoredPresentation,
    applyForImage,
    reportForImage,
    applyManually,
    clearOverride,
    captureCurrentState,
    addProtocol,
    updateProtocol,
    removeProtocol,
    duplicateProtocol,
    moveProtocol,
    setDefaultProtocol,
    setAutoApply,
    restoreBuiltIns,
    exportProtocols,
    importProtocols,
  };
});

export default useHangingProtocolStore;
