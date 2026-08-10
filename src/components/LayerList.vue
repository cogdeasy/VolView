<script lang="ts">
import { computed, defineComponent } from 'vue';
import { Layer, useLayersStore } from '@/src/store/datasets-layers';
import { useCurrentImage } from '../composables/useCurrentImage';
import LayerProperties from './LayerProperties.vue';

export default defineComponent({
  name: 'LayerList',
  components: {
    LayerProperties,
  },
  setup() {
    const { currentImageID, currentLayers } = useCurrentImage();
    const layers = computed(() => [...currentLayers.value].reverse());

    const layersStore = useLayersStore();
    const removeLayer = (layer: Layer) => {
      if (!currentImageID.value) return;
      layersStore.deleteLayer(currentImageID.value, layer.selection);
    };

    return {
      layers,
      removeLayer,
    };
  },
});
</script>

<template>
  <div class="mx-2">
    <layer-properties
      v-for="layer in layers"
      :key="layer.id"
      :layer="layer"
      class="py-4"
      @remove="removeLayer(layer)"
    >
    </layer-properties>
  </div>
</template>
