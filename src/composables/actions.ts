import { useToolStore } from '../store/tools';
import { Tools } from '../store/tools/types';
import { useRectangleStore } from '../store/tools/rectangles';
import { useRulerStore } from '../store/tools/rulers';
import { usePolygonStore } from '../store/tools/polygons';
import { useViewStore } from '../store/views';
import { Action, NOOP, WLPresetsCT } from '../constants';
import { useCurrentImage } from './useCurrentImage';
import { useSliceConfig } from './useSliceConfig';
import { useCineFrame } from './useCineFrame';
import { useDatasetStore } from '../store/datasets';
import { usePaintToolStore } from '../store/tools/paint';
import { PaintMode } from '../core/tools/paint';
import { computeEffectiveView } from '../core/views/effectiveView';
import { useDialogStore } from '../store/dialogs';
import { useKeyboardShortcutsStore } from '../store/keyboard-shortcuts';
import { useAnnouncementStore } from '../store/announcements';
import { useWindowingStore } from '../store/view-configs/windowing';
import { useCinePlaybackStore } from '../store/view-configs/cine-playback';
import { triggerResetViews } from '../components/tools/resetViewsEvent';
import useRemoteSaveStateStore from '../store/remote-save-state';

/** Tools cycled through by `cycleMeasurementTool`, in reading order. */
const MEASUREMENT_TOOLS = [Tools.Ruler, Tools.Rectangle, Tools.Polygon];

const announce = (message: string) => {
  useAnnouncementStore().announce(message);
};

function activeSliceTarget() {
  const { currentImageID } = useCurrentImage();
  const viewStore = useViewStore();
  const { activeView } = viewStore;
  if (!activeView) return null;

  const view = viewStore.getView(activeView);
  if (!view) return null;

  const effective = computeEffectiveView(view, currentImageID.value);
  if (effective.kind === 'cine') {
    const { frame, frameRange, setFrame } = useCineFrame(
      activeView,
      currentImageID
    );
    return {
      kind: 'cine' as const,
      viewID: activeView,
      imageID: currentImageID.value,
      value: frame.value,
      range: frameRange.value,
      set: setFrame,
    };
  }

  const { slice, range } = useSliceConfig(activeView, currentImageID);
  return {
    kind: 'slice' as const,
    viewID: activeView,
    imageID: currentImageID.value,
    value: slice.value,
    range: range.value,
    set: (next: number) => {
      slice.value = next;
    },
  };
}

const applyLabelOffset = (offset: number) => () => {
  const toolToStore = {
    [Tools.Rectangle]: useRectangleStore(),
    [Tools.Ruler]: useRulerStore(),
    [Tools.Polygon]: usePolygonStore(),
  };
  const toolStore = useToolStore();

  // @ts-ignore - toolToStore may not have keys of all tools
  const activeToolStore = toolToStore[toolStore.currentTool];
  if (!activeToolStore) return;

  const labels = Object.entries(activeToolStore.labels);
  const activeLabelIndex = labels.findIndex(
    ([name]) => name === activeToolStore.activeLabel
  );

  const [nextLabel] = labels.at((activeLabelIndex + offset) % labels.length)!;
  activeToolStore.setActiveLabel(nextLabel);
};

const setTool = (tool: Tools) => () => {
  useToolStore().setCurrentTool(tool);
};

const startPaintInMode = (mode: PaintMode) => () => {
  useToolStore().setCurrentTool(Tools.Paint);
  usePaintToolStore().setMode(mode);
};

const showKeyboardShortcuts = () => {
  const keyboardStore = useKeyboardShortcutsStore();
  if (keyboardStore.settingsOpen) {
    keyboardStore.settingsOpen = false;
    return;
  }
  keyboardStore.openCheatSheet();
};

const showCommandPalette = () => {
  const dialogStore = useDialogStore();
  dialogStore.commandPaletteOpen = !dialogStore.commandPaletteOpen;
};

