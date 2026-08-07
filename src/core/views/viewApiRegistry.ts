import { shallowReactive } from 'vue';
import type { VtkViewApi } from '@/src/types/vtk-types';

/**
 * Live VTK view APIs, keyed by view id.
 *
 * Rasterizing a view for a key image has to reach a mounted view's render
 * window from outside the view tree (the findings panel), which the component
 * hierarchy does not otherwise allow. Reactive so that a list of capture
 * sources tracks views mounting and unmounting.
 */
type RegisteredView = {
  api: VtkViewApi;
  /**
   * How to call this view when the view store has no entry for it — a panel of
   * a composite layout (the oblique grid) is mounted under an id of its own
   * that `viewByID` never contains.
   */
  name: string;
};

const viewApis = shallowReactive(new Map<string, RegisteredView>());

export function registerViewApi(viewID: string, api: VtkViewApi, name = '') {
  viewApis.set(viewID, { api, name });
}

export function unregisterViewApi(viewID: string, api: VtkViewApi) {
  if (viewApis.get(viewID)?.api === api) viewApis.delete(viewID);
}

export function getViewApi(viewID: string): VtkViewApi | undefined {
  return viewApis.get(viewID)?.api;
}

export function getRegisteredViews(): Array<{ id: string; name: string }> {
  return [...viewApis].map(([id, { name }]) => ({ id, name }));
}
