import { computed, watch } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';

/**
 * Hangs each study as it opens.
 *
 * The layout, window/level and chrome are applied as soon as the image is
 * bound to the views, so the reader sees the right arrangement immediately;
 * the settings that need pixel data (window, volume preset, slice position)
 * are applied again once loading finishes and once the histogram is ready.
 */
export function useHangingProtocolAutoApply() {
  const store = useHangingProtocolStore();
  const { currentImageID, isImageLoading } = useCurrentImage('global');

  let appliedFor: string | null = null;
  let finalizedFor: string | null = null;

  watch(
    currentImageID,
    (imageID) => {
      if (!imageID) {
        appliedFor = null;
        finalizedFor = null;
        return;
      }
      if (imageID === appliedFor) return;
      appliedFor = imageID;
      finalizedFor = null;
      // A study restored from a saved session keeps the presentation the
      // reader saved with it.
      if (store.takeRestoredPresentation(imageID)) {
        finalizedFor = imageID;
        return;
      }
      store.applyForImage(imageID);
    },
    { immediate: true }
  );

  const autoRangesReady = computed(() =>
    store.autoRangesReady(currentImageID.value)
  );

  watch(
    [currentImageID, isImageLoading, autoRangesReady],
    ([imageID, loading, ready]) => {
      if (!imageID || loading || !ready) return;
      if (imageID !== appliedFor || imageID === finalizedFor) return;
      finalizedFor = imageID;
      store.applyLoadedImageSettings(imageID);
    }
  );
}
