import { watchEffect, type Ref } from 'vue';
import type { VtkViewApi } from '@/src/types/vtk-types';
import {
  registerViewApi,
  unregisterViewApi,
} from '@/src/core/views/viewApiRegistry';

/**
 * Publishes a mounted view's API so non-view code (key image capture) can
 * reach its render window.
 */
export function useViewApiRegistration(
  viewID: Ref<string>,
  api: Ref<VtkViewApi | undefined>
) {
  watchEffect((onCleanup) => {
    const view = api.value;
    if (!view) return;
    const id = viewID.value;
    registerViewApi(id, view);
    onCleanup(() => unregisterViewApi(id, view));
  });
}
