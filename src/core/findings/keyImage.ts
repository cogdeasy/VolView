import { getViewApi } from '@/src/core/views/viewApiRegistry';

/** Cap on the long edge of a captured key image, in pixels. */
const MAX_EDGE = 1024;

/** How long to wait for the render pass that fulfills a capture. */
const CAPTURE_TIMEOUT_MS = 5000;

const withTimeout = <T>(promise: Promise<T>, message: string) => {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error(message)),
        CAPTURE_TIMEOUT_MS
      );
    }),
  ]).finally(() => window.clearTimeout(timer));
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterize image'));
    image.src = src;
  });

/**
 * Rasterizes an SVG overlay at the canvas resolution. The overlays are sized
 * by CSS, so the clone needs explicit pixel dimensions and a viewBox in CSS
 * pixels to scale up cleanly.
 */
async function rasterizeSvg(
  svg: SVGSVGElement,
  cssWidth: number,
  cssHeight: number,
  pixelWidth: number,
  pixelHeight: number
) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(pixelWidth));
  clone.setAttribute('height', String(pixelHeight));
  clone.setAttribute('viewBox', `0 0 ${cssWidth} ${cssHeight}`);
  const source = new XMLSerializer().serializeToString(clone);
  const encoded = window.btoa(unescape(encodeURIComponent(source)));
  return loadImage(`data:image/svg+xml;base64,${encoded}`);
}

/**
 * Captures a view as a PNG data URL: the WebGL canvas with the annotation SVG
 * overlays (rulers, labels, orientation text) composited on top, so the key
 * image shows the measurement it documents.
 *
 * @returns a PNG data URL, or null if the view is not mounted.
 * @throws if the view does not render, or the capture cannot be rasterized.
 */
export async function captureViewKeyImage(
  viewID: string
): Promise<string | null> {
  const view = getViewApi(viewID);
  if (!view) return null;

  // captureImages() only settles on the next render pass, so the capture has
  // to be registered before asking for one.
  const captured = view.renderWindow.captureImages()[0];
  if (!captured) return null;
  view.requestRender({ immediate: true });
  // An animating or suspended view may never run the pass that settles the
  // capture, and the button must not spin forever waiting for it.
  const base = await withTimeout(
    captured.then(loadImage),
    'The view did not render in time'
  );

  const container = view.renderWindowView.getContainer();
  const overlayRoot = container?.parentElement;
  const rect = container?.getBoundingClientRect();

  const scale = Math.min(1, MAX_EDGE / Math.max(base.width, base.height));
  const width = Math.round(base.width * scale);
  const height = Math.round(base.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(base, 0, 0, width, height);

  if (overlayRoot && rect && rect.width > 0 && rect.height > 0) {
    const svgs = [...overlayRoot.querySelectorAll('svg')];
    for (const svg of svgs) {
      try {
        const overlay = await rasterizeSvg(
          svg,
          rect.width,
          rect.height,
          width,
          height
        );
        ctx.drawImage(overlay, 0, 0, width, height);
      } catch {
        // An overlay that will not rasterize (e.g. a tainted resource) is not
        // worth losing the underlying capture over.
      }
    }
  }

  return canvas.toDataURL('image/png');
}
