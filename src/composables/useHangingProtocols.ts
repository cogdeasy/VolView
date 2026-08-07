import { computed, watch } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { onImageDeleted } from '@/src/composables/onImageDeleted';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';

/**
 * Hangs each study as it opens.
 *
 * The layout, window/level and chrome are applied as soon as the image is
 * bound to the views, so the reader sees the right arrangement immediately.
 * The settings that need pixel data — volume preset, slice position and the
 * window — are written again once loading finishes, and an auto window once
 * more when the histogram ranges arrive.
 */
export function useHangingProtocolAutoApply() {
  const store = useHangingProtocolStore();
  const { currentImageID, isImageLoading } = useCurrentImage('global');

  let appliedFor: string | null = null;
  let finalizedFor: string | null = null;
  /**
   * The image this tab hung, as opposed to one it only reported on. Only that
   * one may have its window written again later.
   */
  let hangingFor: string | null = null;
  /**
   * Images this tab has already hung. `currentImageID` follows the active
   * view's data, so it also changes when the reader drops an image into a
   * pane or focuses a pane bound to something else; re-hanging then would
   * throw away the arrangement they just made by hand.
   */
  const hung = new Set<string>();

  // Loading the same series again is a new study opening, so it hangs again.
  onImageDeleted((deletedIDs) => {
    deletedIDs.forEach((id) => hung.delete(id));
  });

  watch(
    currentImageID,
    (imageID) => {
      if (!imageID) {
        appliedFor = null;
        finalizedFor = null;
        hangingFor = null;
        return;
      }
      if (imageID === appliedFor) return;
      appliedFor = imageID;
      finalizedFor = null;
      hangingFor = null;
      // A study restored from a saved session keeps the presentation the
      // reader saved with it.
      if (store.reportRestoredPresentation(imageID)) {
        finalizedFor = imageID;
        return;
      }
      if (hung.has(imageID)) {
        // Coming back to a study that was hung earlier: say which protocol
        // owns it, but leave the views alone.
        finalizedFor = imageID;
        store.reportForImage(imageID);
        return;
      }
      // Only a study a protocol actually hung counts as hung: with automatic
      // hanging off, or with nothing matching, the views were left alone and
      // the study must still be hangable later.
      if (store.applyForImage(imageID)) {
        hung.add(imageID);
        hangingFor = imageID;
      }
    },
    { immediate: true }
  );

  // Turning automatic hanging on hangs what is already on screen, rather than
  // leaving the reader with an unhung study and no way to trigger one short of
  // reloading it.
  watch(
    () => store.settings.autoApply,
    (on) => {
      const imageID = currentImageID.value;
      if (!on || !imageID || imageID !== appliedFor || hung.has(imageID))
        return;
      if (store.reportRestoredPresentation(imageID)) return;
      if (!store.applyForImage(imageID)) return;
      hung.add(imageID);
      hangingFor = imageID;
      // The image is already loaded, so the phase that waits on pixel data
      // will not run again on its own.
      if (isImageLoading.value) return;
      finalizedFor = imageID;
      store.applyLoadedImageSettings(imageID);
    }
  );

  const autoRangesReady = computed(() =>
    store.autoRangesReady(currentImageID.value)
  );

  // The volume preset and the slice policy only need the pixel data, so they
  // run as soon as loading finishes. Auto ranges are never computed for some
  // images (cine, or a failed histogram worker), and waiting for them here
  // would strand those studies with no protocol settings at all.
  watch([currentImageID, isImageLoading], ([imageID, loading]) => {
    if (!imageID || loading) return;
    if (imageID !== appliedFor || imageID === finalizedFor) return;
    finalizedFor = imageID;
    store.applyLoadedImageSettings(imageID);
  });

  // An auto window is the one setting that does need the histogram: a view
  // that mounted before the ranges existed is pinned to the placeholder W/L,
  // so the window is written again when they arrive. Only for a study this
  // tab hung: on a study it merely reported on, the window on screen may be
  // one the reader set by hand.
  watch(autoRangesReady, (ready) => {
    const imageID = currentImageID.value;
    if (!ready || !imageID) return;
    if (imageID !== finalizedFor || imageID !== hangingFor) return;
    store.applyAppliedWindowLevel(imageID);
  });
}
