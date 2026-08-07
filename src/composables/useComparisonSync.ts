import { computed, nextTick, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { Vector3 } from '@kitware/vtk.js/types';
import { useComparisonStore } from '@/src/store/comparison';
import { useViewStore } from '@/src/store/views';
import { useViewSliceStore } from '@/src/store/view-configs/slicing';
import { useViewCameraStore } from '@/src/store/view-configs/camera';
import { useWindowingStore } from '@/src/store/view-configs/windowing';
import {
  copyInPlaneComponents,
  currentSliceToPriorSlice,
  maxSlice,
  priorSliceToCurrentSlice,
} from '@/src/utils/comparison';
import type { ComparisonPane } from '@/src/store/comparison';
import type { CameraConfig } from '@/src/store/view-configs/types';
import type { Maybe } from '@/src/types';

interface PaneSlice extends ComparisonPane {
  slice: number;
}

/**
 * Keeps a comparison pair navigating together: slice position by patient
 * coordinate, window/level, and zoom/pan, each independently unlinkable.
 *
 * Meant to be installed once, at app level.
 */
export function useComparisonSync() {
  const comparison = useComparisonStore();
  const viewStore = useViewStore();
  const sliceStore = useViewSliceStore();
  const cameraStore = useViewCameraStore();
  const windowingStore = useWindowingStore();

  const { isComparisonLayout } = storeToRefs(comparison);

  // --- bind each comparison pane to its study --- //

  // Slots the pair has taken over, so leaving comparison hands back those and
  // nothing else. A layout switch can swap the view sitting in a slot, and the
  // replacement inherits the dataset, so claims follow the replacement.
  const claimedViewIDs = new Set<string>();

  // What this composable last wrote into each slot, so a binding that came
  // from somewhere else can be told apart from one of our own.
  const boundByPair = new Map<string, Maybe<string>>();

  viewStore.LayoutViewReplacedEvent.on((oldViewID, newViewID) => {
    if (claimedViewIDs.delete(oldViewID)) claimedViewIDs.add(newViewID);
    // The replacement inherits the slot's dataset, so it inherits the record
    // of who put it there — otherwise the pair reads its own binding as the
    // reader's and the entry for a view that is gone is never dropped.
    if (boundByPair.has(oldViewID)) {
      boundByPair.set(newViewID, boundByPair.get(oldViewID));
      boundByPair.delete(oldViewID);
    }
  });

  function bindPanes() {
    comparison.panes.forEach((pane) => {
      claimedViewIDs.add(pane.viewID);
      const shown = viewStore.getView(pane.viewID)?.dataID;
      if (shown === pane.imageID) {
        boundByPair.set(pane.viewID, shown);
        return;
      }

      // Something outside the comparison bar put another loaded study in this
      // slot while the pair held it — a drag onto the pane, "show in all
      // views", a restored session binding its views as each dataset arrives.
      // That is a reader's choice about this side of the pair, so the role
      // follows it rather than snapping back. What a slot happened to show
      // before the pair claimed it is not such a choice, and handing a pane
      // the study already on the other side would collapse the pair.
      const other =
        pane.role === 'current'
          ? comparison.priorImageID
          : comparison.currentImageID;
      const chosenElsewhere =
        !!shown &&
        boundByPair.has(pane.viewID) &&
        shown !== boundByPair.get(pane.viewID) &&
        shown !== other &&
        comparison.candidates.some((study) => study.imageID === shown);

      if (chosenElsewhere) {
        boundByPair.set(pane.viewID, shown);
        if (pane.role === 'current') comparison.setCurrentImageID(shown);
        else comparison.setPriorImageID(shown);
        return;
      }

      boundByPair.set(pane.viewID, pane.imageID);
      viewStore.setDataForView(pane.viewID, pane.imageID);
    });
  }

  watch(
    [
      () => comparison.panes,
      () => comparison.currentImageID,
      () => comparison.priorImageID,
      // What the slots hold is watched too: a pane bound from elsewhere has to
      // be noticed before the pair can follow it.
      () =>
        comparison.panes
          .map((pane) => viewStore.getView(pane.viewID)?.dataID)
          .join(),
    ],
    bindPanes,
    { immediate: true, deep: true }
  );

  // Leaving comparison hands the prior's slots back to the current study, so
  // the reader never lands in a normal layout silently showing the prior. A
  // dataset the reader put in some other view is theirs, so only the slots the
  // pair claimed, and only while they still show the prior, are released.
  watch(isComparisonLayout, (inLayout, wasInLayout) => {
    if (inLayout || !wasInLayout) return;
    const { currentImageID, priorImageID } = comparison;
    if (currentImageID && priorImageID) {
      claimedViewIDs.forEach((viewID) => {
        if (viewStore.getView(viewID)?.dataID === priorImageID)
          viewStore.setDataForView(viewID, currentImageID);
      });
    }
    claimedViewIDs.clear();
    boundByPair.clear();
  });

  // --- slice position --- //

  const paneSlices = computed<PaneSlice[]>(() =>
    comparison.panes.map((pane) => ({
      ...pane,
      slice: sliceStore.getConfig(pane.viewID, pane.imageID).slice,
    }))
  );

  function partnerOf(pane: PaneSlice, panes: PaneSlice[]) {
    return panes.find(
      (other) => other.axis === pane.axis && other.role !== pane.role
    );
  }

  function mapSliceTo(driver: PaneSlice, target: PaneSlice) {
    const currentMetadata = comparison.metadataFor(comparison.currentImageID);
    const priorMetadata = comparison.metadataFor(comparison.priorImageID);
    const assessment = comparison.alignmentForAxis(driver.axis);
    if (!currentMetadata || !priorMetadata || !assessment) return null;

    const { mode } = assessment;
    // The nudge is a count of prior slices along one axis, so each pair on
    // screen carries its own: the axial correction is not a coronal one.
    const offset = comparison.sliceOffsetFor(driver.axis);
    if (driver.role === 'current') {
      return currentSliceToPriorSlice(
        currentMetadata,
        priorMetadata,
        driver.axis,
        driver.slice,
        mode,
        offset
      );
    }
    return priorSliceToCurrentSlice(
      currentMetadata,
      priorMetadata,
      target.axis,
      driver.slice,
      mode,
      offset
    );
  }

  // A pane is identified by view *and* study: picking another study in the
  // comparison bar makes the previous bookkeeping for that slot meaningless.
  const paneKey = (pane: ComparisonPane) => `${pane.viewID}|${pane.imageID}`;

  // Slices we wrote ourselves, so an echo is not mistaken for a user scroll.
  const echoes = new Map<string, number>();
  let previousSlices = new Map<string, number>();

  const snapshot = (panes: PaneSlice[]) =>
    new Map(panes.map((pane) => [paneKey(pane), pane.slice]));

  /**
   * Drops bookkeeping for panes that are no longer on screen: an echo left
   * unconsumed by a study switch would otherwise swallow a later scroll if
   * that view/study pair ever came back.
   */
  function pruneToPanes(map: Map<string, unknown>, panes: ComparisonPane[]) {
    const live = new Set(panes.map(paneKey));
    [...map.keys()].forEach((key) => {
      if (!live.has(key)) map.delete(key);
    });
  }

  function driveSlices(drivers: PaneSlice[], panes: PaneSlice[]) {
    drivers.forEach((driver) => {
      const target = partnerOf(driver, panes);
      if (!target) return;
      const slice = mapSliceTo(driver, target);
      if (slice == null || slice === target.slice) return;
      // The slice store snapshots a config's range on first write and never
      // revisits it, and this is the one writer that can fire before the
      // reader has touched the pane — conceivably while a streaming volume is
      // still growing. The range the mapping was just resolved against comes
      // along with the slice, so a pane cannot be left capped short.
      const metadata = comparison.metadataFor(target.imageID);
      const range = metadata
        ? { min: 0, max: maxSlice(metadata, target.axis) }
        : {};
      sliceStore.updateConfig(target.viewID, target.imageID, {
        ...range,
        slice,
      });
      // Only the echo marker is recorded: baselining the write here as well
      // would leave the marker unconsumed, and it would later swallow a
      // genuine scroll back onto the same slice. The marker is what the store
      // kept, not what was asked for, since the config clamps to its own
      // range — and a write the clamp turned into a no-op moves nothing, so it
      // leaves no marker to outlive it either.
      const kept = sliceStore.getConfig(target.viewID, target.imageID).slice;
      if (kept !== target.slice) echoes.set(paneKey(target), kept);
    });
  }

  watch(
    paneSlices,
    (panes) => {
      pruneToPanes(echoes, panes);
      if (!comparison.active || !comparison.links.slice) {
        previousSlices = snapshot(panes);
        return;
      }

      const changed = panes.filter((pane) => {
        const before = previousSlices.get(paneKey(pane));
        if (before === undefined || before === pane.slice) return false;
        // An echo is consumed once: the reader may well scroll back to a
        // slice we once wrote ourselves.
        if (echoes.get(paneKey(pane)) === pane.slice) {
          echoes.delete(paneKey(pane));
          return false;
        }
        return true;
      });

      // Both panes of an axis can change in one tick; the current study wins,
      // so the outcome never depends on iteration order.
      const drivers = changed.filter(
        (pane) =>
          pane.role === 'current' ||
          !changed.some(
            (other) => other.axis === pane.axis && other.role === 'current'
          )
      );

      previousSlices = snapshot(panes);
      driveSlices(drivers, panes);
    },
    { immediate: true }
  );

  /** Re-derives the prior panes from the current ones. */
  function realignFromCurrent() {
    if (!comparison.active || !comparison.links.slice) return;
    const panes = paneSlices.value;
    driveSlices(
      panes.filter((pane) => pane.role === 'current'),
      panes
    );
  }

  watch(
    [
      () =>
        comparison.axesInUse
          .map((axis) => comparison.sliceOffsetFor(axis))
          .join(),
      () => comparison.links.slice,
      () => comparison.pairKey,
      // A layout switch hands the pair fresh view slots, which start at their
      // own default slice until they are pulled back onto the current study.
      () => comparison.panes.map((pane) => pane.viewID).join(),
    ],
    () => nextTick(realignFromCurrent)
  );

  // --- window / level --- //

  let windowingEcho = false;

  function copyWindowLevel(
    fromViewID: Maybe<string>,
    fromImageID: string,
    toImageID: string
  ) {
    // Falling back to any view holding the study would read whichever one the
    // list happens to yield, including one kept off-layout; the pane the
    // reader is looking at is the window worth propagating.
    const sourceViewID =
      fromViewID ??
      comparison.panes.find((pane) => pane.imageID === fromImageID)?.viewID ??
      viewStore.getAllViews().find((view) => view.dataID === fromImageID)?.id;
    if (!sourceViewID) return;
    const { width, level } = windowingStore.getConfig(
      sourceViewID,
      fromImageID
    );
    windowingEcho = true;
    try {
      viewStore
        .getAllViews()
        .filter((view) => view.dataID === toImageID)
        .forEach((view) => {
          windowingStore.updateConfig(view.id, toImageID, { width, level });
        });
    } finally {
      windowingEcho = false;
    }
  }

  windowingStore.WindowingUpdateEvent.on((viewID, dataID) => {
    if (windowingEcho) return;
    if (!comparison.active || !comparison.links.windowLevel) return;
    const { currentImageID, priorImageID } = comparison;
    if (!currentImageID || !priorImageID) return;
    if (dataID === currentImageID)
      copyWindowLevel(viewID, dataID, priorImageID);
    else if (dataID === priorImageID)
      copyWindowLevel(viewID, dataID, currentImageID);
  });

  // Re-entering a comparison layout re-applies the link: the current study's
  // window may well have been retuned in a normal layout meanwhile.
  watch(
    [
      () => comparison.links.windowLevel,
      () => comparison.pairKey,
      () => comparison.active,
    ],
    ([linked]) => {
      const { currentImageID, priorImageID } = comparison;
      if (!linked || !comparison.active || !currentImageID || !priorImageID)
        return;
      copyWindowLevel(null, currentImageID, priorImageID);
    }
  );

  // --- zoom / pan --- //

  interface PaneCamera extends ComparisonPane {
    parallelScale: number | undefined;
    focalPoint: Vector3 | undefined;
    position: Vector3 | undefined;
  }

  const paneCameras = computed<PaneCamera[]>(() =>
    comparison.panes.map((pane) => {
      const config = cameraStore.getConfig(pane.viewID, pane.imageID);
      return {
        ...pane,
        parallelScale: config?.parallelScale,
        focalPoint: config?.focalPoint as Vector3 | undefined,
        position: config?.position as Vector3 | undefined,
      };
    })
  );

  const cameraKey = (camera: PaneCamera) =>
    JSON.stringify([camera.parallelScale, camera.focalPoint, camera.position]);

  const cameraEchoes = new Map<string, string>();
  let previousCameras = new Map<string, string>();

  const cameraSnapshot = (cameras: PaneCamera[]) =>
    new Map(cameras.map((camera) => [paneKey(camera), cameraKey(camera)]));

  function driveCameras(drivers: PaneCamera[], cameras: PaneCamera[]) {
    drivers.forEach((driver) => {
      const target = cameras.find(
        (other) => other.axis === driver.axis && other.role !== driver.role
      );
      if (!target) return;

      // Pan is only meaningful across studies that share patient
      // coordinates; zoom always is.
      const sharePatientSpace =
        comparison.alignmentForAxis(driver.axis)?.mode === 'physical';

      const patch: Partial<CameraConfig> = {};
      if (driver.parallelScale != null)
        patch.parallelScale = driver.parallelScale;
      // Focal point and position move together or not at all: the vector
      // between them is the direction of projection, and panning one of the
      // two would tilt the slice out of plane rather than slide it.
      if (
        sharePatientSpace &&
        driver.focalPoint &&
        target.focalPoint &&
        driver.position &&
        target.position
      ) {
        patch.focalPoint = copyInPlaneComponents(
          driver.focalPoint,
          target.focalPoint,
          driver.axis
        );
        patch.position = copyInPlaneComponents(
          driver.position,
          target.position,
          driver.axis
        );
      }
      if (!Object.keys(patch).length) return;

      const next = cameraKey({
        ...target,
        ...patch,
      } as PaneCamera);
      if (next === cameraKey(target)) return;

      cameraStore.updateConfig(target.viewID, target.imageID, patch);
      // The marker is what the store kept, read back the way the watcher will
      // read it, rather than a prediction of the merge: the config is pushed
      // into the live camera and pulled back, so a value that round-trips in
      // another shape would leave a marker nothing can ever consume.
      const kept = cameraStore.getConfig(target.viewID, target.imageID);
      cameraEchoes.set(
        paneKey(target),
        cameraKey({
          ...target,
          parallelScale: kept?.parallelScale,
          focalPoint: kept?.focalPoint as Vector3 | undefined,
          position: kept?.position as Vector3 | undefined,
        })
      );
    });
  }

  watch(
    paneCameras,
    (cameras) => {
      pruneToPanes(cameraEchoes, cameras);
      if (!comparison.active || !comparison.links.camera) {
        previousCameras = cameraSnapshot(cameras);
        return;
      }

      const changed = cameras.filter((camera) => {
        const key = cameraKey(camera);
        const before = previousCameras.get(paneKey(camera));
        // A pane seen for the first time — a new pair, a study switch — may
        // only drive from the current side, so a comparison opens with the
        // prior on the current's zoom instead of on its own auto-fit.
        if (before === undefined)
          return camera.role === 'current' && camera.parallelScale != null;
        if (before === key) return false;
        if (cameraEchoes.get(paneKey(camera)) === key) {
          cameraEchoes.delete(paneKey(camera));
          return false;
        }
        return true;
      });

      const drivers = changed.filter(
        (camera) =>
          camera.role === 'current' ||
          !changed.some(
            (other) => other.axis === camera.axis && other.role === 'current'
          )
      );

      previousCameras = cameraSnapshot(cameras);
      driveCameras(drivers, cameras);
    },
    { immediate: true, deep: true }
  );

  /** Pulls the prior panes onto the zoom and pan of the current ones. */
  function realignCamerasFromCurrent() {
    if (!comparison.active || !comparison.links.camera) return;
    const cameras = paneCameras.value;
    driveCameras(
      cameras.filter((camera) => camera.role === 'current'),
      cameras
    );
  }

  // Opening a comparison, relinking, or repairing the pair aligns zoom and pan
  // straight away, rather than leaving the two panes at their own auto-fit
  // until the reader happens to touch a camera.
  watch(
    [
      () => comparison.links.camera,
      () => comparison.pairKey,
      () => comparison.panes.map((pane) => pane.viewID).join(),
    ],
    () => nextTick(realignCamerasFromCurrent)
  );
}
