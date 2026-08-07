import { describe, it, expect } from 'vitest';
import {
  MAX_REMEMBERED_OVERRIDES,
  readStoredProtocols,
  rememberOverride,
} from '@/src/store/hanging-protocols';
import { BUILT_IN_PROTOCOLS } from '@/src/core/hanging-protocols/seeds';

describe('stored protocol list', () => {
  it('keeps an intentionally emptied list empty', () => {
    expect(readStoredProtocols('[]')).toEqual([]);
  });

  it('falls back to the built-ins for an unusable stored value', () => {
    expect(readStoredProtocols('not json')).toHaveLength(
      BUILT_IN_PROTOCOLS.length
    );
    expect(readStoredProtocols('{"protocols":[]}')).toHaveLength(
      BUILT_IN_PROTOCOLS.length
    );
  });

  it('drops entries that no longer parse', () => {
    const stored = JSON.stringify([BUILT_IN_PROTOCOLS[0], { id: 'broken' }]);
    const protocols = readStoredProtocols(stored);
    expect(protocols).toHaveLength(1);
    expect(protocols[0].id).toBe(BUILT_IN_PROTOCOLS[0].id);
  });
});

describe('remembered study overrides', () => {
  it('re-pins a study that already had an override', () => {
    const overrides = rememberOverride({ '1.2.3': 'a' }, '1.2.3', 'b');
    expect(overrides).toEqual({ '1.2.3': 'b' });
  });

  it('drops the oldest pins once the cap is reached', () => {
    let overrides: Record<string, string> = {};
    for (let i = 0; i < MAX_REMEMBERED_OVERRIDES + 5; i += 1) {
      overrides = rememberOverride(overrides, `study-${i}`, 'head-ct');
    }
    expect(Object.keys(overrides)).toHaveLength(MAX_REMEMBERED_OVERRIDES);
    expect(overrides['study-0']).toBeUndefined();
    expect(overrides[`study-${MAX_REMEMBERED_OVERRIDES + 4}`]).toBe('head-ct');
  });
});
