import { MaybeRef, computed, onScopeDispose, unref } from 'vue';
import { useIntervalFn, useDocumentVisibility } from '@vueuse/core';
import { Maybe } from '@/src/types';
import { View } from '@/src/core/vtk/types';
import { onVTKEvent } from '@/src/composables/onVTKEvent';
import { useImageCacheStore } from '@/src/store/image-cache';
import {
  frameCounter,
  useRendererHealthStore,
} from '@/src/store/renderer-health';
import { useSliceConfig } from '@/src/composables/useSliceConfig';
import { useWindowingConfig } from '@/src/composables/useWindowingConfig';
import { LPSAxis } from '@/src/types/lps';
import {
  cachedMaxScalarOnSlice,
  sliceShouldRenderVisiblePixels,
} from '@/src/utils/sliceContent';

/** How often a view's canvas is sampled for blankness. */
const SAMPLE_INTERVAL = 2000;
/** Consecutive blank samples before a view is declared broken. */
const BLANK_SAMPLES_TO_FAIL = 3;
/** Horizontal bands the canvas is read back in, so lit pixels exit early. */
const READBACK_BANDS = 8;
/** Smallest canvas worth inspecting. */
const MIN_CANVAS_SIZE = 32;
/** 8-bit value at or below which a pixel counts as black. */
const BLACK_THRESHOLD = 2;

/**
 * Whether every pixel of the view canvas is black.
 *
 * Reads at full resolution deliberately: an out-of-plane view of a thin slab
 * can be a single bright line a few pixels tall, and any downsampling averages
 * that line away and reports a black canvas that a reader can plainly see is
 * not black. Bands keep the common (non-black) case cheap.
 */
function canvasIsUniformlyBlack(canvas: HTMLCanvasElement): Maybe<boolean> {
  const { width, height } = canvas;
  if (width < MIN_CANVAS_SIZE || height < MIN_CANVAS_SIZE) return null;

  // vtk.js blits the shared WebGL output into this canvas' own 2D context.
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bandHeight = Math.ceil(height / READBACK_BANDS);
  for (let top = 0; top < height; top += bandHeight) {
    const rows = Math.min(bandHeight, height - top);
    const { data } = ctx.getImageData(0, top, width, rows);
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i + 3] > 0 &&
        (data[i] > BLACK_THRESHOLD ||
          data[i + 1] > BLACK_THRESHOLD ||
          data[i + 2] > BLACK_THRESHOLD)
      ) {
        return false;
      }
    }
  }
  return true;
}

export interface ViewRendererHealthOptions {
  viewId: MaybeRef<string>;
  imageId: MaybeRef<Maybe<string>>;
  view: MaybeRef<Maybe<View>>;
  /**
   * The slice axis for 2D views. Omitted for volume views, where blackness
   * cannot be predicted from the data alone and is therefore never treated as
   * a failure on its own.
   */
  axis?: MaybeRef<Maybe<LPSAxis>>;
}

/**
 * Per-view renderer health.
 *
 * The hard part is telling "the renderer stopped working" apart from "this
 * slice really is black". A blank canvas is only reported as a failure when
 * the image data, read through the view's current window/level, says visible
 * pixels were expected.
 */
export function useViewRendererHealth(options: ViewRendererHealthOptions) {
  const { viewId, imageId, view, axis } = options;
  const health = useRendererHealthStore();
  const imageCacheStore = useImageCacheStore();
  const visibility = useDocumentVisibility();

  const { slice } = useSliceConfig(viewId, imageId);
  const { width: windowWidth, level: windowLevel } = useWindowingConfig(
    viewId,
    imageId
  );

  health.registerView(unref(viewId));
  onScopeDispose(() => health.unregisterView(unref(viewId)));

  const canvas = computed(() => unref(view)?.renderWindowView.getCanvas());
  const interactor = computed(() => unref(view)?.interactor);

  // Frames this view has actually rasterized, so "blank" can be told apart
  // from "not painting at all".
  let framesThisView = 0;
  let framesAtLastSample = 0;
  onVTKEvent(interactor, 'onRenderEvent', () => {
    framesThisView += 1;
    frameCounter.total += 1;
  });

  /**
   * Whether the data says this view should currently show non-black pixels.
   * `null` means "cannot tell", which never counts as evidence of failure.
   */
  const expectsVisiblePixels = computed<Maybe<boolean>>(() => {
    const axisValue = axis ? unref(axis) : null;
    if (!axisValue) return null;

    const imageIdValue = unref(imageId);
    if (!imageIdValue) return null;

    const imageData = imageCacheStore.getVtkImageData(imageIdValue);
    const metadata = imageCacheStore.getImageMetadata(imageIdValue);
    if (!imageData || !metadata) return null;

    const ijkAxis = metadata.lpsOrientation[axisValue];
    const sliceIndex = slice.value;
    if (ijkAxis == null || sliceIndex == null) return null;

    const maxScalar = cachedMaxScalarOnSlice(
      imageIdValue,
      imageData,
      ijkAxis,
      sliceIndex
    );
    return sliceShouldRenderVisiblePixels(
      maxScalar,
      windowWidth.value,
      windowLevel.value
    );
  });

  function sample() {
    const id = unref(viewId);
    const painted = framesThisView > framesAtLastSample;
    framesAtLastSample = framesThisView;

    if (visibility.value === 'hidden') return;
    if (!health.healthy) return;

    const canvasValue = canvas.value;
    if (!canvasValue) return;

    if (expectsVisiblePixels.value !== true) {
      // Either a genuinely black slice or not enough information: both are
      // reasons to stay quiet rather than cry wolf on a diagnostic display.
      health.reportViewHealthy(id);
      return;
    }

    const blank = canvasIsUniformlyBlack(canvasValue);
    if (blank !== true) {
      health.reportViewHealthy(id);
      return;
    }

    const samples = health.reportViewBlank(id);
    if (samples >= BLANK_SAMPLES_TO_FAIL) {
      health.reportViewFailed(id, painted ? 'blank-frame' : 'stalled');
    }
  }

  useIntervalFn(sample, SAMPLE_INTERVAL);

  return { expectsVisiblePixels };
}
