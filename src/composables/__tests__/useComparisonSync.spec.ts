import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import { useComparisonSync } from '@/src/composables/useComparisonSync';
import { useComparisonStore } from '@/src/store/comparison';
import { useImageStore } from '@/src/store/datasets-images';
import { useImageCacheStore } from '@/src/store/image-cache';
import { useViewStore } from '@/src/store/views';
import { useViewSliceStore } from '@/src/store/view-configs/slicing';
import {
  ComparisonLayoutNames,
  ComparisonLayouts,
  ComparisonViewNames,
} from '@/src/core/comparison/layout';

const imageOf = (slices: number) => {
  const image = vtkImageData.newInstance();
  image.setDimensions(2, 2, slices);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'scalars',
      numberOfComponents: 1,
      values: new Uint8Array(4 * slices),
    })
  );
  return image;
};

const seatImage = (id: string, slices: number) =>
  useImageStore().addVTKImageData(id, imageOf(slices), { id });

describe('useComparisonSync — slice ranges', () => {
  let scope: EffectScope;

  beforeEach(() => {
    setActivePinia(createPinia());
    scope = effectScope(true);
  });
  afterEach(() => scope.stop());

  /** Opens an axial pair on two seated studies, sync installed. */
  const openPair = () => {
    const viewStore = useViewStore();
    const comparison = useComparisonStore();
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('current');
    comparison.setPriorImageID('prior');
    scope.run(() => useComparisonSync());
    const priorViewID = viewStore.visibleViews.find(
      (view) => view?.name === ComparisonViewNames.priorAxial
    )!.id;
    return { priorViewID };
  };

  it('lets a prior pane scroll into slices that arrived after it was bound', async () => {
    seatImage('current', 8);
    seatImage('prior', 2);
    const { priorViewID } = openPair();
    const sliceStore = useViewSliceStore();
    // The range a pane is left with when the pair writes it mid-load.
    sliceStore.updateConfig(priorViewID, 'prior', { slice: 0, min: 0, max: 1 });

    useImageCacheStore().updateVTKImageData('prior', imageOf(8));
    await nextTick();

    expect(sliceStore.getConfig(priorViewID, 'prior').max).toBe(7);
  });

  it('never narrows a range under the reader', async () => {
    seatImage('current', 8);
    seatImage('prior', 8);
    const { priorViewID } = openPair();
    const sliceStore = useViewSliceStore();
    sliceStore.updateConfig(priorViewID, 'prior', { slice: 6, min: 0, max: 7 });

    useImageCacheStore().updateVTKImageData('prior', imageOf(4));
    await nextTick();

    expect(sliceStore.getConfig(priorViewID, 'prior').max).toBe(7);
  });
});
