import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import useViewSliceStore from '@/src/store/view-configs/slicing';
import { useImageStore } from '@/src/store/datasets-images';
import { useViewStore } from '@/src/store/views';
import type { StateFile } from '@/src/io/state-file/schema';

const makeStateFile = (viewIDs: string[] = ['view-1']) =>
  ({
    manifest: {
      datasets: [{ id: 'image-1' }],
      views: [],
      viewByID: Object.fromEntries(viewIDs.map((id) => [id, { id }])),
    },
  }) as unknown as StateFile;

const makeImage = () => {
  const image = vtkImageData.newInstance();
  image.setDimensions([4, 4, 4]);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'scalars',
      numberOfComponents: 1,
      values: new Uint8Array(4 * 4 * 4),
    })
  );
  return image;
};

describe('Slice interpolation config', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults to interpolated slices', () => {
    const store = useViewSliceStore();
    expect(store.getConfig('view-1', 'image-1').interpolate).toBe(true);
  });

  it('applies the global toggle to existing and future configs', () => {
    const store = useViewSliceStore();
    store.updateConfig('view-1', 'image-1', { slice: 3, max: 10 });

    store.setInterpolateAll(false);

    expect(store.getConfig('view-1', 'image-1').interpolate).toBe(false);
    // an image without a stored config picks up the new default
    expect(store.getConfig('view-2', 'image-2').interpolate).toBe(false);
  });

  it('materializes configs so a toggle-only change is serialized', () => {
    const imageStore = useImageStore();
    imageStore.addVTKImageData('t2', makeImage(), { id: 'image-1' });
    const viewStore = useViewStore();
    viewStore.setDataForAllViews('image-1');
    const store = useViewSliceStore();

    store.setInterpolateAll(false);

    // every view has a stored config, not just ones the user has interacted with
    expect(Object.keys(store.configs).sort()).toEqual(
      [...viewStore.viewIDs].sort()
    );

    const stateFile = makeStateFile(viewStore.viewIDs);
    store.serialize(stateFile);
    viewStore.viewIDs.forEach((viewID) => {
      const savedConfig = stateFile.manifest.viewByID![viewID].config!;
      expect(savedConfig['image-1'].slice!.interpolate).toBe(false);
    });
  });

  it('round-trips through serialize/deserialize', () => {
    const store = useViewSliceStore();
    store.updateConfig('view-1', 'image-1', { max: 10, interpolate: false });

    const stateFile = makeStateFile();
    store.serialize(stateFile);
    const savedConfig = stateFile.manifest.viewByID!['view-1'].config!;
    expect(savedConfig['image-1'].slice!.interpolate).toBe(false);

    setActivePinia(createPinia());
    const restored = useViewSliceStore();
    restored.deserialize('view-1', savedConfig);

    expect(restored.getConfig('view-1', 'image-1').interpolate).toBe(false);
    expect(restored.interpolateByDefault).toBe(false);
  });
});