const saveSession = () => {
  const dialogStore = useDialogStore();
  dialogStore.commandPaletteOpen = false;

  // Same rule as the toolbar's save button: a deployment configured with a
  // save URL writes straight to it instead of prompting for a file name.
  const remoteSaveStateStore = useRemoteSaveStateStore();
  if (remoteSaveStateStore.saveUrl !== '') {
    announce('Saving session');
    remoteSaveStateStore.saveState();
    return;
  }
  dialogStore.saveSessionOpen = true;
};

const changeSlice = (offset: number) => () => {
  const target = activeSliceTarget();
  if (!target) return;
  target.set(target.value + offset);
};

/** position: 0 = first, 0.5 = middle, 1 = last. */
const jumpToSlice = (position: number) => () => {
  const target = activeSliceTarget();
  if (!target) return;
  const [min, max] = target.range;
  const next = Math.round(min + (max - min) * position);
  target.set(next);
  announce(
    `${target.kind === 'cine' ? 'Frame' : 'Slice'} ${next + 1} of ${max + 1}`
  );
};

const changeSeries = (offset: number) => () => {
  const datasetStore = useDatasetStore();
  const viewStore = useViewStore();
  const { currentImageID } = useCurrentImage();

  const selections = datasetStore.idsAsSelections;
  if (selections.length < 2) {
    announce('No other series loaded');
    return;
  }

  const index = selections.indexOf(currentImageID.value ?? '');
  const nextIndex =
    (((index === -1 ? 0 : index + offset) % selections.length) +
      selections.length) %
    selections.length;
  viewStore.setDataForAllViews(selections[nextIndex]);
  announce(`Series ${nextIndex + 1} of ${selections.length}`);
};

const playPauseCine = () => {
  const { currentImageID } = useCurrentImage();
  const viewStore = useViewStore();
  const { activeView } = viewStore;
  if (!activeView || !currentImageID.value) return;

  const view = viewStore.getView(activeView);
  if (!view) return;
  if (computeEffectiveView(view, currentImageID.value).kind !== 'cine') {
    announce('The active view is not a cine clip');
    return;
  }

  const playbackStore = useCinePlaybackStore();
  const playing = playbackStore.getConfig(
    activeView,
    currentImageID.value
  ).playing;
  playbackStore.updateConfig(activeView, currentImageID.value, {
    playing: !playing,
  });
  announce(playing ? 'Cine paused' : 'Cine playing');
};

const cycleLayout = () => {
  const viewStore = useViewStore();
  const names = Object.keys(viewStore.namedLayouts);
  if (!names.length) return;
  const index = names.indexOf(viewStore.currentLayoutName ?? '');
  const next = names[(index + 1) % names.length];
  viewStore.switchToNamedLayout(next);
  announce(`Layout ${next}`);
};

const maximizeActiveView = () => {
  const viewStore = useViewStore();
  viewStore.toggleActiveViewMaximized();
  announce(
    viewStore.isActiveViewMaximized ? 'View maximized' : 'View restored'
  );
};

const resetView = () => {
  triggerResetViews();
  announce('Views reset');
};

function activeWindowingTarget() {
  const { currentImageID } = useCurrentImage();
  const { activeView } = useViewStore();
  if (!activeView || !currentImageID.value) return null;
  return { viewID: activeView, imageID: currentImageID.value as string };
}

/**
 * Applies a window/level preset, preserving an active inversion (a negative
 * window) so the palette and the cycle shortcut behave the same way.
 */
export function applyWindowPreset(
  viewID: string,
  imageID: string,
  preset: { width: number; level: number }
) {
  const windowingStore = useWindowingStore();
  const config = windowingStore.getConfig(viewID, imageID);
  const inverted = (config.width ?? 0) < 0;
  windowingStore.updateConfig(
    viewID,
    imageID,
    { width: inverted ? -preset.width : preset.width, level: preset.level },
    true
  );
}

