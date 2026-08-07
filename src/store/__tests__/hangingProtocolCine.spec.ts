// The phases keyed to pixel data bail out without it, so these need an image
// that looks loaded. Kept out of the main store spec, where the other tests
// deliberately run with no pixel data at all.

import { describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/src/composables/useCurrentImage', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/src/composables/useCurrentImage')
  >()),
  getImageData: () => ({}),
}));

import { useHangingProtocolStore } from '@/src/store/hanging-protocols';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import useViewSliceStore from '@/src/store/view-configs/slicing';
import { BUILT_IN_PROTOCOLS } from '@/src/core/hanging-protocols/seeds';

describe('hanging a cine clip', () => {
  // A fresh session each time: a protocol only claims the panes that are
  // still unbound, so two hangs in one session would not be comparable.
  const hang = (imageID: string, kind?: 'cine') => {
    setActivePinia(createPinia());
    localStorage.clear();
    const dicomStore = useDICOMStore();
    dicomStore.volumeInfo[imageID] = {
      Modality: 'CT',
      kind,
    } as (typeof dicomStore.volumeInfo)[string];
    const store = useHangingProtocolStore();
    // Volume rendering needs a real image in the cache; the slice policy is
    // what this is about.
    store.updateProtocol(BUILT_IN_PROTOCOLS[0].id, {
      volume: { preset: '', opacityShift: 0 },
    });
    const resetSlice = vi.spyOn(useViewSliceStore(), 'resetSlice');
    store.applyManually(BUILT_IN_PROTOCOLS[0].id, imageID);
    return resetSlice;
  };

  it('leaves the slice policy to the frame scrubber', () => {
    // A cine clip is scrubbed by frame, so a slice config written for it is
    // read by nothing and is still saved into the session.
    expect(hang('cine-1', 'cine')).not.toHaveBeenCalled();
    expect(hang('volume-1')).toHaveBeenCalled();
  });
});
