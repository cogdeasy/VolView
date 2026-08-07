import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import { useComparisonStore } from '@/src/store/comparison';
import { useDatasetStore } from '@/src/store/datasets';
import { useImageStore } from '@/src/store/datasets-images';
import { useViewStore } from '@/src/store/views';

const seatImage = (id: string) => {
  const image = vtkImageData.newInstance();
  image.setDimensions(2, 2, 2);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'scalars',
      numberOfComponents: 1,
      values: new Uint8Array(8),
    })
  );
  return useImageStore().addVTKImageData(id, image, { id });
};

/** Makes the view showing `dataID` the active one, as clicking a pane does. */
const readImageIn = (dataID: string) => {
  const viewStore = useViewStore();
  const [viewID] = viewStore.viewIDs;
  viewStore.setDataForView(viewID, dataID);
  viewStore.setActiveView(viewID);
};

describe('comparison store — pair selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seatImage('img-a');
    seatImage('img-b');
    seatImage('img-c');
  });

  it('keeps the prior in its role when the current study is closed', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    // The reader clicked the prior pane, so it holds the active view.
    readImageIn('img-b');

    useDatasetStore().remove('img-a');
    comparison.autoSelectStudies();

    expect(comparison.priorImageID).toBe('img-b');
    expect(comparison.currentImageID).toBe('img-c');
  });

  it('adopts the study being read as current when it is not the prior', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    readImageIn('img-c');

    useDatasetStore().remove('img-a');
    comparison.autoSelectStudies();

    expect(comparison.currentImageID).toBe('img-c');
    expect(comparison.priorImageID).toBe('img-b');
  });

  it('forgets a deleted study and the nudge that aligned it', () => {
    const comparison = useComparisonStore();
    comparison.setCurrentImageID('img-a');
    comparison.setPriorImageID('img-b');
    comparison.setSliceOffset(3);
    expect(comparison.sliceOffset).toBe(3);

    useDatasetStore().remove('img-b');

    expect(comparison.priorImageID).toBeNull();
    expect(comparison.sliceOffsetByPair).toEqual({});
  });
});
