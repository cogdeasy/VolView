import { onScopeDispose, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { captureMessage } from '@sentry/vue';
import { Messages } from '@/src/constants';
import { useMessageStore } from '@/src/store/messages';
import {
  frameCounter,
  useRendererHealthStore,
} from '@/src/store/renderer-health';
import { VtkRenderWindowParentApi } from '@/src/types/vtk-types';
import { collectWebGLInfo } from '@/src/utils/webglInfo';

/** How often the shared context is polled for liveness. */
const POLL_INTERVAL = 2000;
/** How long a rebuilt render tree is given to produce its first frame. */
const RECOVERY_CONFIRM_TIMEOUT = 10_000;
/** How often the rebuilt tree is checked for that first frame. */
const RECOVERY_CONFIRM_INTERVAL = 500;
/**
 * Quiet period after a recovery attempt. A context that dies again this soon
 * is not going to be fixed by another silent rebuild, so the reader is given
 * the decision instead of watching the views flicker in a loop. Measured from
 * the attempt rather than from a success, so a context that never comes back
 * is not rebuilt forever.
 */
const RECOVERY_COOLDOWN = 30_000;

type RootRenderWindowView = VtkRenderWindowParentApi['renderWindowView'] & {
  getGraphicsMemoryInfo?: () => number;
};

/** Cleared together once the renderer is trustworthy again. */
const RENDERER_MESSAGE_TITLES: string[] = [
  Messages.RendererUnavailable.title,
  Messages.RendererUnrecoverable.title,
];

/**
 * Watches the single WebGL context that every view blits from.
 *
 * All views share one root canvas, so context loss here blacks out the whole
 * application at once - which is why this lives with the render window parent
 * rather than with an individual view.
 */
export function useRendererHealthMonitor(api: VtkRenderWindowParentApi) {
  const health = useRendererHealthStore();
  const messageStore = useMessageStore();
  const rwView = api.renderWindowView as RootRenderWindowView;
  const canvas = rwView.getCanvas();

  const getContext = () =>
    (canvas?.getContext('webgl2') ??
      canvas?.getContext('webgl')) as WebGLRenderingContext | null;

  // No context at all is as bad as a lost one - a rebuild whose context
  // creation failed outright must never be mistaken for a working display.
  const contextUsable = () => {
    const gl = getContext();
    return gl != null && !gl.isContextLost();
  };

  const hadContextAtMount = getContext() != null;

  health.setWebglInfo(collectWebGLInfo(getContext()));

  const onContextLost = () => {
    // vtk.js already calls preventDefault, which is what allows the browser
    // to hand back a restorable context.
    health.reportContextLost();
    captureMessage('WebGL context lost', {
      contexts: {
        renderer: {
          ...(health.webglInfo ?? {}),
          contextLostCount: health.contextLostCount,
          framesRendered: health.framesRendered,
        },
      },
    });

    const lastAttempt = health.lastRecoveryAttemptAt;
    if (lastAttempt == null || Date.now() - lastAttempt > RECOVERY_COOLDOWN) {
      health.requestRecovery();
    }
  };

  const onContextRestored = () => {
    health.reportContextRestored();
  };

  canvas?.addEventListener('webglcontextlost', onContextLost);
  canvas?.addEventListener('webglcontextrestored', onContextRestored);

  onScopeDispose(() => {
    canvas?.removeEventListener('webglcontextlost', onContextLost);
    canvas?.removeEventListener('webglcontextrestored', onContextRestored);
  });

  useIntervalFn(() => {
    // Only while healthy: a context already known to be gone must not be
    // re-reported while recovery is in flight or after it was given up on.
    if (health.status === 'healthy' && hadContextAtMount && !contextUsable()) {
      // Covers drivers that drop the context without firing the event.
      onContextLost();
    }
    health.setApproxTextureBytes(rwView.getGraphicsMemoryInfo?.() ?? 0);
    health.publishFrameCount();
  }, POLL_INTERVAL);

  // A rebuilt render tree remounts this composable; recovery is only declared
  // successful once the new context has actually painted. Software rendering
  // can take seconds to get there, so this polls rather than checking once.
  const framesAtMount = frameCounter.total;
  let confirmDeadline = 0;
  const confirmTimer = useIntervalFn(
    () => {
      // The renderer may have failed again since this timer was armed, in
      // which case its verdict is about a state that no longer exists.
      if (!health.recovering) {
        confirmTimer.pause();
        return;
      }
      if (frameCounter.total > framesAtMount && contextUsable()) {
        confirmTimer.pause();
        health.confirmRecovery();
      } else if (Date.now() > confirmDeadline) {
        confirmTimer.pause();
        health.reportRecoveryFailed();
      }
    },
    RECOVERY_CONFIRM_INTERVAL,
    { immediate: false }
  );

  // Single place that mirrors renderer state into the notification tray,
  // whichever detector raised the failure. Failure and recovery are often
  // requested in the same tick, so this keys off the settled status rather
  // than off individual transitions.
  watch(
    () => ({ status: health.status, viewFailed: health.anyViewFailed }),
    ({ status, viewFailed }, previous) => {
      // One failed view is enough to warn globally, even while the rest of the
      // layout keeps working.
      const degraded = status !== 'healthy' || viewFailed;

      if (degraded && !health.noticeShown) {
        health.setNoticeShown(true);
        messageStore.addError(Messages.RendererUnavailable.title, {
          details: Messages.RendererUnavailable.details,
          persist: true,
        });
      }
      if (status === 'recovering' && previous?.status !== 'recovering') {
        confirmDeadline = Date.now() + RECOVERY_CONFIRM_TIMEOUT;
        confirmTimer.resume();
      }
      if (status !== 'recovering' && previous?.status === 'recovering') {
        confirmTimer.pause();
      }
      // On the transition only: the watch source is a fresh object each time,
      // so an unguarded branch here would stack up duplicate errors.
      if (status === 'unrecoverable' && previous?.status !== 'unrecoverable') {
        messageStore.addError(Messages.RendererUnrecoverable.title, {
          details: Messages.RendererUnrecoverable.details,
          persist: true,
        });
      }
      if (!degraded && health.noticeShown) {
        health.setNoticeShown(false);
        messageStore.messages
          .filter((msg) => RENDERER_MESSAGE_TITLES.includes(msg.title))
          .forEach((msg) => messageStore.clearOne(msg.id));
        // Closing the broken view ends the warning, but nothing was repaired:
        // telling the reader rendering is back would be a lie.
        if (health.failureLeftWithView) {
          health.acknowledgeFailureLeftWithView();
        } else {
          messageStore.addSuccess(Messages.RendererRecovered.title, {
            details: Messages.RendererRecovered.details,
          });
        }
      }
    },
    { immediate: true }
  );
}
