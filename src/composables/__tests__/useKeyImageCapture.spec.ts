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

vi.mock('@/src/core/views/viewApiRegistry', () => ({
  getRegisteredViews: () => [{ id: 'view-axial', name: 'Axial' }],
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
  });

  const findingOn = (imageID: string) =>
    useFindingsStore().addFinding({ imageID, title: 'Lesion' });

  const axialViewOf = (dataID: string) => {
    const id = 'view-axial';
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
