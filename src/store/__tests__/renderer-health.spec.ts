import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  frameCounter,
  useRendererHealthStore,
} from '@/src/store/renderer-health';

describe('Renderer health store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts healthy', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    expect(health.healthy).toBe(true);
    expect(health.isViewUnhealthy('Axial')).toBe(false);
  });

  it('marks every view unhealthy on context loss', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.registerView('3D');

    health.reportContextLost();

    expect(health.status).toBe('unhealthy');
    expect(health.failureReason).toBe('context-lost');
    expect(health.contextLostCount).toBe(1);
    expect(health.isViewUnhealthy('Axial')).toBe(true);
    expect(health.isViewUnhealthy('3D')).toBe(true);
  });

  it('reports an unregistered view as unhealthy once the context is lost', () => {
    const health = useRendererHealthStore();
    health.reportContextLost();
    expect(health.isViewUnhealthy('view-mounted-later')).toBe(true);
  });

  it('isolates a blank-frame failure to the affected view', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.registerView('Coronal');

    health.reportViewFailed('Axial', 'blank-frame');

    expect(health.isViewUnhealthy('Axial')).toBe(true);
    expect(health.getViewHealth('Axial').reason).toBe('blank-frame');
    expect(health.unhealthyViewIds).toEqual(['Axial']);
    // The other view is still trustworthy and must not be occluded.
    expect(health.isViewUnhealthy('Coronal')).toBe(false);
    expect(health.status).toBe('healthy');
    expect(health.anyViewFailed).toBe(true);
  });

  it('lets a failed view clear itself without a global recovery', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportViewFailed('Axial', 'blank-frame');

    health.reportViewHealthy('Axial');

    expect(health.isViewUnhealthy('Axial')).toBe(false);
    expect(health.anyViewFailed).toBe(false);
  });

  it('counts consecutive blank samples and clears them on recovery', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');

    expect(health.reportViewBlank('Axial')).toBe(1);
    expect(health.reportViewBlank('Axial')).toBe(2);

    health.reportViewHealthy('Axial');
    expect(health.getViewHealth('Axial').blankSamples).toBe(0);
    expect(health.reportViewBlank('Axial')).toBe(1);
  });

  it('bumps the render tree epoch when recovery is requested', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportContextLost();

    const epoch = health.renderTreeEpoch;
    health.requestRecovery();

    expect(health.renderTreeEpoch).toBe(epoch + 1);
    expect(health.status).toBe('recovering');
    expect(health.recoveryAttempts).toBe(1);
    // Timestamped even though it has not succeeded, so the cooldown applies to
    // back-to-back failures rather than only after a success.
    expect(health.lastRecoveryAttemptAt).not.toBeNull();
    expect(health.lastRecoveryAt).toBeNull();
  });

  it('clears all view failures once recovery is confirmed', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportContextLost();
    health.requestRecovery();
    health.confirmRecovery();

    expect(health.status).toBe('healthy');
    expect(health.failureReason).toBeNull();
    expect(health.isViewUnhealthy('Axial')).toBe(false);
    expect(health.lastRecoveryAt).not.toBeNull();
  });

  it('keeps views unhealthy when recovery fails', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportContextLost();
    health.requestRecovery();
    health.reportRecoveryFailed();

    expect(health.status).toBe('unrecoverable');
    expect(health.isViewUnhealthy('Axial')).toBe(true);
  });

  it('publishes the non-reactive frame counter on demand', () => {
    const health = useRendererHealthStore();
    frameCounter.total = 0;

    frameCounter.total += 12;
    expect(health.framesRendered).toBe(0);

    health.publishFrameCount();
    expect(health.framesRendered).toBe(12);
  });

  it('drops views that unmount', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportViewFailed('Axial', 'blank-frame');
    health.unregisterView('Axial');

    expect(health.unhealthyViewIds).toEqual([]);
  });

  it('remembers that a failure left with its view rather than being fixed', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportViewFailed('Axial', 'blank-frame');

    health.unregisterView('Axial');
    expect(health.failureLeftWithView).toBe(true);

    health.acknowledgeFailureLeftWithView();
    expect(health.failureLeftWithView).toBe(false);
  });

  it('does not flag a healthy view leaving as an unresolved failure', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.unregisterView('Axial');

    expect(health.failureLeftWithView).toBe(false);
  });

  it('treats a view that starts painting again as a real recovery', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.registerView('Coronal');
    health.reportViewFailed('Axial', 'blank-frame');
    health.unregisterView('Axial');
    health.reportViewFailed('Coronal', 'blank-frame');

    health.reportViewHealthy('Coronal');

    expect(health.failureLeftWithView).toBe(false);
  });

  it('stops rewriting state while a failed view stays blank', () => {
    const health = useRendererHealthStore();
    health.registerView('Axial');
    health.reportViewBlank('Axial');
    health.reportViewFailed('Axial', 'blank-frame');
    const failedAt = health.getViewHealth('Axial');

    expect(health.reportViewBlank('Axial')).toBe(1);
    health.reportViewFailed('Axial', 'blank-frame');

    expect(health.getViewHealth('Axial')).toBe(failedAt);
  });
});
