// The pill does not always describe the series in the active pane: with a
// comparison on screen it keeps naming whatever hung the panes. Its actions
// have to follow what it says.

import { describe, it, beforeEach, expect, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const currentImageID = ref<string | null>('image-2');

vi.mock('@/src/composables/useCurrentImage', () => ({
  useCurrentImage: () => ({ currentImageID }),
  getImageData: () => null,
  getIsImageLoading: () => false,
}));

import HangingProtocolIndicator from '@/src/components/HangingProtocolIndicator.vue';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';

describe('HangingProtocolIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    currentImageID.value = 'image-2';
  });

  it('un-pins the study it names, not the focused series', () => {
    const store = useHangingProtocolStore();
    store.applied = {
      protocolId: 'head-ct',
      reason: 'override',
      criteria: [],
      explanation: '',
      studyInstanceUID: 'study-1',
      imageID: 'image-1',
    };
    vi.spyOn(store, 'clearOverride').mockImplementation(() => {});
    vi.spyOn(store, 'applyForImage').mockImplementation(() => null);

    const wrapper = shallowMount(HangingProtocolIndicator);
    (wrapper.vm as unknown as { unpin: () => void }).unpin();

    expect(store.clearOverride).toHaveBeenCalledWith('image-1');
    expect(store.applyForImage).toHaveBeenCalledWith('image-1', {
      force: true,
    });
  });

  it('falls back to the focused series when no report names a study', () => {
    const store = useHangingProtocolStore();
    vi.spyOn(store, 'applyManually').mockImplementation(() => {});

    const wrapper = shallowMount(HangingProtocolIndicator);
    (wrapper.vm as unknown as { switchTo: (id: string) => void }).switchTo(
      'chest-ct'
    );

    expect(store.applyManually).toHaveBeenCalledWith('chest-ct', 'image-2');
  });
});
