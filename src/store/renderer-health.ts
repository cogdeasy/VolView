import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { Maybe } from '@/src/types';
import { WebGLInfo } from '@/src/utils/webglInfo';

/**
 * Why a view is considered unusable.
 *
 * - `context-lost`: the shared WebGL context was lost. Definitive.
 * - `blank-frame`: the view painted uniformly black while its data says
 *   visible pixels were expected. Corroborated heuristic.
 * - `stalled`: renders were requested but no frame was produced.
 */
export type RendererFailureReason = 'context-lost' | 'blank-frame' | 'stalled';

/**
 * Deliberately non-reactive: this is incremented on every rendered frame, and
 * writing to reactive state at frame rate re-triggers the effects that caused
 * the render. The monitor publishes it to the store on a timer instead.
 */
export const frameCounter = { total: 0 };

export type RendererStatus =
  | 'healthy'
  | 'unhealthy'
  | 'recovering'
  | 'unrecoverable';

export interface ViewRendererHealth {
  healthy: boolean;
  reason: Maybe<RendererFailureReason>;
  /** Consecutive samples where the canvas was blank but content was expected. */
  blankSamples: number;
  lastCheckedAt: number;
}

const DEFAULT_VIEW_HEALTH: ViewRendererHealth = {
  healthy: true,
  reason: null,
  blankSamples: 0,
  lastCheckedAt: 0,
};

/**
 * Tracks the health of the shared WebGL renderer and of each individual view.
 *
 * All views in the application blit from a single root WebGL canvas, so a
 * context loss is global while a blank frame is per-view.
 */
