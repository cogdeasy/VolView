import { describe, it, beforeEach, expect, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { useViewStore } from '@/src/store/views';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';
import { useHangingProtocolAutoApply } from '@/src/composables/useHangingProtocols';

// The active view's image, which the composable watches. Hoisted so the mock
// below and the tests share the same ref.
const { currentImageID, notLoading } = await vi.hoisted(async () => {
  const { ref } = await import('vue');
  return { currentImageID: ref<string | null>(null), notLoading: ref(false) };
});

vi.mock('@/src/composables/useCurrentImage', () => ({
  useCurrentImage: () => ({ currentImageID, isImageLoading: notLoading }),
  getIsImageLoading: () => false,
}));

vi.mock('@/src/composables/onImageDeleted', () => ({
  onImageDeleted: () => {},
}));

describe('hanging a study as it opens', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    currentImageID.value = null;
  });

  const watchStore = () => {
    const store = useHangingProtocolStore();
    store.reportRestoredPresentation = vi.fn(() => false);
    store.reportForImage = vi.fn(() => null);
    store.applyLoadedImageSettings = vi.fn();
    store.applyForImage = vi.fn(() => null);
    effectScope().run(() => useHangingProtocolAutoApply());
    return store;
  };

  it('leaves the layout alone for a series in a single pane', async () => {
    const store = watchStore();
    const views = useViewStore();

    views.setDataForView(views.layoutViews[0].id, 'image-1');
    currentImageID.value = 'image-1';
    await nextTick();

    expect(store.applyForImage).not.toHaveBeenCalled();
  });

  it('hangs the study when the panes bind to a series already current', async () => {
    const store = watchStore();
    const views = useViewStore();

    // The reader clicks a thumbnail: one pane, and the current image.
    views.setDataForView(views.layoutViews[0].id, 'image-1');
    currentImageID.value = 'image-1';
    await nextTick();

    // Then opens it as a study. Only the bindings change from here.
    views.setDataForAllViews('image-1');
    await nextTick();

    expect(store.applyForImage).toHaveBeenCalledWith('image-1');
  });

  it('does not take a comparison apart when hanging is switched on', async () => {
    const store = watchStore();
    const views = useViewStore();
    store.settings.autoApply = false;
    await nextTick();

    // Two series side by side, the reader's own arrangement.
    views.setDataForView(views.layoutViews[0].id, 'image-1');
    views.setDataForView(views.layoutViews[1].id, 'image-2');
    currentImageID.value = 'image-1';
    await nextTick();

    store.settings.autoApply = true;
    await nextTick();

    expect(store.applyForImage).not.toHaveBeenCalled();
  });

  it('puts the indicator back on what hung the panes, not the focused series', async () => {
    const store = watchStore();
    const views = useViewStore();
    store.settings.autoApply = false;
    await nextTick();

    // 'image-1' hung the arrangement; 'image-2' was put into a pane by hand
    // and is the one the reader has focused.
    store.hungImages.set('image-1', {
      protocolId: 'head-ct',
      reason: 'match',
      criteria: [],
      explanation: '',
      studyInstanceUID: 'study-1',
      imageID: 'image-1',
    });
    views.setDataForView(views.layoutViews[0].id, 'image-1');
    views.setDataForView(views.layoutViews[1].id, 'image-2');
    currentImageID.value = 'image-2';
    await nextTick();

    store.settings.autoApply = true;
    await nextTick();

    expect(store.applyForImage).not.toHaveBeenCalled();
    expect(store.reportForImage).toHaveBeenCalledWith('image-1');
  });
});
