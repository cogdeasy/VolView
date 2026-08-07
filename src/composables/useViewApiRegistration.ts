import { toValue, watchEffect, type MaybeRefOrGetter, type Ref } from 'vue';
import type { VtkViewApi } from '@/src/types/vtk-types';
import {
  registerViewApi,
  unregisterViewApi,
} from '@/src/core/views/viewApiRegistry';

/**
 * Publishes a mounted view's API so non-view code (key image capture) can
 * reach its render window.
 *
 * @param name what to call the view when it has no view-store entry to take a
 *   name from, as the panels of the oblique grid do not.
 */
export function useViewApiRegistration(
  viewID: Ref<string>,
  api: Ref<VtkViewApi | undefined>,
  name?: MaybeRefOrGetter<string>
) {
  watchEffect((onCleanup) => {
    const view = api.value;
    if (!view) return;
    const id = viewID.value;
    registerViewApi(id, view, toValue(name) ?? '');
    onCleanup(() => unregisterViewApi(id, view));
  });
}
