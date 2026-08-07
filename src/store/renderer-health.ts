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
  const recoveryAttempts = ref(0);
  const framesRendered = ref(0);
  const webglInfo = ref<Maybe<WebGLInfo>>(null);
  const approxTextureBytes = ref(0);
  const viewHealth = reactive<Record<string, ViewRendererHealth>>({});

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

  function getViewHealth(viewId: string): ViewRendererHealth {
    return viewHealth[viewId] ?? DEFAULT_VIEW_HEALTH;
  }

  /** A view is unusable if it failed itself or the whole context is gone. */
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
    delete viewHealth[viewId];
  }

  function reportContextLost() {
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
    viewHealth[viewId] = {
      ...viewHealth[viewId],
      healthy: false,
      reason,
      lastCheckedAt: Date.now(),
    };
    lastFailureAt.value = Date.now();
    if (status.value === 'healthy') {
      status.value = 'unhealthy';
      failureReason.value = reason;
    }
  }

  function reportViewHealthy(viewId: string) {
    registerView(viewId);
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
    status.value = 'recovering';
    renderTreeEpoch.value += 1;
  }

  function confirmRecovery() {
    status.value = 'healthy';
    failureReason.value = null;
    lastRecoveryAt.value = Date.now();
    markAllViews(true, 'context-lost');
  }

  function reportRecoveryFailed() {
    status.value = 'unrecoverable';
  }

  function $reset() {
    status.value = 'healthy';
    failureReason.value = null;
    contextLostCount.value = 0;
    contextRestoredCount.value = 0;
    lastFailureAt.value = null;
    lastRecoveryAt.value = null;
    recoveryAttempts.value = 0;
    framesRendered.value = 0;
    approxTextureBytes.value = 0;
    Object.keys(viewHealth).forEach((id) => delete viewHealth[id]);
  }

  return {
    status,
    failureReason,
    contextLostCount,
    contextRestoredCount,
    lastFailureAt,
    lastRecoveryAt,
    recoveryAttempts,
    framesRendered,
    webglInfo,
    approxTextureBytes,
    viewHealth,
    renderTreeEpoch,
    healthy,
    recovering,
    unhealthyViewIds,
    getViewHealth,
    isViewUnhealthy,
    registerView,
    unregisterView,
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
    $reset,
  };
});

export default useRendererHealthStore;
