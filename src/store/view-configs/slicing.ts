import { clampValue } from '@/src/utils';
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import {
  DoubleKeyRecord,
  deleteSecondKey,
  getDoubleKeyRecord,
  patchDoubleKeyRecord,
} from '@/src/utils/doubleKeyRecord';
import { Maybe } from '@/src/types';
import { useCurrentImage, useImage } from '@/src/composables/useCurrentImage';
import { createViewConfigSerializer } from '@/src/store/view-configs/common';
import { ViewConfig } from '@/src/io/state-file/schema';
import { SliceConfig } from '@/src/store/view-configs/types';
import { useImageStore } from '@/src/store/datasets-images';
import { useViewStore } from '@/src/store/views';

export const defaultSliceConfig = (): SliceConfig => ({
  slice: 0,
  min: 0,
  max: 1,
  syncState: false,
  interpolate: true,
});

export const useViewSliceStore = defineStore('viewSlice', () => {
  const imageStore = useImageStore();
  const viewStore = useViewStore();
  const configs = reactive<DoubleKeyRecord<SliceConfig>>({});

  // Global default applied to slices that do not have a stored config yet.
  const interpolateByDefault = ref(defaultSliceConfig().interpolate);

  const computeDefaultSliceConfig = (
    viewID: Maybe<string>,
    imageID: Maybe<string>
  ): SliceConfig => {
    const base = {
      ...defaultSliceConfig(),
      interpolate: interpolateByDefault.value,
    };
    if (!viewID || !imageID) return base;

    const view = viewStore.getView(viewID);
    if (view?.type !== '2D') return base;

    const { orientation } = view.options;
    const { metadata } = useImage(imageID);
    const { lpsOrientation, dimensions } = metadata.value;
    const ijkIndex = lpsOrientation[orientation];
    const dimMax = dimensions[ijkIndex];

    return {
      ...base,
      min: 0,
      slice: Math.ceil((dimMax - 1) / 2),
      max: dimMax - 1,
    };
  };

  const getConfig = (viewID: Maybe<string>, dataID: Maybe<string>) =>
    getDoubleKeyRecord(configs, viewID, dataID) ??
    computeDefaultSliceConfig(viewID, dataID);

  const updateConfig = (
    viewID: string,
    dataID: string,
    patch: Partial<SliceConfig>
  ) => {
    const current = {
      ...defaultSliceConfig(),
      ...getConfig(viewID, dataID),
    };
    const next = { ...current, ...patch };
    next.slice = clampValue(next.slice, next.min, next.max);

    if (
      next.slice === current.slice &&
      next.min === current.min &&
      next.max === current.max &&
      next.syncState === current.syncState &&
      next.interpolate === current.interpolate
    ) {
      return;
    }

    patchDoubleKeyRecord(configs, viewID, dataID, next);
  };

  const resetSlice = (viewID: string, dataID: string) => {
    const config = getConfig(viewID, dataID);
    if (!config) return;

    // Setting this to floor() will affect images where the
    // middle slice is fractional.
    // This is consistent with vtkImageMapper and SliceRepresentationProxy.
    updateConfig(viewID, dataID, {
      slice: Math.ceil((config.min + config.max) / 2),
    });
  };

  const removeView = (viewID: string) => {
    delete configs[viewID];
  };

  const removeData = (dataID: string, viewID?: string) => {
    if (viewID) {
      delete configs[viewID]?.[dataID];
    } else {
      deleteSecondKey(configs, dataID);
    }
  };

  /**
   * Sets the interpolation mode for every view/image pair, and for any
   * slices configured later in this session.
   */
  const setInterpolateAll = (interpolate: boolean) => {
    interpolateByDefault.value = interpolate;
    Object.keys(configs).forEach((viewID) => {
      Object.keys(configs[viewID]).forEach((dataID) => {
        updateConfig(viewID, dataID, { interpolate });
      });
    });
  };

  const toggleSyncImages = () => {
    // Synchronize all images when toggled
    Object.keys(configs).forEach((viewID) => {
      imageStore.idList.forEach((imageID) => {
        const { syncState } = {
          ...defaultSliceConfig(),
          ...getConfig(viewID, imageID),
        };
        updateConfig(viewID, imageID, { syncState: !syncState });
      });
    });
  };

  const isSync = () => {
    const allSync = Object.keys(configs).every((sc) =>
      Object.keys(configs[sc]).every((c) => configs[sc][c].syncState)
    );

    return allSync;
  };

  const updateSyncConfigs = () => {
    Object.keys(configs).forEach((viewID) => {
      const { currentImageID } = useCurrentImage('global');
      const config = getConfig(viewID, currentImageID.value);
      imageStore.idList.forEach((imageID) => {
        const { syncState } = {
          ...defaultSliceConfig(),
          ...getConfig(viewID, imageID),
        };

        if (syncState) {
          updateConfig(viewID, imageID, { slice: config?.slice });
        }
      });
    });
  };

  const serialize = createViewConfigSerializer(configs, 'slice');

  const deserialize = (viewID: string, config: Record<string, ViewConfig>) => {
    Object.entries(config).forEach(([dataID, viewConfig]) => {
      if (viewConfig.slice) {
        updateConfig(viewID, dataID, viewConfig.slice);
        // keep the global default in sync with the restored session
        interpolateByDefault.value = viewConfig.slice.interpolate;
      }
    });
  };

  return {
    configs,
    interpolateByDefault,
    getConfig,
    updateConfig,
    setInterpolateAll,
    resetSlice,
    removeView,
    removeData,
    toggleSyncImages,
    updateSyncConfigs,
    isSync,
    serialize,
    deserialize,
  };
});

export default useViewSliceStore;
