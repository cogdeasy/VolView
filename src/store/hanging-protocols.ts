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
import { layoutToConfig } from '@/src/utils/layoutParsing';
import { DefaultNamedLayouts } from '@/src/config';
import { findNamedLayout } from '@/src/core/hanging-protocols/describe';
import { getImageData } from '@/src/composables/useCurrentImage';
import {
  emptyStudyContext,
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

const cloneBuiltIns = () =>
  BUILT_IN_PROTOCOLS.map((protocol) => cloneProtocol(protocol));

export function readStoredProtocols(raw: string): HangingProtocol[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneBuiltIns();
    // An empty list is a list the reader emptied on purpose; only an unusable
    // stored value falls back to the shipped protocols.
    return parsed
      .map((entry) => hangingProtocol.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data);
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
}

export const useHangingProtocolStore = defineStore('hangingProtocol', () => {
  const protocols = protocolStorage();
  const settings = useLocalStorage<Settings>(SETTINGS_KEY, defaultSettings(), {
    mergeDefaults: true,
  });

  // Runtime display state a protocol drives. Not persisted: it always follows
  // whichever protocol is currently applied.
  const overlays = ref<OverlaysSpec>({ viewLabels: true, annotations: true });
  const focusedModule = ref<Maybe<FocusedModule>>(null);

  const applied = ref<Maybe<AppliedProtocolInfo>>(null);
  const indicatorDismissed = ref(false);
  /**
   * Images whose presentation came from a restored session. Their layout and
   * view configs were saved by the reader and must not be re-hung.
   */
  const restoredImages = ref(new Set<string>());
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

  function applyWindowLevel(
    protocol: HangingProtocol,
    viewIDs: string[],
    imageID: string
  ) {
    const windowingStore = useWindowingStore();
    const spec = protocol.windowLevel;

    viewIDs.forEach((viewID) => {
      if (spec.kind === 'dicom') {
        windowingStore.resetConfig(viewID, imageID);
        return;
      }
      if (spec.kind === 'auto') {
        windowingStore.updateConfig(
          viewID,
          imageID,
          { auto: spec.auto as AutoRangeKey, useAuto: true },
          true
        );
        return;
      }
      const preset =
        spec.kind === 'preset' ? getWindowLevelPreset(spec.preset) : spec;
      if (!preset) return;
      windowingStore.updateConfig(
        viewID,
        imageID,
        { width: preset.width, level: preset.level, useAuto: false },
        true
      );
    });
  }

  function applyVolumeColoring(
    protocol: HangingProtocol,
    viewIDs: string[],
    imageID: string
  ) {
    if (!protocol.volume.preset) return;
    // The coloring store needs the image data to compute a mapping range.
    if (!getImageData(imageID)) return;

    const coloringStore = useVolumeColoringStore();
    viewIDs.forEach((viewID) => {
      coloringStore.setColorPreset(viewID, imageID, protocol.volume.preset);
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
    imageID: string
  ) {
    if (protocol.slicePolicy === 'preserve') return;
    const sliceStore = useViewSliceStore();
    viewIDs.forEach((viewID) => {
      if (protocol.slicePolicy === 'middle') {
        sliceStore.resetSlice(viewID, imageID);
        return;
      }
      const config = sliceStore.getConfig(viewID, imageID);
      sliceStore.updateConfig(viewID, imageID, { slice: config.min });
    });
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
      const views = viewStore.visibleViews;
      // A protocol with more views than the previous layout gets fresh, unbound
      // views; without this they hang as empty panes.
      views
        .filter((view) => !view.dataID)
        .forEach((view) => viewStore.setDataForView(view.id, imageID));
      const twoDViewIDs = views
        .filter((view) => view.type === '2D')
        .map((view) => view.id);
      const threeDViewIDs = views
        .filter((view) => view.type === '3D')
        .map((view) => view.id);

      applyWindowLevel(
        protocol,
        views.map((view) => view.id),
        imageID
      );
      applyVolumeColoring(protocol, threeDViewIDs, imageID);
      applySlicePolicy(protocol, twoDViewIDs, imageID);
    }

    overlays.value = { ...protocol.overlays };
    focusedModule.value = protocol.focusedModule;
  }

  /**
   * Re-runs the parts of the applied protocol that need pixel data: the window
   * (an auto window needs the histogram, and a slice view that mounts before
   * the histogram exists pins the config to the placeholder W/L of 1 / 0.5),
   * the volume preset (which needs a scalar range) and the slice policy (which
   * needs the image dimensions). Called once the image finishes loading, and
   * again once the auto ranges are computed.
   */
  function applyLoadedImageSettings(imageID: Maybe<string>) {
    const protocol = appliedProtocol.value;
    if (!protocol || !imageID) return;

    const views = useViewStore().visibleViews;
    applyWindowLevel(
      protocol,
      views.map((view) => view.id),
      imageID
    );
    applyVolumeColoring(
      protocol,
      views.filter((view) => view.type === '3D').map((view) => view.id),
      imageID
    );
    applySlicePolicy(
      protocol,
      views.filter((view) => view.type === '2D').map((view) => view.id),
      imageID
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

  /** True (once) if the image's presentation came from a restored session. */
  function takeRestoredPresentation(imageID: Maybe<string>) {
    if (!imageID || !restoredImages.value.has(imageID)) return false;
    restoredImages.value.delete(imageID);
    applied.value = {
      protocolId: null,
      reason: 'restored',
      criteria: [],
      explanation:
        'This study was restored from a saved session, so its saved layout ' +
        'and window are in use instead of a protocol.',
      studyInstanceUID: getStudyUID(imageID),
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
    if (!settings.value.autoApply && !options?.force) {
      // Nothing hangs this study, so the previous study's protocol must not
      // linger in the indicator or in the after-load phase.
      applied.value = null;
      return null;
    }

    const context = getStudyContext(imageID);
    const studyUID = getStudyUID(imageID);
    const selection = selectProtocol(protocols.value, context, {
      overrideId: studyUID ? settings.value.overrides[studyUID] : null,
      defaultId: settings.value.defaultProtocolId,
    });

    if (!selection.protocol) {
      // Still report the outcome: the reader needs to know the study was not
      // hung by a protocol, and needs one click to pick one.
      applied.value = {
        protocolId: null,
        reason: 'none',
        criteria: [],
        explanation: explainSelection(selection),
        studyInstanceUID: studyUID,
      };
      indicatorDismissed.value = false;
      return null;
    }

    applyProtocol(selection.protocol, imageID);
    applied.value = {
      protocolId: selection.protocol.id,
      reason: selection.reason,
      criteria: selection.criteria,
      explanation: explainSelection(selection),
      studyInstanceUID: studyUID,
    };
    indicatorDismissed.value = false;
    return selection.protocol;
  }

  /** Reader picked a protocol by hand; remember it for this study. */
  function applyManually(protocolId: string, imageID: Maybe<string>) {
    const protocol = getProtocol(protocolId);
    if (!protocol) return;

    const studyUID = getStudyUID(imageID);
    if (studyUID) {
      settings.value.overrides = {
        ...settings.value.overrides,
        [studyUID]: protocolId,
      };
    }

    applyProtocol(protocol, imageID);
    applied.value = {
      protocolId,
      reason: 'override',
      criteria: [],
      explanation: `${protocol.name} was applied manually${
        studyUID ? ' and will be reused for this study' : ''
      }.`,
      studyInstanceUID: studyUID,
    };
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

    // `visibleViews` is pushed in the same depth-first order in which
    // `parseLayoutConfig` assigns slot indices, so slot index indexes it.
    const slotViews = viewStore.visibleViews;
    const layout = layoutToConfig(
      viewStore.visibleLayout,
      (slotIndex) => slotViews[slotIndex]
    );

    const activeViewID = viewStore.activeView ?? slotViews[0]?.id;
    const wlConfig =
      activeViewID && imageID
        ? windowingStore.getConfig(activeViewID, imageID)
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
      focusedModule: focusedModule.value ?? 'Data',
      match: {
        ...(context.modality ? { modality: [context.modality] } : {}),
        ...(context.bodyPart ? { bodyPart: [context.bodyPart] } : {}),
      },
    };
  }

  function addProtocol(protocol: HangingProtocol) {
    protocols.value = [...protocols.value, protocol];
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
    }
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

  function restoreBuiltIns() {
    const userProtocols = protocols.value.filter(
      (protocol) => !protocol.builtIn
    );
    protocols.value = [...cloneBuiltIns(), ...userProtocols];
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

  return {
    protocols,
    settings,
    overlays,
    focusedModule,
    applied,
    appliedProtocol,
    indicatorDismissed,
    managerOpen,
    getProtocol,
    getStudyContext,
    getStudyUID,
    applyProtocol,
    applyLoadedImageSettings,
    autoRangesReady,
    noteRestoredPresentation,
    takeRestoredPresentation,
    applyForImage,
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
