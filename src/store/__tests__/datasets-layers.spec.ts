import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock only the vtk/image leaf dependencies `_addLayer` reaches, so the REAL
// layers store + REAL `useErrorMessage` wrapper run. The former suite mocked
// `addLayer` itself, which hid the bug this file guards: `addLayer` must return
// the built layer id on success (and `undefined` only when a build throws and
// `useErrorMessage` swallows it). vtkBoundingBox stays real — its `intersects`
// is deterministic over the numeric bounds below.
const { getImage, ensureSameSpace, untilLoaded, imageCache } = vi.hoisted(
  () => ({
    getImage: vi.fn(),
    ensureSameSpace: vi.fn(),
    untilLoaded: vi.fn(),
    imageCache: {
      getImageMetadata: vi.fn(),
      getVtkImageData: vi.fn(),
      addVTKImageData: vi.fn(),
      removeImage: vi.fn(),
      onImageDeleted: vi.fn(() => () => {}),
    },
  })
);

vi.mock('@/src/utils/dataSelection', () => ({
  getImage,
  isDicomImage: () => false,
}));
vi.mock('@/src/io/resample/resample', () => ({ ensureSameSpace }));
vi.mock('@/src/composables/untilLoaded', () => ({ untilLoaded }));
vi.mock('@/src/store/image-cache', () => ({
  useImageCacheStore: () => imageCache,
}));

import { useLayersStore } from '@/src/store/datasets-layers';
import useLayerColoringStore, {
  defaultLayersConfig,
} from '@/src/store/view-configs/layers';

const imageWithBounds = (bounds: number[]) => ({ getBounds: () => bounds });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  untilLoaded.mockResolvedValue(undefined);
  imageCache.getImageMetadata.mockReturnValue({ name: 'layer' });
  // ensureSameSpace echoes the source image; identity is enough here.
  ensureSameSpace.mockImplementation(
    async (_parent: unknown, source: unknown) => source
  );
});

describe('useLayersStore.addLayer return contract', () => {
  it('returns the built layer id when a valid pair overlaps', async () => {
    // Both images share physical space, so the build succeeds end to end.
    getImage.mockImplementation(async () =>
      imageWithBounds([0, 2, 0, 2, 0, 2])
    );
    const store = useLayersStore();

    const id = await store.addLayer('parent', 'source');

    expect(id).toBe('parent::source');
    expect(store.getLayers('parent')).toHaveLength(1);
    expect(imageCache.addVTKImageData).toHaveBeenCalledTimes(1);
  });

  it('returns undefined and removes the provisional layer when the build fails', async () => {
    // Non-intersecting bounds: `_addLayer` deletes its provisional layer and
    // throws; `useErrorMessage` swallows the throw and resolves to `undefined`.
    getImage.mockImplementation(async (selection: unknown) =>
      selection === 'parent'
        ? imageWithBounds([0, 1, 0, 1, 0, 1])
        : imageWithBounds([5, 6, 5, 6, 5, 6])
    );
    const store = useLayersStore();

    const id = await store.addLayer('parent', 'source');

    expect(id).toBeUndefined();
    expect(store.getLayers('parent')).toHaveLength(0);
    expect(imageCache.addVTKImageData).not.toHaveBeenCalled();
  });
});

describe('useLayersStore.remove', () => {
  beforeEach(() => {
    getImage.mockImplementation(async () =>
      imageWithBounds([0, 2, 0, 2, 0, 2])
    );
  });

  it('removing a base image prunes and disposes the layers it owns', async () => {
    // Removing a parent clears its parentToLayers entry and evicts each
    // resampled image it owns from the cache.
    const store = useLayersStore();
    await store.addLayer('parent', 'source');

    store.remove('parent');

    expect(store.getLayers('parent')).toHaveLength(0);
    expect(imageCache.removeImage).toHaveBeenCalledWith('parent::source');
  });

  it('drops the layer coloring config so a re-added layer starts from defaults', async () => {
    // The layer coloring config is keyed by layer id, and layer ids are
    // derived from the parent/source pair — so a stale config would be
    // inherited verbatim when the same layer is added again.
    const store = useLayersStore();
    const coloringStore = useLayerColoringStore();
    await store.addLayer('parent', 'source');
    coloringStore.updateBlendConfig('view-1', 'parent::source', {
      opacity: 0.9,
    });

    store.deleteLayer('parent', 'source');

    expect(coloringStore.configs['view-1']?.['parent::source']).toBeUndefined();
    expect(
      coloringStore.getConfig('view-1', 'parent::source').blendConfig.opacity
    ).toBe(defaultLayersConfig().blendConfig.opacity);
  });

  it('removing a layer source prunes it from every parent layer list', async () => {
    const store = useLayersStore();
    await store.addLayer('parent', 'source');

    store.remove('source');

    expect(store.getLayers('parent')).toHaveLength(0);
    expect(imageCache.removeImage).toHaveBeenCalledWith('parent::source');
  });
});