const cycleWindowPreset = () => {
  const target = activeWindowingTarget();
  if (!target) return;

  const config = useWindowingStore().getConfig(target.viewID, target.imageID);
  const presets = Object.entries(WLPresetsCT);
  const currentIndex = presets.findIndex(
    ([, preset]) =>
      Math.abs(preset.width) === Math.abs(config.width ?? 0) &&
      preset.level === config.level
  );
  const [name, preset] = presets[(currentIndex + 1) % presets.length];
  applyWindowPreset(target.viewID, target.imageID, preset);
  announce(
    `Window preset ${name}: width ${preset.width}, level ${preset.level}`
  );
};

/**
 * Flips the grayscale ramp by negating the color window, the convention VTK's
 * image mappers use for an inverted lookup.
 */
const invertGrayscale = () => {
  const target = activeWindowingTarget();
  if (!target) return;

  const windowingStore = useWindowingStore();
  const config = windowingStore.getConfig(target.viewID, target.imageID);
  const width = config.width ?? 0;
  windowingStore.updateConfig(
    target.viewID,
    target.imageID,
    { width: -width, level: config.level },
    true
  );
  announce(width > 0 ? 'Grayscale inverted' : 'Grayscale normal');
};

const toggleCrosshairs = () => {
  const toolStore = useToolStore();
  const enabling = toolStore.currentTool !== Tools.Crosshairs;
  toolStore.setCurrentTool(enabling ? Tools.Crosshairs : Tools.Select);
};

const cycleMeasurementTool = () => {
  const toolStore = useToolStore();
  const index = MEASUREMENT_TOOLS.indexOf(toolStore.currentTool);
  const next = MEASUREMENT_TOOLS[(index + 1) % MEASUREMENT_TOOLS.length];
  toolStore.setCurrentTool(next);
};

const clearScene = () => () => {
  const datasetStore = useDatasetStore();
  datasetStore.removeAll();
};

const deleteCurrentImage = () => () => {
  const { currentImageID } = useCurrentImage();
  if (currentImageID.value) {
    const datasetStore = useDatasetStore();
    datasetStore.remove(currentImageID.value);
  }
};

const changeBrushSize = (delta: number) => () => {
  const paintStore = usePaintToolStore();
  const newSize = Math.max(1, paintStore.brushSize + delta);
  paintStore.setBrushSize(newSize);
};

export const ACTION_TO_FUNC = {
  windowLevel: setTool(Tools.WindowLevel),
  pan: setTool(Tools.Pan),
  zoom: setTool(Tools.Zoom),
  ruler: setTool(Tools.Ruler),
  paint: startPaintInMode(PaintMode.CirclePaint),
  paintEraser: startPaintInMode(PaintMode.Erase),
  brushSizeModifier: NOOP, // act as modifier key rather than immediate effect, so no-op
  decreaseBrushSize: changeBrushSize(-1),
  increaseBrushSize: changeBrushSize(1),
  rectangle: setTool(Tools.Rectangle),
  crosshairs: setTool(Tools.Crosshairs),
  temporaryCrosshairs: NOOP, // behavior implemented elsewhere
  crop: setTool(Tools.Crop),
  polygon: setTool(Tools.Polygon),
  select: setTool(Tools.Select),

  toggleCrosshairs,
  cycleMeasurementTool,

  nextSlice: changeSlice(-1),
  previousSlice: changeSlice(1),
  firstSlice: jumpToSlice(0),
  middleSlice: jumpToSlice(0.5),
  lastSlice: jumpToSlice(1),
  nextSeries: changeSeries(1),
  previousSeries: changeSeries(-1),
  playPauseCine,
  grabSlice: NOOP, // acts as a modifier key rather than immediate effect, so no-op

  decrementLabel: applyLabelOffset(-1),
  incrementLabel: applyLabelOffset(1),

  cycleLayout,
  maximizeActiveView,
  resetView,

  cycleWindowPreset,
  invertGrayscale,

  saveSession,
  deleteCurrentImage: deleteCurrentImage(),
  clearScene: clearScene(),

  mergeNewPolygon: NOOP, // acts as a modifier key rather than immediate effect, so no-op

  showCommandPalette,
  showKeyboardShortcuts,
} as const satisfies Record<Action, () => void>;