export const useRendererHealthStore = defineStore('renderer-health', () => {
  const status = ref<RendererStatus>('healthy');
  const failureReason = ref<Maybe<RendererFailureReason>>(null);
  const contextLostCount = ref(0);
  const contextRestoredCount = ref(0);
  const lastFailureAt = ref<Maybe<number>>(null);
  const lastRecoveryAt = ref<Maybe<number>>(null);
  const lastRecoveryAttemptAt = ref<Maybe<number>>(null);
  const recoveryAttempts = ref(0);
  const framesRendered = ref(0);
  const webglInfo = ref<Maybe<WebGLInfo>>(null);
  const approxTextureBytes = ref(0);
  const viewHealth = reactive<Record<string, ViewRendererHealth>>({});

  /**
   * Whether the reader has already been told the renderer is unavailable.
   * Lives here rather than in the monitor because recovery rebuilds the render
   * tree: the notice is raised by one monitor instance and dismissed by the
   * next one.
   */
  const noticeShown = ref(false);

  /**
   * Whether the last failure stopped being reported because its view was
   * closed rather than because anything was fixed. Closing the broken pane
   * must not produce an all-clear.
   */
  const failureLeftWithView = ref(false);

  /**
   * Bumped to force the whole render-window subtree to be torn down and
   * rebuilt. View state (camera, slice, window/level, layout) lives in
   * separate stores, so a remount restores the reader's place.
   */
  const renderTreeEpoch = ref(0);

  const healthy = computed(() => status.value === 'healthy');
  const recovering = computed(() => status.value === 'recovering');

  const unhealthyViewIds = computed(() =>
    Object.keys(viewHealth).filter((id) => !viewHealth[id].healthy)
  );

  const anyViewFailed = computed(() => unhealthyViewIds.value.length > 0);

  function getViewHealth(viewId: string): ViewRendererHealth {
    return viewHealth[viewId] ?? DEFAULT_VIEW_HEALTH;
  }

  /**
   * A view is unusable if it failed itself or the whole context is gone.
   *
   * Only context loss sets the global status, so this never occludes a view
   * whose own image is fine.
   */
  function isViewUnhealthy(viewId: string) {
    if (status.value === 'unhealthy' || status.value === 'unrecoverable')
      return true;
    return !getViewHealth(viewId).healthy;
  }

  function markAllViews(healthyState: boolean, reason: RendererFailureReason) {
    Object.keys(viewHealth).forEach((id) => {
      viewHealth[id] = {
        ...viewHealth[id],
        healthy: healthyState,
        reason: healthyState ? null : reason,
        blankSamples: 0,
      };
    });
  }

  function registerView(viewId: string) {
    if (!viewHealth[viewId]) {
      viewHealth[viewId] = { ...DEFAULT_VIEW_HEALTH };
    }
  }

  function unregisterView(viewId: string) {
    // A rebuild unmounts every view while they are still marked unhealthy;
    // that is the recovery running, not a failure walking out with its view.
    if (
      status.value !== 'recovering' &&
      viewHealth[viewId] &&
      !viewHealth[viewId].healthy
    ) {
      failureLeftWithView.value = true;
    }
    delete viewHealth[viewId];
  }

  function acknowledgeFailureLeftWithView() {
    failureLeftWithView.value = false;
  }

  function reportContextLost() {
    failureLeftWithView.value = false;
    contextLostCount.value += 1;
    lastFailureAt.value = Date.now();
    failureReason.value = 'context-lost';
    status.value = 'unhealthy';
    markAllViews(false, 'context-lost');
  }

  function reportContextRestored() {
    contextRestoredCount.value += 1;
  }

  function reportViewBlank(viewId: string) {
    registerView(viewId);
    const current = viewHealth[viewId];
    // Already failed: counting higher changes nothing and keeps every
    // dependent computed churning for as long as the view stays black.
    if (!current.healthy) return current.blankSamples;
    const blankSamples = current.blankSamples + 1;
    viewHealth[viewId] = {
      ...current,
      blankSamples,
      lastCheckedAt: Date.now(),
    };
    return blankSamples;
  }

  function reportViewFailed(viewId: string, reason: RendererFailureReason) {
    registerView(viewId);
    const current = viewHealth[viewId];
    if (!current.healthy && current.reason === reason) return;
    failureLeftWithView.value = false;
    viewHealth[viewId] = {
      ...viewHealth[viewId],
      healthy: false,
      reason,
      lastCheckedAt: Date.now(),
    };
    lastFailureAt.value = Date.now();
    // Deliberately does not touch the global status: one view painting black
    // says nothing about the others, and covering a good image is its own
    // diagnostic hazard.
  }

  function reportViewHealthy(viewId: string) {
    registerView(viewId);
    const current = viewHealth[viewId];
    // Called on every sample tick for every view; writing an unchanged record
    // would invalidate every dependent computed twice a second for nothing.
    if (current.healthy && current.blankSamples === 0) return;
    // A view that was broken and is now painting again is a real recovery.
    if (!current.healthy) failureLeftWithView.value = false;
    viewHealth[viewId] = {
      ...viewHealth[viewId],
      healthy: true,
      reason: null,
      blankSamples: 0,
      lastCheckedAt: Date.now(),
    };
  }

  function publishFrameCount() {
    framesRendered.value = frameCounter.total;
  }

  function setWebglInfo(info: Maybe<WebGLInfo>) {
    webglInfo.value = info;
  }

  function setApproxTextureBytes(bytes: number) {
    approxTextureBytes.value = bytes;
  }

  /**
   * Rebuild the render window in place. Marks the renderer as recovering; the
   * monitor confirms success once the rebuilt context produces frames.
   */
  function requestRecovery() {
    recoveryAttempts.value += 1;
    lastRecoveryAttemptAt.value = Date.now();
    status.value = 'recovering';
    renderTreeEpoch.value += 1;
  }

  function confirmRecovery() {
    status.value = 'healthy';
    failureReason.value = null;
    lastRecoveryAt.value = Date.now();
    failureLeftWithView.value = false;
    markAllViews(true, 'context-lost');
  }

  function reportRecoveryFailed() {
    status.value = 'unrecoverable';
  }

  function setNoticeShown(shown: boolean) {
    noticeShown.value = shown;
  }

  return {
    status,
    failureReason,
    contextLostCount,
    contextRestoredCount,
    lastFailureAt,
    lastRecoveryAt,
    lastRecoveryAttemptAt,
    recoveryAttempts,
    framesRendered,
    webglInfo,
    approxTextureBytes,
    viewHealth,
    renderTreeEpoch,
    noticeShown,
    failureLeftWithView,
    healthy,
    recovering,
    unhealthyViewIds,
    anyViewFailed,
    getViewHealth,
    isViewUnhealthy,
    registerView,
    unregisterView,
    acknowledgeFailureLeftWithView,
    reportContextLost,
    reportContextRestored,
    reportViewBlank,
    reportViewFailed,
    reportViewHealthy,
    publishFrameCount,
    setWebglInfo,
    setApproxTextureBytes,
    requestRecovery,
    confirmRecovery,
    reportRecoveryFailed,
    setNoticeShown,
  };
});

export default useRendererHealthStore;
