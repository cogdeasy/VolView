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
 * Quiet period after a successful recovery. A context that dies again this
 * soon is not going to be fixed by another silent rebuild, so the reader is
 * given the decision instead of watching the views flicker in a loop.
 */
const RECOVERY_COOLDOWN = 30_000;

type RootRenderWindowView = VtkRenderWindowParentApi['renderWindowView'] & {
  getGraphicsMemoryInfo?: () => number;
};

/**
 * Module scope on purpose: recovery rebuilds the render tree, so the failure
 * notice is raised by one instance of this composable and dismissed by the
 * next one.
 */
let unavailableNoticeShown = false;

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

    const lastRecovery = health.lastRecoveryAt;
    if (lastRecovery == null || Date.now() - lastRecovery > RECOVERY_COOLDOWN) {
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
    const gl = getContext();
    if (gl?.isContextLost() && health.status !== 'unhealthy') {
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
      const gl = getContext();
      if (frameCounter.total > framesAtMount && !gl?.isContextLost()) {
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
    () => health.status,
    (status) => {
      if (status !== 'healthy' && !unavailableNoticeShown) {
        unavailableNoticeShown = true;
        messageStore.addError(Messages.RendererUnavailable.title, {
          details: Messages.RendererUnavailable.details,
          persist: true,
        });
      }
      if (status === 'recovering') {
        confirmDeadline = Date.now() + RECOVERY_CONFIRM_TIMEOUT;
        confirmTimer.resume();
      }
      if (status === 'unrecoverable') {
        messageStore.addError(Messages.RendererUnrecoverable.title, {
          details: Messages.RendererUnrecoverable.details,
          persist: true,
        });
      }
      if (status === 'healthy' && unavailableNoticeShown) {
        unavailableNoticeShown = false;
        messageStore.messages
          .filter((msg) => msg.title === Messages.RendererUnavailable.title)
          .forEach((msg) => messageStore.clearOne(msg.id));
        messageStore.addSuccess(Messages.RendererRecovered.title, {
          details: Messages.RendererRecovered.details,
        });
      }
    },
    { immediate: true }
  );
}
