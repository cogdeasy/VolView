import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  MAX_REMEMBERED_OVERRIDES,
  readStoredProtocols,
  rememberOverride,
  useHangingProtocolStore,
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

describe('restoring the shipped protocols', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('leaves the precedence order alone', () => {
    const store = useHangingProtocolStore();
    const mine = { ...store.protocols[1], id: 'mine', builtIn: false };
    store.addProtocol(mine);
    const order = store.protocols.map((protocol) => protocol.id);
    store.updateProtocol(BUILT_IN_PROTOCOLS[0].id, { name: 'Edited' });

    store.restoreBuiltIns();

    expect(store.protocols.map((protocol) => protocol.id)).toEqual(order);
    expect(store.getProtocol(BUILT_IN_PROTOCOLS[0].id)?.name).toBe(
      BUILT_IN_PROTOCOLS[0].name
    );
  });

  it('brings back a built-in the reader deleted', () => {
    const store = useHangingProtocolStore();
    store.removeProtocol(BUILT_IN_PROTOCOLS[0].id);

    store.restoreBuiltIns();

    expect(store.protocols).toHaveLength(BUILT_IN_PROTOCOLS.length);
    expect(store.getProtocol(BUILT_IN_PROTOCOLS[0].id)).not.toBeNull();
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
