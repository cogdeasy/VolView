import { nextTick } from 'vue';
import { useViewStore } from '@/src/store/views';
import { useFindingsStore } from '@/src/store/findings';
import { getRegisteredViewIDs } from '@/src/core/views/viewApiRegistry';
import { captureViewKeyImage } from '@/src/core/findings/keyImage';
import { frameOfReferenceToImageSliceAndAxis } from '@/src/utils/frameOfReference';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import type { FindingID } from '@/src/types/finding';
import type { ViewInfo } from '@/src/types/views';

export type CaptureCandidate = {
  id: string;
  name: string;
};

export function useKeyImageCapture() {
  const viewStore = useViewStore();
  const findingsStore = useFindingsStore();
  const { currentImageMetadata } = useCurrentImage();

  /** Mounted views, in layout order. */
  function candidates(): CaptureCandidate[] {
    const mounted = new Set(getRegisteredViewIDs());
    return viewStore
      .getAllViews()
      .filter((view: ViewInfo) => mounted.has(view.id))
      .map((view: ViewInfo) => ({ id: view.id, name: view.name }));
  }

  /**
   * The view that best documents a finding: a 2D view along the finding's own
   * plane, else the active view, else whatever is mounted.
   */
  function preferredViewID(findingID: FindingID): string | undefined {
    const finding = findingsStore.findingByID[findingID];
    const available = candidates();
    if (available.length === 0) return undefined;
    const axis = finding
      ? frameOfReferenceToImageSliceAndAxis(
          finding.frameOfReference,
          currentImageMetadata.value,
          { allowOutOfBoundsSlice: true }
        )?.axis
      : undefined;
    const matching = available.find((candidate) => {
      const view = viewStore.getView(candidate.id);
      return view?.type === '2D' && view.options.orientation === axis;
    });
    if (matching) return matching.id;
    const active = available.find(
      (candidate) => candidate.id === viewStore.activeView
    );
    return (active ?? available[0]).id;
  }

  /**
   * Navigates to the finding and pins a rasterized snapshot of the view to it.
   * @returns whether a key image was captured.
   */
  async function captureKeyImage(findingID: FindingID, viewID?: string) {
    const finding = findingsStore.findingByID[findingID];
    if (!finding) return false;
    const targetID = viewID ?? preferredViewID(findingID);
    if (!targetID) return false;

    findingsStore.jumpToFinding(findingID);
    await nextTick();

    const dataURL = await captureViewKeyImage(targetID);
    if (!dataURL) return false;

    const view = viewStore.getView(targetID);
    findingsStore.setKeyImage(findingID, {
      dataURL,
      viewName: view?.name ?? 'View',
      slice: finding.slice,
      capturedAt: new Date().toISOString(),
    });
    return true;
  }

  return { candidates, preferredViewID, captureKeyImage };
}
