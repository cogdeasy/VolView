import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import LayerList from '@/src/components/LayerList.vue';
import { useLayersStore } from '@/src/store/datasets-layers';

const currentImageID = ref<string | null>('parent');
const currentLayers = ref([
  { id: 'parent::layer-a', selection: 'layer-a' },
  { id: 'parent::layer-b', selection: 'layer-b' },
]);

vi.mock('@/src/composables/useCurrentImage', () => ({
  useCurrentImage: () => ({
    currentImageID: computed(() => currentImageID.value),
    currentLayers: computed(() => currentLayers.value),
  }),
}));

const mountList = () =>
  mount(LayerList, {
    global: {
      stubs: {
        // The row is exercised through its `remove` event; its Vuetify
        // internals are covered by the LayerProperties markup itself.
        LayerProperties: {
          props: ['layer'],
          emits: ['remove'],
          template:
            '<button class="remove" @click="$emit(\'remove\')">{{ layer.id }}</button>',
        },
      },
    },
  });

describe('LayerList remove control', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    currentImageID.value = 'parent';
  });

  it('deletes the clicked layer from the current image', async () => {
    const layersStore = useLayersStore();
    const deleteLayer = vi
      .spyOn(layersStore, 'deleteLayer')
      .mockImplementation(() => {});
    const wrapper = mountList();

    // The list renders newest-first, so the first row is the last layer added.
    await wrapper.findAll('.remove')[0].trigger('click');

    expect(deleteLayer).toHaveBeenCalledOnce();
    expect(deleteLayer).toHaveBeenCalledWith('parent', 'layer-b');

    wrapper.unmount();
  });

  it('does nothing when no image is current', async () => {
    const layersStore = useLayersStore();
    const deleteLayer = vi
      .spyOn(layersStore, 'deleteLayer')
      .mockImplementation(() => {});
    currentImageID.value = null;
    const wrapper = mountList();

    await wrapper.findAll('.remove')[0].trigger('click');

    expect(deleteLayer).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
