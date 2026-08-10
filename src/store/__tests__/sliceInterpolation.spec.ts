import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import useViewSliceStore from '@/src/store/view-configs/slicing';
import type { StateFile } from '@/src/io/state-file/schema';

const makeStateFile = () =>
  ({
    manifest: {
      datasets: [{ id: 'image-1' }],
      views: [],
      viewByID: { 'view-1': { id: 'view-1' } },
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
