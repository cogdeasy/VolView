import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useKeyImageCapture } from '@/src/composables/useKeyImageCapture';
import { useFindingsStore } from '@/src/store/findings';
import { useViewStore } from '@/src/store/views';
import { useViewSliceStore } from '@/src/store/view-configs/slicing';
import { defaultImageMetadata } from '@/src/core/progressiveImage';

vi.mock('@/src/core/findings/keyImage', () => ({
  captureViewKeyImage: vi.fn(async () => 'data:image/png;base64,AAAA'),
}));

const { registeredViews } = vi.hoisted(() => ({
  registeredViews: [] as Array<{ id: string; name: string }>,
}));

vi.mock('@/src/core/views/viewApiRegistry', () => ({
  getRegisteredViews: () => registeredViews,
}));

vi.mock('@/src/composables/useCurrentImage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/src/composables/useCurrentImage')>();
  const { computed } = await import('vue');
  return {
    ...actual,
    useCurrentImage: () => ({
      ...actual.useCurrentImage(),
      currentImageMetadata: computed(() => defaultImageMetadata()),
    }),
  };
});

describe('useKeyImageCapture', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    registeredViews.length = 0;
    registeredViews.push({ id: 'view-axial', name: 'Axial' });
  });

  const findingOn = (imageID: string) =>
    useFindingsStore().addFinding({ imageID, title: 'Lesion' });

  const axialViewOf = (dataID: string, id = 'view-axial') => {
    useViewStore().viewByID[id] = {
      id,
      type: '2D',
      dataID,
      name: 'Axial',
      options: { orientation: 'Axial' },
    };
    return id;
  };

  it('records the slice of a view showing the finding image', async () => {
    const viewID = axialViewOf('image-1');
    const sliceStore = useViewSliceStore();
    sliceStore.updateConfig(viewID, 'image-1', { slice: 7, max: 20 });

    const findingsStore = useFindingsStore();
    const id = findingOn('image-1');
    await useKeyImageCapture().captureKeyImage(id, viewID);

    expect(findingsStore.findingByID[id].keyImage?.slice).toBe(
      sliceStore.getConfig(viewID, 'image-1').slice
    );
  });

  it('captures from a view showing the finding, not the first of its plane', () => {
    axialViewOf('image-2', 'view-other-series');
    const own = axialViewOf('image-1');
    registeredViews.unshift({ id: 'view-other-series', name: 'Axial (other)' });

    const id = findingOn('image-1');

    expect(useKeyImageCapture().preferredViewID(id)).toBe(own);
  });

  it('records no slice when the view shows another image', async () => {
    const viewID = axialViewOf('image-2');

    const findingsStore = useFindingsStore();
    const id = findingOn('image-1');
    await useKeyImageCapture().captureKeyImage(id, viewID);

    const { keyImage } = findingsStore.findingByID[id];
    expect(keyImage?.dataURL).toBeTruthy();
    expect(keyImage?.slice).toBeUndefined();
  });
});
