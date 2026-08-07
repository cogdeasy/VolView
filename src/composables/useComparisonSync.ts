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
import type {
  CameraConfig,
  SliceConfig,
  WindowLevelConfig,
} from '@/src/store/view-configs/types';
import type { Maybe } from '@/src/types';

interface PaneSlice extends ComparisonPane {
  slice: number;
  max: number;
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
    const { panes } = comparison;
    const shownIn = new Map(
      panes.map((pane) => [pane.viewID, viewStore.getView(pane.viewID)?.dataID])
    );
    panes.forEach((pane) => claimedViewIDs.add(pane.viewID));

    // Something outside the comparison bar put another loaded study in this
    // slot while the pair held it — a drag onto the pane, "show in all
    // views", a restored session binding its views as each dataset arrives.
    // That is a reader's choice about this side of the pair, so the role
    // follows it rather than snapping back. What a slot happened to show
    // before the pair claimed it is not such a choice: entering comparison
    // must not adopt whatever slot two happened to hold. Nor may a drop put a
    // study in a role the pickers refuse to offer: a cine has no slices to
    // align and its slot renders a player rather than a pane.
    const diverged = panes.filter((pane) => {
      const shown = shownIn.get(pane.viewID);
      return (
        !!shown &&
        shown !== pane.imageID &&
        boundByPair.has(pane.viewID) &&
        shown !== boundByPair.get(pane.viewID) &&
        comparison.comparableCandidates.some((study) => study.imageID === shown)
      );
    });

    // "Open in all views" hands every slot the same study at once. That is one
    // choice about what to read, not one per pane: taken a pane at a time it
    // would land in the current role and then be pushed across into the prior
    // one by the next pane, leaving the reader's new study captioned as the
    // old one. It goes to the role the reader reads from, and the panes that
    // came with it are marked as dealt with so the loop below hands them back
    // to the study their role holds.
    const sameStudyEverywhere =
      diverged.length > 1 &&
      new Set(diverged.map((pane) => shownIn.get(pane.viewID))).size === 1;
    const adopted = sameStudyEverywhere
      ? (diverged.find((pane) => pane.role === 'current') ?? diverged[0])
      : diverged[0];

    // Otherwise one role at a time. A pane handed the study already on the
    // other side is a swap, not a collapse — the store's setters move the
    // displaced study across rather than letting one study fill both roles —
    // and a session restored with the roles the reader saved arrives exactly
    // so, one pane at a time as each study finishes loading. Changing a role
    // re-runs this, which settles whatever the change left mismatched.
    if (adopted) {
      const shown = shownIn.get(adopted.viewID)!;
      if (sameStudyEverywhere)
        diverged.forEach((pane) => boundByPair.set(pane.viewID, shown));
      else boundByPair.set(adopted.viewID, shown);
      if (adopted.role === 'current') comparison.setCurrentImageID(shown);
      else comparison.setPriorImageID(shown);
      return;
    }

