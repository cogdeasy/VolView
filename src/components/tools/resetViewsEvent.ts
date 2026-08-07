import { createEventHook } from '@vueuse/core';

const resetViewsEvent = createEventHook<void>();

export function useResetViewsEvents() {
  return { onClick: resetViewsEvent.on };
}

export function triggerResetViews() {
  resetViewsEvent.trigger();
}
