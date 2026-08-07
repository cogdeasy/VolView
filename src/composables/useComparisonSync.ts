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
  priorSliceToCurrentSlice,
} from '@/src/utils/comparison';
import type { ComparisonPane } from '@/src/store/comparison';
import type { CameraConfig } from '@/src/store/view-configs/types';

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

  watch(
    [
      () => comparison.panes,
      () => comparison.currentImageID,
      () => comparison.priorImageID,
    ],
    () => {
      comparison.panes.forEach((pane) => {
        if (viewStore.getView(pane.viewID)?.dataID !== pane.imageID) {
          viewStore.setDataForView(pane.viewID, pane.imageID);
        }
      });
    },
    { immediate: true, deep: true }
  );

  // Leaving comparison hands every slot back to the current study, so the
  // reader never lands in a normal layout silently showing the prior.
  watch(isComparisonLayout, (inLayout, wasInLayout) => {
    if (wasInLayout && !inLayout && comparison.currentImageID) {
      viewStore.setDataForAllViews(comparison.currentImageID);
    }
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
    const offset = comparison.sliceOffset;
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

  // Slices we wrote ourselves, so an echo is not mistaken for a user scroll.
  const echoes = new Map<string, number>();
  let previousSlices = new Map<string, number>();

  const snapshot = (panes: PaneSlice[]) =>
    new Map(panes.map((pane) => [pane.viewID, pane.slice]));

  function driveSlices(drivers: PaneSlice[], panes: PaneSlice[]) {
    drivers.forEach((driver) => {
      const target = partnerOf(driver, panes);
      if (!target) return;
      const slice = mapSliceTo(driver, target);
      if (slice == null || slice === target.slice) return;
      echoes.set(target.viewID, slice);
      previousSlices.set(target.viewID, slice);
      sliceStore.updateConfig(target.viewID, target.imageID, { slice });
    });
  }

  watch(
    paneSlices,
    (panes) => {
      if (!comparison.active || !comparison.links.slice) {
        previousSlices = snapshot(panes);
        return;
      }

      const drivers = panes.filter((pane) => {
        const before = previousSlices.get(pane.viewID);
        if (before === undefined || before === pane.slice) return false;
        // An echo is consumed once: the reader may well scroll back to a
        // slice we once wrote ourselves.
        if (echoes.get(pane.viewID) === pane.slice) {
          echoes.delete(pane.viewID);
          return false;
        }
        return true;
      });

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
      () => comparison.sliceOffset,
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

  function copyWindowLevel(fromImageID: string, toImageID: string) {
    const source = viewStore
      .getAllViews()
      .find((view) => view.dataID === fromImageID);
    if (!source) return;
    const { width, level } = windowingStore.getConfig(source.id, fromImageID);
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

  windowingStore.WindowingUpdateEvent.on((_viewID, dataID) => {
    if (windowingEcho) return;
    if (!comparison.active || !comparison.links.windowLevel) return;
    const { currentImageID, priorImageID } = comparison;
    if (!currentImageID || !priorImageID) return;
    if (dataID === currentImageID) copyWindowLevel(dataID, priorImageID);
    else if (dataID === priorImageID) copyWindowLevel(dataID, currentImageID);
  });

  watch(
    [() => comparison.links.windowLevel, () => comparison.pairKey],
    ([linked]) => {
      const { currentImageID, priorImageID } = comparison;
      if (!linked || !comparison.active || !currentImageID || !priorImageID)
        return;
      copyWindowLevel(currentImageID, priorImageID);
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
    new Map(cameras.map((camera) => [camera.viewID, cameraKey(camera)]));

  watch(
    paneCameras,
    (cameras) => {
      if (!comparison.active || !comparison.links.camera) {
        previousCameras = cameraSnapshot(cameras);
        return;
      }

      const drivers = cameras.filter((camera) => {
        const key = cameraKey(camera);
        const before = previousCameras.get(camera.viewID);
        if (before === undefined || before === key) return false;
        if (cameraEchoes.get(camera.viewID) === key) {
          cameraEchoes.delete(camera.viewID);
          return false;
        }
        return true;
      });

      previousCameras = cameraSnapshot(cameras);

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
        if (sharePatientSpace && driver.focalPoint && target.focalPoint) {
          patch.focalPoint = copyInPlaneComponents(
            driver.focalPoint,
            target.focalPoint,
            driver.axis
          );
        }
        if (sharePatientSpace && driver.position && target.position) {
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

        cameraEchoes.set(target.viewID, next);
        previousCameras.set(target.viewID, next);
        cameraStore.updateConfig(target.viewID, target.imageID, patch);
      });
    },
    { immediate: true, deep: true }
  );
}
