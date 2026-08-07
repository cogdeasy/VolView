import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import { useComparisonSync } from '@/src/composables/useComparisonSync';
import { useComparisonStore } from '@/src/store/comparison';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useImageStore } from '@/src/store/datasets-images';
import { useImageCacheStore } from '@/src/store/image-cache';
import { useViewStore } from '@/src/store/views';
import { useViewSliceStore } from '@/src/store/view-configs/slicing';
import { useViewCameraStore } from '@/src/store/view-configs/camera';
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

/** A loaded cine series: a candidate the comparison pickers refuse. */
const seatCine = (id: string) => {
  const dicomStore = useDICOMStore();
  dicomStore.volumeInfo[id] = {
    NumberOfSlices: 30,
    VolumeID: id,
    Modality: 'MR',
    SeriesInstanceUID: id,
    SeriesNumber: '1',
    SeriesDescription: id,
    WindowLevel: '',
    WindowWidth: '',
    kind: 'cine',
  };
};

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
    const viewIDOf = (name: string) =>
      viewStore.visibleViews.find((view) => view?.name === name)!.id;
    return {
      currentViewID: viewIDOf(ComparisonViewNames.currentAxial),
      priorViewID: viewIDOf(ComparisonViewNames.priorAxial),
    };
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

  it('holds the current study still while the prior finishes downloading', async () => {
    seatImage('current', 8);
    seatImage('prior', 2);
    const { currentViewID, priorViewID } = openPair();
    const sliceStore = useViewSliceStore();
    sliceStore.updateConfig(currentViewID, 'current', {
      slice: 2,
      min: 0,
      max: 7,
    });
    await nextTick();

    // Six more slices land. An untouched prior pane sits on the middle of
    // whatever has arrived, so its reported slice moves on its own.
    useImageCacheStore().updateVTKImageData('prior', imageOf(8));
    await nextTick();

    expect(sliceStore.getConfig(currentViewID, 'current').slice).toBe(2);

    // and the pane the download moved is put back where the current says.
    await nextTick();
    expect(sliceStore.getConfig(priorViewID, 'prior').slice).toBe(2);
  });

  it('keeps a scroll made while the same study was still arriving', async () => {
    seatImage('current', 8);
    seatImage('prior', 2);
    const { currentViewID, priorViewID } = openPair();
    const sliceStore = useViewSliceStore();
    sliceStore.updateConfig(currentViewID, 'current', {
      slice: 2,
      min: 0,
      max: 7,
    });
    await nextTick();

    // The rest of the prior lands in the same breath as the reader scrolling
    // it — a slice the growth alone would never have put it on.
    useImageCacheStore().updateVTKImageData('prior', imageOf(8));
    sliceStore.updateConfig(priorViewID, 'prior', { min: 0, max: 7, slice: 6 });
    await nextTick();
    await nextTick();

    expect(sliceStore.getConfig(priorViewID, 'prior').slice).toBe(6);
    expect(sliceStore.getConfig(currentViewID, 'current').slice).toBe(6);
  });
});

