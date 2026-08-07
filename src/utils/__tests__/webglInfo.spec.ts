import { describe, expect, it } from 'vitest';
import { formatBytes, isSoftwareRenderer } from '@/src/utils/webglInfo';

describe('isSoftwareRenderer', () => {
  it('detects CPU rasterizers', () => {
    expect(
      isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')
    ).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
  });

  it('does not flag real GPUs', () => {
    expect(
      isSoftwareRenderer('ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)')
    ).toBe(false);
    expect(isSoftwareRenderer('Apple M2 Pro')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats byte counts for the diagnostics panel', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(80 * 1024 * 1024)).toBe('80.0 MB');
  });
});
