import { computed, watch } from 'vue';
import {
  getIsImageLoading,
  useCurrentImage,
} from '@/src/composables/useCurrentImage';
import { onImageDeleted } from '@/src/composables/onImageDeleted';
import { useViewStore } from '@/src/store/views';
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
  const viewStore = useViewStore();
  const { currentImageID, isImageLoading } = useCurrentImage('global');

  /**
   * Whether this study is what the viewer is showing, rather than what one
   * pane happens to hold. Opening a study binds every pane to it; dropping a
   * series into a single pane, or clicking into one that holds another series,
   * does not — and hanging then would replace the comparison layout the reader
   * just built with the new series' protocol.
   */
  const isStudyOpen = (imageID: string) => {
    const views = viewStore.layoutViews;
    return !!views.length && views.every((view) => view.dataID === imageID);
  };

  /**
   * The study on screen: the image every pane is bound to, or nothing while
   * the panes disagree. Watching this rather than the active view's image is
   * what catches a series being opened as a study after it was already put
   * into a pane by hand — the bindings change, the current image does not.
   */
  const openStudyID = computed(() => {
    const imageID = currentImageID.value;
    if (!imageID) return null;
    return isStudyOpen(imageID) ? imageID : null;
  });

  /**
   * Images this tab has hung, as opposed to ones it only reported on, kept by
   * the store because a protocol can also be hung by hand from the indicator
   * or the manager. `currentImageID` follows the active view's data, so it
   * also changes when the reader drops an image into a pane or focuses a pane
   * bound to something else; re-hanging then would throw away the arrangement
   * they just made by hand. Only a study in here may have its settings written
   * again later.
   */
  const hung = store.hungImages;
  /**
   * Images whose deferred, pixel-data phase has run. Kept apart from `hung`
   * because a study can be left mid-load: the reader opens A, switches to B
   * and comes back before A finished, and A still needs finalizing.
   */
  const finalized = new Set<string>();

  /**
   * Hangs a study, and runs the pixel-data phase itself when the image is
   * already loaded: the watcher that normally waits for loading to finish
   * only fires on a change, and a study can open long after its series
   * arrived — reopened from the data panel, or hung by the switch going on.
   */
  const hangNow = (imageID: string) => {
    // Only a study a protocol actually hung counts as hung: with automatic
    // hanging off, or with nothing matching, the views were left alone and
    // the study must still be hangable later.
    if (!store.applyForImage(imageID)) return;
    if (getIsImageLoading(imageID)) return;
    finalized.add(imageID);
    store.applyLoadedImageSettings(imageID);
  };

  // Loading the same series again is a new study opening, so it hangs again.
  // The store drops its own mark for the same reason.
  onImageDeleted((deletedIDs) => {
    deletedIDs.forEach((id) => finalized.delete(id));
  });

  watch(
    [currentImageID, openStudyID],
    ([imageID]) => {
      if (!imageID) return;
      // A study restored from a saved session keeps the presentation the
      // reader saved with it.
      if (store.reportRestoredPresentation(imageID)) return;
      if (hung.has(imageID)) {
        // Coming back to a study that was hung earlier: say which protocol
        // owns it, but leave the views alone.
        store.reportForImage(imageID);
        return;
      }
      // One pane's series: leave the layout, and the indicator, describing
      // what hung the study on screen.
      if (!isStudyOpen(imageID)) return;
      hangNow(imageID);
    },
    { immediate: true }
  );

  // The switch has to be true in both directions: turning hanging on hangs
  // what is already on screen rather than leaving the reader with an unhung
  // study and no way to trigger one short of reloading it, and turning it off
  // stops the pill and the protocol's chrome claiming the study.
  watch(
    () => store.settings.autoApply,
    (on) => {
      const imageID = currentImageID.value;
      if (!imageID) return;
      if (store.reportRestoredPresentation(imageID)) return;
      // Already hung: the views stay as they are either way, and reporting
      // takes the indicator and chrome with the switch.
      if (!on || hung.has(imageID)) {
        store.reportForImage(imageID);
        return;
      }
      // The panes are holding more than this series: turning a switch on is no
      // more a reason to take a comparison apart than opening a series into
      // one pane is.
      if (!isStudyOpen(imageID)) return;
      hangNow(imageID);
    }
  );

  // Hanging a study by hand goes through the same two phases as hanging it
  // automatically: picking a protocol from the indicator while the study is
  // still streaming must not cost it its volume preset, slice position and
  // window.
  watch(
    () => store.manualApply,
    (manual) => {
      if (!manual) return;
      const { imageID } = manual;
      // Whether the deferred phase can run turns on whether this image has its
      // pixel data, not on whether it happens to be the active one.
      if (getIsImageLoading(imageID)) {
        // The load-finished watcher below will pick it up.
        finalized.delete(imageID);
        return;
      }
      finalized.add(imageID);
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
    if (!hung.has(imageID) || finalized.has(imageID)) return;
    finalized.add(imageID);
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
    if (!hung.has(imageID) || !finalized.has(imageID)) return;
    store.applyAppliedWindowLevel(imageID);
  });
}
