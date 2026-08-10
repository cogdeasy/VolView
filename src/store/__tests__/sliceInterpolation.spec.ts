import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
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
    imageStore.addVTKImageData('t2', vtkImageData.newInstance(), {
      id: 'image-1',
    });
    const viewStore = useViewStore();
    const store = useViewSliceStore();

    store.setInterpolateAll(false);

    const stateFile = makeStateFile(viewStore.viewIDs);
    store.serialize(stateFile);
    const savedConfig =
      stateFile.manifest.viewByID![viewStore.viewIDs[0]].config!;
    expect(savedConfig['image-1'].slice!.interpolate).toBe(false);
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
