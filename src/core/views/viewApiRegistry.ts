import type { VtkViewApi } from '@/src/types/vtk-types';

/**
 * Live VTK view APIs, keyed by view id.
 *
 * Rasterizing a view for a key image has to reach a mounted view's render
 * window from outside the view tree (the findings panel), which the component
 * hierarchy does not otherwise allow.
 */
const viewApis = new Map<string, VtkViewApi>();

export function registerViewApi(viewID: string, api: VtkViewApi) {
  viewApis.set(viewID, api);
}

export function unregisterViewApi(viewID: string, api: VtkViewApi) {
  if (viewApis.get(viewID) === api) viewApis.delete(viewID);
}

export function getViewApi(viewID: string): VtkViewApi | undefined {
  return viewApis.get(viewID);
}

export function getRegisteredViewIDs(): string[] {
  return [...viewApis.keys()];
}