describe('useComparisonSync — pane bindings', () => {
  let scope: EffectScope;

  beforeEach(() => {
    setActivePinia(createPinia());
    scope = effectScope(true);
  });
  afterEach(() => scope.stop());

  it('follows a pane pointed at the study on the other side by swapping roles', async () => {
    const viewStore = useViewStore();
    const comparison = useComparisonStore();
    seatImage('current', 8);
    seatImage('prior', 8);
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('current');
    comparison.setPriorImageID('prior');
    scope.run(() => useComparisonSync());
    const viewIDOf = (name: string) =>
      viewStore.visibleViews.find((view) => view?.name === name)!.id;
    const currentViewID = viewIDOf(ComparisonViewNames.currentAxial);
    const priorViewID = viewIDOf(ComparisonViewNames.priorAxial);
    await nextTick();

    // A restored session puts the older study in the pane auto-selection
    // assigned to the newer one.
    viewStore.setDataForView(currentViewID, 'prior');
    await nextTick();
    await nextTick();

    expect(comparison.currentImageID).toBe('prior');
    expect(comparison.priorImageID).toBe('current');
    expect(viewStore.getView(currentViewID)?.dataID).toBe('prior');
    expect(viewStore.getView(priorViewID)?.dataID).toBe('current');
  });

  it('reads a study opened in all views as the current one, not the prior', async () => {
    const viewStore = useViewStore();
    const comparison = useComparisonStore();
    seatImage('current', 8);
    seatImage('prior', 8);
    seatImage('opened', 8);
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('current');
    comparison.setPriorImageID('prior');
    scope.run(() => useComparisonSync());
    const viewIDOf = (name: string) =>
      viewStore.visibleViews.find((view) => view?.name === name)!.id;
    const currentViewID = viewIDOf(ComparisonViewNames.currentAxial);
    const priorViewID = viewIDOf(ComparisonViewNames.priorAxial);
    await nextTick();

    // "Open in all views" from the data panel: every slot at once.
    viewStore.setDataForAllViews('opened');
    await nextTick();
    await nextTick();
    await nextTick();

    expect(comparison.currentImageID).toBe('opened');
    expect(comparison.priorImageID).toBe('prior');
    expect(viewStore.getView(currentViewID)?.dataID).toBe('opened');
    expect(viewStore.getView(priorViewID)?.dataID).toBe('prior');
  });

  it('refuses a cine dropped on a pane, as the study pickers do', async () => {
    const viewStore = useViewStore();
    const comparison = useComparisonStore();
    seatImage('current', 8);
    seatImage('prior', 8);
    seatCine('cine');
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('current');
    comparison.setPriorImageID('prior');
    scope.run(() => useComparisonSync());
    const priorViewID = viewStore.visibleViews.find(
      (view) => view?.name === ComparisonViewNames.priorAxial
    )!.id;
    await nextTick();

    viewStore.setDataForView(priorViewID, 'cine');
    await nextTick();

    expect(comparison.priorImageID).toBe('prior');
    expect(viewStore.getView(priorViewID)?.dataID).toBe('prior');
  });
});

describe('useComparisonSync — camera link', () => {
  let scope: EffectScope;

  beforeEach(() => {
    setActivePinia(createPinia());
    scope = effectScope(true);
  });
  afterEach(() => scope.stop());

  const openPair = () => {
    const viewStore = useViewStore();
    const comparison = useComparisonStore();
    seatImage('current', 8);
    seatImage('prior', 8);
    viewStore.setNamedLayoutsFromConfig(ComparisonLayouts);
    viewStore.switchToNamedLayout(ComparisonLayoutNames.pair);
    comparison.setCurrentImageID('current');
    comparison.setPriorImageID('prior');
    scope.run(() => useComparisonSync());
    const viewIDOf = (name: string) =>
      viewStore.visibleViews.find((view) => view?.name === name)!.id;
    return {
      currentViewID: viewIDOf(ComparisonViewNames.currentAxial),
      priorViewID: viewIDOf(ComparisonViewNames.priorAxial),
    };
  };

  it('does not let the prior study, auto-fitted a tick later, reframe the current one', async () => {
    const { currentViewID, priorViewID } = openPair();
    const cameraStore = useViewCameraStore();

    // The prior pane's own auto-fit lands before the current pane's.
    cameraStore.updateConfig(priorViewID, 'prior', { parallelScale: 120 });
    await nextTick();

    expect(cameraStore.getConfig(currentViewID, 'current')?.parallelScale).toBe(
      undefined
    );
  });

  it('pulls the prior onto the current study once the current pane has a camera', async () => {
    const { currentViewID, priorViewID } = openPair();
    const cameraStore = useViewCameraStore();

    cameraStore.updateConfig(currentViewID, 'current', { parallelScale: 40 });
    await nextTick();

    expect(cameraStore.getConfig(priorViewID, 'prior')?.parallelScale).toBe(40);
  });

  it('pans the prior onto the current whichever auto-fit lands first', async () => {
    const { currentViewID, priorViewID } = openPair();
    const cameraStore = useViewCameraStore();

    // The current pane's auto-fit lands first, so the copy it drives has no
    // camera on the prior side to pan.
    cameraStore.updateConfig(currentViewID, 'current', {
      parallelScale: 40,
      focalPoint: [10, 20, 0],
      position: [10, 20, -100],
    });
    await nextTick();

    cameraStore.updateConfig(priorViewID, 'prior', {
      parallelScale: 120,
      focalPoint: [0, 0, 5],
      position: [0, 0, -95],
    });
    await nextTick();
    await nextTick();

    const prior = cameraStore.getConfig(priorViewID, 'prior');
    expect(prior?.parallelScale).toBe(40);
    // In plane the prior follows the current; along the view axis it keeps
    // its own slice.
    expect(prior?.focalPoint).toEqual([10, 20, 5]);
    expect(prior?.position).toEqual([10, 20, -95]);
  });
});
