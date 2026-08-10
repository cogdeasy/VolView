import { defineStore } from 'pinia';
import { reactive } from 'vue';

export type ViewBackground = 'black' | 'gradient' | 'white';

export interface ViewDisplayConfig {
  background: ViewBackground;
  orientationBox: boolean;
  cornerAnnotations: boolean;
}

export const DEFAULT_VIEW_DISPLAY_CONFIG: ViewDisplayConfig = {
  background: 'black',
  orientationBox: true,
  cornerAnnotations: true,
};

/**
 * Per-view display settings surfaced through each view's camera/display menu.
 */
export const useViewDisplayStore = defineStore('view-display', () => {
  const configByViewID = reactive<Record<string, ViewDisplayConfig>>({});

  function getConfig(viewID: string): ViewDisplayConfig {
    if (!(viewID in configByViewID)) {
      configByViewID[viewID] = { ...DEFAULT_VIEW_DISPLAY_CONFIG };
    }
    return configByViewID[viewID];
  }

  function setBackground(viewID: string, background: ViewBackground) {
    getConfig(viewID).background = background;
  }

  function toggleOrientationBox(viewID: string) {
    const config = getConfig(viewID);
    config.orientationBox = !config.orientationBox;
  }

  function toggleCornerAnnotations(viewID: string) {
    const config = getConfig(viewID);
    config.cornerAnnotations = !config.cornerAnnotations;
  }

  return {
    configByViewID,
    getConfig,
    setBackground,
    toggleOrientationBox,
    toggleCornerAnnotations,
  };
});
