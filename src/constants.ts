import type { RGBColor } from '@kitware/vtk.js/types';

export const EPSILON = 10e-6;
export const NOOP = () => {};
export const NO_NAME = '(no name)';

// themes
export const ThemeStorageKey = 'app-theme';
export const DarkTheme = 'philips-dark';
export const LightTheme = 'philips-light';
export const DefaultTheme = DarkTheme;
/** Theme names persisted by earlier releases, mapped to their replacements. */
export const LegacyThemes = new Map([
  ['kw-dark', DarkTheme],
  ['kw-light', LightTheme],
]);

export const Messages = {
  WebGLLost: {
    title: 'Viewer Error',
    details:
      'Lost the WebGL context! Please reload the webpage. If the problem persists, you may need to restart your web browser.',
  },
} as const;

export const ANNOTATION_TOOL_HANDLE_RADIUS = 6; // CSS pixels
export const PICKABLE_ANNOTATION_TOOL_HANDLE_RADIUS =
  ANNOTATION_TOOL_HANDLE_RADIUS * 2;

export const IMAGE_DRAG_MEDIA_TYPE = 'application/x-volview-image-id';

/**
 * Task-oriented groupings, used by the command palette and the cheat sheet to
 * present commands the way a reading workflow is organized.
 */
export const ACTION_GROUPS = {
  navigation: 'Navigate the study',
  windowing: 'Window and display',
  tools: 'Tools and measurement',
  layout: 'Layout and views',
  data: 'Data',
  app: 'Application',
} as const;

export type ActionGroup = keyof typeof ACTION_GROUPS;

interface ActionInfo {
  readable: string;
  group: ActionGroup;
  /** Extra terms matched by the command palette's search. */
  keywords?: string;
  /** Held down while using the mouse rather than pressed on its own. */
  hold?: boolean;
}

export const ACTIONS = {
  windowLevel: {
    readable: 'Activate Window/Level tool',
    group: 'tools',
    keywords: 'contrast brightness',
  },
  pan: {
    readable: 'Activate Pan tool',
    group: 'tools',
    keywords: 'move translate',
  },
  zoom: {
    readable: 'Activate Zoom tool',
    group: 'tools',
    keywords: 'magnify scale',
  },
  ruler: {
    readable: 'Activate Ruler tool',
    group: 'tools',
    keywords: 'measure distance length',
  },
  paint: {
    readable: 'Activate Paint tool',
    group: 'tools',
    keywords: 'segment brush labelmap',
  },
  paintEraser: {
    readable: 'Activate Paint tool with eraser',
    group: 'tools',
    keywords: 'segment erase',
  },
  brushSizeModifier: {
    readable: 'Change brush size by holding key and scrolling',
    group: 'tools',
    hold: true,
  },
  decreaseBrushSize: {
    readable: 'Decrease brush size',
    group: 'tools',
  },
  increaseBrushSize: {
    readable: 'Increase brush size',
    group: 'tools',
  },
  rectangle: {
    readable: 'Activate Rectangle tool',
    group: 'tools',
    keywords: 'measure roi box',
  },
  crosshairs: {
    readable: 'Activate Crosshairs tool',
    group: 'tools',
    keywords: 'localize reference lines',
  },
  temporaryCrosshairs: {
    readable: 'Temporarily activate crosshairs tool',
    group: 'tools',
    hold: true,
  },
  crop: {
    readable: 'Activate Crop tool',
    group: 'tools',
  },
  polygon: {
    readable: 'Activate Polygon tool',
    group: 'tools',
    keywords: 'measure contour area',
  },
  select: {
    readable: 'Activate Select tool',
    group: 'tools',
    keywords: 'pointer arrow',
  },
  toggleCrosshairs: {
    readable: 'Toggle crosshairs',
    group: 'tools',
    keywords: 'localize reference lines on off',
  },
  cycleMeasurementTool: {
    readable: 'Cycle measurement tools',
    group: 'tools',
    keywords: 'ruler rectangle polygon next measure',
  },

  nextSlice: {
    readable: 'Next slice',
    group: 'navigation',
    keywords: 'scroll down frame',
  },
  previousSlice: {
    readable: 'Previous slice',
    group: 'navigation',
    keywords: 'scroll up frame',
  },
  firstSlice: {
    readable: 'Jump to first slice',
    group: 'navigation',
    keywords: 'start top begin',
  },
  middleSlice: {
    readable: 'Jump to middle slice',
    group: 'navigation',
    keywords: 'centre center',
  },
  lastSlice: {
    readable: 'Jump to last slice',
    group: 'navigation',
    keywords: 'end bottom finish',
  },
  nextSeries: {
    readable: 'Next series',
    group: 'navigation',
    keywords: 'study volume dataset',
  },
  previousSeries: {
    readable: 'Previous series',
    group: 'navigation',
    keywords: 'study volume dataset',
  },
  playPauseCine: {
    readable: 'Play/pause cine',
    group: 'navigation',
    keywords: 'movie loop clip animate',
  },
  grabSlice: {
    readable: 'Change slice by holding key and moving mouse up or down',
    group: 'navigation',
    hold: true,
  },

  decrementLabel: {
    readable: 'Activate previous label',
    group: 'tools',
  },
  incrementLabel: {
    readable: 'Activate next label',
    group: 'tools',
  },

  cycleLayout: {
    readable: 'Cycle layout',
    group: 'layout',
    keywords: 'four up hanging protocol grid',
  },
  maximizeActiveView: {
    readable: 'Maximize/restore active view',
    group: 'layout',
    keywords: 'fullscreen expand single',
  },
  resetView: {
    readable: 'Reset views',
    group: 'layout',
    keywords: 'camera fit zoom home',
  },

  cycleWindowPreset: {
    readable: 'Cycle window preset',
    group: 'windowing',
    keywords: 'brain lung bone soft tissue contrast',
  },
  invertGrayscale: {
    readable: 'Invert grayscale',
    group: 'windowing',
    keywords: 'negative polarity inverse',
  },

  deleteCurrentImage: {
    readable: 'Remove current active image',
    group: 'data',
  },

  clearScene: {
    readable: 'Clear scene',
    group: 'data',
    keywords: 'close all remove',
  },

  mergeNewPolygon: {
    readable:
      'Merge new polygons by holding key and finishing an overlapping polygon',
    group: 'tools',
    hold: true,
  },

  showCommandPalette: {
    readable: 'Open command palette',
    group: 'app',
    keywords: 'search commands actions run',
  },
  showKeyboardShortcuts: {
    readable: 'Show keyboard shortcut cheat sheet',
    group: 'app',
    keywords: 'help keys bindings',
  },
} as const satisfies Record<string, ActionInfo>;

export type Action = keyof typeof ACTIONS;

export const WLAutoRanges = {
  FullRange: 0,
  LowContrast: 1.0,
  MediumContrast: 2.0,
  HighContrast: 5.0,
};

export const WL_AUTO_DEFAULT = 'FullRange';
export const WL_HIST_BINS = 512;

export const WLPresetsCT = {
  Bones: {
    width: 1000,
    level: 400,
  },
  Air: {
    width: 1000,
    level: -426,
  },
  SoftTissue: {
    width: 350,
    level: 50,
  },
  Lungs: {
    width: 1500,
    level: -600,
  },
  Brain: {
    width: 80,
    level: 40,
  },
};

export const OBLIQUE_OUTLINE_COLORS: Record<string, RGBColor> = {
  ObliqueAxial: [0, 128, 255], // Blue
  ObliqueSagittal: [255, 255, 0], // Yellow
  ObliqueCoronal: [255, 51, 51], // Red
};
