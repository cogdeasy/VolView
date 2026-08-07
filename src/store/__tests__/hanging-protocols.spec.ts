import { describe, it, expect } from 'vitest';
import { readStoredProtocols } from '@/src/store/hanging-protocols';
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
