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
      if (store.reportRestoredPresentation(imageID)) {
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

  /** Only an auto window depends on the histogram; nothing else does. */
  const needsHistogram = computed(
    () => store.appliedProtocol?.windowLevel.kind === 'auto'
  );

  watch(
    [currentImageID, isImageLoading, autoRangesReady, needsHistogram],
    ([imageID, loading, ready, needsRanges]) => {
      if (!imageID || loading) return;
      if (imageID !== appliedFor || imageID === finalizedFor) return;
      // A protocol with a fixed window must still take effect on a study whose
      // histogram never arrives, so only auto windows wait for the ranges.
      if (needsRanges && !ready) return;
      finalizedFor = imageID;
      store.applyLoadedImageSettings(imageID);
    }
  );
}
