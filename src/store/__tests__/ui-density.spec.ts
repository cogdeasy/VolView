import { beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';

import { Density, DefaultDensity } from '@/src/design-tokens';
import { DensityStorageKey, useUiDensityStore } from '@/src/store/ui-density';

describe('ui-density store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('starts at the default density', () => {
    const store = useUiDensityStore();
    expect(store.density).to.equal(DefaultDensity);
    expect(store.isCompact).to.equal(false);
    expect(store.tokens).to.deep.equal(Density[DefaultDensity]);
  });

  it('toggles between the two densities', () => {
    const store = useUiDensityStore();
    store.toggleDensity();
    expect(store.density).to.equal('compact');
    expect(store.tokens.toolButtonSize).to.equal(
      Density.compact.toolButtonSize
    );
    store.toggleDensity();
    expect(store.density).to.equal('comfortable');
  });

  it('persists the choice', async () => {
    useUiDensityStore().setDensity('compact');
    await nextTick();
    expect(window.localStorage.getItem(DensityStorageKey)).to.contain(
      'compact'
    );
  });

  it('falls back to the default when storage holds a stale value', () => {
    window.localStorage.setItem(DensityStorageKey, 'ultra-dense');
    const store = useUiDensityStore();
    expect(store.density).to.equal(DefaultDensity);
  });

  it('rejects an unknown density at runtime', () => {
    const store = useUiDensityStore();
    store.setDensity('nope' as never);
    expect(store.density).to.equal(DefaultDensity);
  });
});
