import { describe, it, beforeEach, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  MAX_REMEMBERED_OVERRIDES,
  readStoredProtocols,
  rememberOverride,
  useHangingProtocolStore,
} from '@/src/store/hanging-protocols';
import { useDICOMStore } from '@/src/store/datasets-dicom';
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

  it('falls back to the built-ins when no stored entry parses', () => {
    // A schema the code no longer understands, rather than an emptied list.
    const stored = JSON.stringify([{ id: 'broken' }, { id: 'also-broken' }]);
    expect(readStoredProtocols(stored)).toHaveLength(BUILT_IN_PROTOCOLS.length);
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

  it('leaves an authored protocol under a built-in id alone', () => {
    const store = useHangingProtocolStore();
    // What importing an edited copy of a deleted built-in leaves behind.
    store.updateProtocol(BUILT_IN_PROTOCOLS[0].id, {
      name: 'Mine',
      builtIn: false,
    });

    store.restoreBuiltIns();

    expect(store.getProtocol(BUILT_IN_PROTOCOLS[0].id)?.name).toBe('Mine');
  });

  it('brings back a built-in the reader deleted', () => {
    const store = useHangingProtocolStore();
    store.removeProtocol(BUILT_IN_PROTOCOLS[0].id);

    store.restoreBuiltIns();

    expect(store.protocols).toHaveLength(BUILT_IN_PROTOCOLS.length);
    expect(store.getProtocol(BUILT_IN_PROTOCOLS[0].id)).not.toBeNull();
  });
});

describe('hanging a study by hand', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('records the study, so the phases that wait on pixel data still run', () => {
    const store = useHangingProtocolStore();

    store.applyManually(BUILT_IN_PROTOCOLS[0].id, 'image-1');

    expect(store.hungImages.get('image-1')?.protocolId).toBe(
      BUILT_IN_PROTOCOLS[0].id
    );
    expect(store.manualApply).toEqual({ imageID: 'image-1', tick: 1 });

    store.applyManually(BUILT_IN_PROTOCOLS[1].id, 'image-1');

    // A second hand-pick of the same study is its own event, and the later
    // phases follow the protocol that hung it last.
    expect(store.manualApply?.tick).toBe(2);
    expect(store.hungImages.get('image-1')?.protocolId).toBe(
      BUILT_IN_PROTOCOLS[1].id
    );
  });

  it('keeps naming the protocol that hung the study when it is revisited', () => {
    const dicomStore = useDICOMStore();
    dicomStore.volumeInfo['image-1'] = {
      Modality: 'CT',
      BodyPartExamined: 'HEAD',
    } as (typeof dicomStore.volumeInfo)['image-1'];
    const store = useHangingProtocolStore();
    // A protocol selection would never pick: disabled protocols are skipped,
    // and a hand-pick of one is deliberately not remembered as an override.
    const picked = BUILT_IN_PROTOCOLS[1];
    store.updateProtocol(picked.id, { enabled: false });

    store.applyManually(picked.id, 'image-1');
    store.reportForImage('image-1');

    expect(store.applied?.protocolId).toBe(picked.id);
    expect(store.overlays).toEqual(picked.overlays);
    expect(store.focusedModule).toBe(picked.focusedModule);
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
