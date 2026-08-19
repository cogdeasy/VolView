import { computed, unref, watchEffect, type MaybeRef, type Ref } from 'vue';
import {
  useViewDisplayStore,
  type ViewBackground,
} from '@/src/store/view-display';
import type { Maybe } from '@/src/types';
import type { VtkViewApi } from '@/src/types/vtk-types';

type RGBA = [number, number, number, number];

// The gradient background is drawn by CSS behind a transparent canvas clear
// color, since vtk.js renderers only clear with a solid color.
const BACKGROUND_COLORS: Record<ViewBackground, RGBA> = {
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  gradient: [0, 0, 0, 0],
};

export function useViewBackground(
  viewID: MaybeRef<string>,
  vtkView: Ref<Maybe<VtkViewApi>>
) {
  const displayStore = useViewDisplayStore();
  const background = computed<ViewBackground>(
    () => displayStore.getConfig(unref(viewID)).background
  );

  watchEffect(() => {
    const view = vtkView.value;
    if (!view) return;
    const [r, g, b, a] = BACKGROUND_COLORS[background.value];
    view.renderer.setBackground(r, g, b, a);

    // Views share one WebGL canvas; each view's own canvas mirrors it through
    // a 2D drawImage, which composites source-over by default and so keeps the
    // previous opaque frame when the clear color is transparent.
    const context2D = view.renderWindowView.getContext2D();
    if (context2D) {
      context2D.globalCompositeOperation = a === 0 ? 'copy' : 'source-over';
    }

    view.requestRender({ immediate: true });
  });

  const backgroundClass = computed(() => `view-bg-${background.value}`);

  return { background, backgroundClass };
}
