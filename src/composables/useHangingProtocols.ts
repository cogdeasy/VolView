import { watch } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';

/**
 * Hangs each study as it opens.
 *
 * The layout, window/level and chrome are applied as soon as the image is
 * bound to the views, so the reader sees the right arrangement immediately;
 * the settings that need pixel data (volume preset, slice position) are
 * applied again once loading finishes.
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
      store.applyForImage(imageID);
    },
    { immediate: true }
  );

  watch([currentImageID, isImageLoading], ([imageID, loading]) => {
    if (!imageID || loading) return;
    if (imageID !== appliedFor || imageID === finalizedFor) return;
    finalizedFor = imageID;
    store.applyLoadedImageSettings(imageID);
  });
}