    panes.forEach((pane) => {
      const shown = shownIn.get(pane.viewID);
      if (shown === pane.imageID) {
        boundByPair.set(pane.viewID, shown);
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
    comparison.panes.map((pane) => {
      const { slice, max } = sliceStore.getConfig(pane.viewID, pane.imageID);
      return { ...pane, slice, max };
    })
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

  // Where the slice store puts a pane that has no stored slice of its own,
  // mirroring `defaultSliceConfig`'s derivation from the range.
  const derivedMiddle = (max: number) => Math.ceil(max / 2);

  // A pane is identified by view *and* study: picking another study in the
  // comparison bar makes the previous bookkeeping for that slot meaningless.
  const paneKey = (pane: ComparisonPane) => `${pane.viewID}|${pane.imageID}`;

  // Slices we wrote ourselves, so an echo is not mistaken for a user scroll.
  const echoes = new Map<string, number>();
  // The range is remembered beside the slice: a pane nobody has scrolled sits
  // on the middle of its study by derivation, not by storage, so a volume
  // still arriving moves it without anyone touching it.
  let previousSlices = new Map<string, { slice: number; max: number }>();

  const snapshot = (panes: PaneSlice[]) =>
    new Map(
      panes.map((pane) => [paneKey(pane), { slice: pane.slice, max: pane.max }])
    );

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

  /**
   * A patch that lets a pane reach the whole of its study, or nothing when it
   * already can.
   *
   * The slice store captures a config's range the first time anything writes
   * one and never revisits it, and the pair is the earliest writer there is —
   * early enough to catch a volume still streaming in, whose metadata counts
   * only the slices that have arrived. Left alone, that short range would
   * stand for the rest of the session and the reader could not scroll into
   * the part that landed afterwards. Only widening is offered: a range that
   * shrank would drag the reader's slice down with it.
   */
  function wideningFor(pane: ComparisonPane): Partial<SliceConfig> {
    const metadata = comparison.metadataFor(pane.imageID);
    if (!metadata) return {};
    const max = maxSlice(metadata, pane.axis);
    return max > sliceStore.getConfig(pane.viewID, pane.imageID).max
      ? { min: 0, max }
      : {};
  }

  function driveSlices(drivers: PaneSlice[], panes: PaneSlice[]) {
    drivers.forEach((driver) => {
      const target = partnerOf(driver, panes);
      if (!target) return;
      const slice = mapSliceTo(driver, target);
      if (slice == null || slice === target.slice) return;
      sliceStore.updateConfig(target.viewID, target.imageID, {
        ...wideningFor(target),
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
    () =>
      comparison.panes
        .map((pane) => {
          const metadata = comparison.metadataFor(pane.imageID);
          return metadata ? maxSlice(metadata, pane.axis) : -1;
        })
        .join(),
    () => {
      comparison.panes.forEach((pane) => {
        const widening = wideningFor(pane);
        if (Object.keys(widening).length)
          sliceStore.updateConfig(pane.viewID, pane.imageID, widening);
      });
    }
  );

  watch(
    paneSlices,
    (panes) => {
      pruneToPanes(echoes, panes);
      if (!comparison.active || !comparison.links.slice) {
        // Nothing is being written while the link is off, so a marker left
        // over from before it was switched off can only ever be spent on a
        // scroll the reader made, swallowing it.
        echoes.clear();
        previousSlices = snapshot(panes);
        return;
      }

      const grew = panes.filter((pane) => {
        const before = previousSlices.get(paneKey(pane));
        return before !== undefined && pane.max > before.max;
      });

      // A pane nobody has scrolled has no stored slice: the store derives the
      // middle of the range, so growth moves it. A pane sitting anywhere else
      // is one the reader put there, and a study finishing its download in the
      // same breath is no reason to throw that away.
      const carriedByGrowth = (pane: PaneSlice) =>
        grew.includes(pane) && pane.slice === derivedMiddle(pane.max);

      const changed = panes.filter((pane) => {
        const before = previousSlices.get(paneKey(pane));
        // A marker stands for the next look at this pane and no longer: the
        // write that left it is the reason this ran, so a pane found anywhere
        // else has been moved by something since, and a marker left standing
        // would swallow a later scroll onto the slice it names.
        const echo = echoes.get(paneKey(pane));
        if (echo !== undefined) echoes.delete(paneKey(pane));
        if (before === undefined || before.slice === pane.slice) return false;
        // An echo is spent once: the reader may well scroll back to a slice we
        // wrote ourselves.
        if (echo === pane.slice) return false;
        // A study that just grew carried this pane's slice with it: the middle
        // of what has arrived is further in than the middle of what had
        // arrived before. That is the volume loading, not the reader reading,
        // and the older study finishing its download is no reason to move the
        // study being read.
        return !carriedByGrowth(pane);
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
      // A pane the growth moved is put back where the current study says it
      // belongs, rather than being left wherever the download landed it. A
      // pane the reader moved in the same breath drove the pair itself, and
      // realigning would undo them.
      if (grew.some(carriedByGrowth) && !drivers.length)
        nextTick(realignFromCurrent);
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

  // Held across one write and everything it triggers. `WindowingUpdateEvent`
  // is emitted synchronously from `updateConfig`, so the fan-out
  // `useSyncWindowing` performs happens inside the flag: were delivery ever
  // made asynchronous, this would have to become a value comparison instead.
  let windowingEcho = false;

  // The window a study wore before the pair first wrote one over it, kept per
  // study so leaving a comparison can hand it back. A width/level patch is a
  // hand-set window as far as the windowing store is concerned, so a linked
  // write clears the prior's automatic windowing — and that outlives the
  // comparison unless it is put back.
  interface WindowingRestore {
    viewID: string;
    before: Pick<WindowLevelConfig, 'width' | 'level' | 'auto' | 'useAuto'>;
    wrote: Pick<WindowLevelConfig, 'width' | 'level'>;
  }
  const windowingRestores = new Map<string, WindowingRestore>();

  /**
   * Hands a study back the window it had before the pair overwrote it.
   *
   * Only if the pair's own write is still standing: a window the reader tuned
   * while comparing is theirs, and restoring over it would throw away the very
   * thing they were comparing at.
   */
  function restoreWindowing(imageID: string) {
    const restore = windowingRestores.get(imageID);
    windowingRestores.delete(imageID);
    if (!restore) return;
    const { viewID, before, wrote } = restore;
    const now = windowingStore.getConfig(viewID, imageID);
    if (now.width !== wrote.width || now.level !== wrote.level) return;
    windowingEcho = true;
    try {
      windowingStore.updateConfig(
        viewID,
        imageID,
        before.useAuto
          ? { useAuto: true, auto: before.auto }
          : { width: before.width, level: before.level }
      );
    } finally {
      windowingEcho = false;
    }
  }

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
    // One write is enough: `useSyncWindowing` carries a view's window to every
    // other view holding the same study, so writing each of them here only
    // multiplies the same value by the number of views on screen.
    const targetViewID =
      comparison.panes.find((pane) => pane.imageID === toImageID)?.viewID ??
      viewStore.getAllViews().find((view) => view.dataID === toImageID)?.id;
    if (!targetViewID) return;
    // Only the prior is remembered. The current study is the one the reader
    // goes on reading, and a window they set while comparing is as deliberate
    // as any other; it is the older study, put away again afterwards, that
    // should not be left wearing a window derived from another series.
    if (toImageID === comparison.priorImageID) {
      const { auto, useAuto, ...rest } = windowingStore.getConfig(
        targetViewID,
        toImageID
      );
      if (!windowingRestores.has(toImageID))
        windowingRestores.set(toImageID, {
          viewID: targetViewID,
          before: { width: rest.width, level: rest.level, auto, useAuto },
          wrote: { width, level },
        });
      else windowingRestores.get(toImageID)!.wrote = { width, level };
    }
    windowingEcho = true;
    try {
      windowingStore.updateConfig(targetViewID, toImageID, { width, level });
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
  // window may well have been retuned in a normal layout meanwhile. Any study
  // the link no longer holds — because it was unlinked, because the pair
  // changed, or because the reader left comparison — gets its own window back.
  watch(
    [
      () => comparison.links.windowLevel,
      () => comparison.pairKey,
      () => comparison.active,
    ],
    ([linked]) => {
      const { currentImageID, priorImageID } = comparison;
      const linkedTo =
        linked && comparison.active && currentImageID ? priorImageID : null;
      [...windowingRestores.keys()]
        .filter((imageID) => imageID !== linkedTo)
        .forEach(restoreWindowing);
      if (!linkedTo || !currentImageID) return;
      copyWindowLevel(null, currentImageID, linkedTo);
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

  // Any field is enough to say a camera exists: a config restored from a
  // manifest carries whatever that manifest held, and reading the sighting
  // off `parallelScale` alone would leave such a pane forever first-seen and
  // so forever unable to drive.
  const hasCamera = (camera: PaneCamera) =>
    camera.parallelScale != null || !!camera.focalPoint || !!camera.position;

  // A pane counts as seen only once its camera exists. `usePersistCameraConfig`
  // writes a view's camera a tick or more after the pane appears, so recording
  // an empty camera as a sighting would let the arrival of the *prior's*
  // auto-fit read as the reader moving it, and the first thing a comparison
  // did would be to pull the study under the reader's eyes onto the old
  // study's framing.
  const cameraSnapshot = (cameras: PaneCamera[]) =>
    new Map(
      cameras
        .filter(hasCamera)
        .map((camera) => [paneKey(camera), cameraKey(camera)])
    );

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
      // another shape would leave a marker nothing can ever consume. That
      // round trip is `usePersistCameraConfig`'s `syncRef`, which flushes
      // synchronously — were it ever made asynchronous, the value read here
      // would be the pre-merge one and the marker would name a camera the
      // pane never holds.
      const kept = cameraStore.getConfig(target.viewID, target.imageID);
      const keptKey = cameraKey({
        ...target,
        parallelScale: kept?.parallelScale,
        focalPoint: kept?.focalPoint as Vector3 | undefined,
        position: kept?.position as Vector3 | undefined,
      });
      if (keptKey !== cameraKey(target))
        cameraEchoes.set(paneKey(target), keptKey);
    });
  }

  watch(
    paneCameras,
    (cameras) => {
      pruneToPanes(cameraEchoes, cameras);
      if (!comparison.active || !comparison.links.camera) {
        cameraEchoes.clear();
        previousCameras = cameraSnapshot(cameras);
        return;
      }

      const changed = cameras.filter((camera) => {
        const key = cameraKey(camera);
        const before = previousCameras.get(paneKey(camera));
        // As on the slice path, a marker stands for the next look at this pane
        // and no longer: a pane found anywhere but where the pair put it has
        // been moved by something since.
        const echo = cameraEchoes.get(paneKey(camera));
        if (echo !== undefined) cameraEchoes.delete(paneKey(camera));
        if (before === key) return false;
        // Echoes are spent before the first-sight rule, since a pane can be
        // written into existence by the pair itself: an echo nothing ever
        // matches would swallow a later move onto the same camera.
        if (echo === key) return false;
        // A pane seen for the first time — a new pair, a study switch — may
        // only drive from the current side, so a comparison opens with the
        // prior on the current's zoom instead of on its own auto-fit.
        if (before === undefined)
          return camera.role === 'current' && hasCamera(camera);
        return true;
      });

      const drivers = changed.filter(
        (camera) =>
          camera.role === 'current' ||
          !changed.some(
            (other) => other.axis === camera.axis && other.role === 'current'
          )
      );

      // A pane whose camera arrives after its partner's has already been
      // copied across took the zoom and none of the pan: there was no camera
      // on this side to slide, and the first-sight rule then bars the prior
      // from driving itself. Whichever order the two auto-fits land in, the
      // late one is pulled onto the current study rather than left framing
      // its own study's centre.
      const appeared = cameras.filter(
        (camera) =>
          camera.role !== 'current' &&
          hasCamera(camera) &&
          previousCameras.get(paneKey(camera)) === undefined
      );

      previousCameras = cameraSnapshot(cameras);
      driveCameras(drivers, cameras);
      if (appeared.length) nextTick(realignCamerasFromCurrent);
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
