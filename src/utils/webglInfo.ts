import { Maybe } from '@/src/types';

export interface WebGLInfo {
  /** e.g. "WebGL 2.0 (OpenGL ES 3.0 Chromium)" */
  version: string;
  vendor: string;
  /** Unmasked renderer string when WEBGL_debug_renderer_info is available. */
  renderer: string;
  /** True when the renderer string matches a known CPU rasterizer. */
  softwareRendering: boolean;
  webgl2: boolean;
  maxTextureSize: number;
  max3DTextureSize: number;
  maxTextureUnits: number;
}

const SOFTWARE_RENDERER_PATTERNS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'software rasterizer',
  'microsoft basic render',
];

export function isSoftwareRenderer(renderer: string) {
  const lower = renderer.toLowerCase();
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => lower.includes(pattern));
}

function getParameterSafely(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  parameter: number
): unknown {
  try {
    return gl.getParameter(parameter);
  } catch {
    return null;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function collectWebGLInfo(
  gl: Maybe<WebGLRenderingContext | WebGL2RenderingContext>
): Maybe<WebGLInfo> {
  if (!gl) return null;

  const webgl2 =
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext;

  // WEBGL_debug_renderer_info is the only way to see the real GPU behind
  // ANGLE; without it Chrome reports a generic "Google Inc." / "ANGLE" pair.
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = asString(
    debugInfo
      ? getParameterSafely(gl, debugInfo.UNMASKED_RENDERER_WEBGL)
      : getParameterSafely(gl, gl.RENDERER),
    'unknown'
  );
  const vendor = asString(
    debugInfo
      ? getParameterSafely(gl, debugInfo.UNMASKED_VENDOR_WEBGL)
      : getParameterSafely(gl, gl.VENDOR),
    'unknown'
  );

  return {
    version: asString(getParameterSafely(gl, gl.VERSION), 'unknown'),
    vendor,
    renderer,
    softwareRendering: isSoftwareRenderer(renderer),
    webgl2,
    maxTextureSize: asNumber(getParameterSafely(gl, gl.MAX_TEXTURE_SIZE)),
    max3DTextureSize: webgl2
      ? asNumber(
          getParameterSafely(
            gl,
            (gl as WebGL2RenderingContext).MAX_3D_TEXTURE_SIZE
          )
        )
      : 0,
    maxTextureUnits: asNumber(
      getParameterSafely(gl, gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    ),
  };
}

/**
 * Deterministically frees a canvas' GPU resources.
 *
 * Dropping the last JS reference eventually does this, but browsers cap the
 * number of live WebGL contexts, so a render window that is torn down for
 * recovery must not wait for garbage collection.
 */
export function releaseWebGLContext(canvas: Maybe<HTMLCanvasElement>) {
  if (!canvas) return;
  const gl = (canvas.getContext('webgl2') ??
    canvas.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl || gl.isContextLost()) return;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
