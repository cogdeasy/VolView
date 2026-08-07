import { nextTick } from 'vue';
import { useViewStore } from '@/src/store/views';
import { useViewSliceStore } from '@/src/store/view-configs/slicing';
import { useFindingsStore } from '@/src/store/findings';
import { getRegisteredViews } from '@/src/core/views/viewApiRegistry';
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

  /**
   * Mounted views, in layout order. A panel of a composite layout (the oblique
   * grid) is mounted under an id the view store does not know, so it is a
   * capture source on the strength of being mounted and carries its own name.
   */
  function candidates(): CaptureCandidate[] {
    const layoutOrder = viewStore
      .getAllViews()
      .map((view: ViewInfo) => view.id);
    const rank = (id: string) => {
      const index = layoutOrder.indexOf(id);
      return index === -1 ? layoutOrder.length : index;
    };
    return getRegisteredViews()
      .map(({ id, name }) => ({
        id,
        name: viewStore.getView(id)?.name ?? name ?? '',
      }))
      .filter((candidate) => !!candidate.name)
      .sort((a, b) => rank(a.id) - rank(b.id));
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
    // The captured view's own slice, not the finding's: the user may capture a
    // finding from a view along another axis, where the finding's slice index
    // means nothing. A 3D view, an oblique panel or a cine frame has no slice
    // index of its own to report.
    const slice =
      view?.type === '2D' && finding.frame == null
        ? useViewSliceStore().getConfig(targetID, finding.imageID).slice
        : undefined;
    findingsStore.setKeyImage(findingID, {
      dataURL,
      viewName:
        candidates().find((candidate) => candidate.id === targetID)?.name ??
        'View',
      slice,
      capturedAt: new Date().toISOString(),
    });
    return true;
  }

  return { candidates, preferredViewID, captureKeyImage };
}
