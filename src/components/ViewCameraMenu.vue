<script setup lang="ts">
import { computed, toRefs } from 'vue';
import MenuControlButton from '@/src/components/MenuControlButton.vue';
import { useViewStore } from '@/src/store/views';
import {
  useViewDisplayStore,
  type ViewBackground,
} from '@/src/store/view-display';
import { useToolStore } from '@/src/store/tools';
import { Tools } from '@/src/store/tools/types';

type Props = {
  viewId: string;
  viewType: '2D' | '3D';
  /** Crop controls aren't available in every view (e.g. cine views). */
  cropAvailable?: boolean;
};

const props = withDefaults(defineProps<Props>(), { cropAvailable: true });
const { viewId, viewType, cropAvailable } = toRefs(props);

const emit = defineEmits<{ (e: 'reset-camera'): void }>();

const viewStore = useViewStore();
const displayStore = useViewDisplayStore();
const toolStore = useToolStore();

const config = computed(() => displayStore.getConfig(viewId.value));

const cropShown = computed(() => toolStore.currentTool === Tools.Crop);

const isOnlyView = computed(() => viewStore.visibleViews.length <= 1);

const backgrounds: Array<{ mode: ViewBackground; label: string }> = [
  { mode: 'black', label: 'Show Black Background' },
  { mode: 'gradient', label: 'Show Gradient Background' },
  { mode: 'white', label: 'Show White Background' },
];

function toggleCrop() {
  toolStore.setCurrentTool(cropShown.value ? Tools.WindowLevel : Tools.Crop);
}
</script>

<template>
  <menu-control-button
    icon="mdi-camera-flip-outline"
    name="Camera & Display"
    location="end"
    :size="28"
    :data-testid="`camera-menu-${viewId}`"
  >
    <v-list density="compact" min-width="240">
      <v-list-item @click="emit('reset-camera')">
        <v-list-item-title>Reset Camera</v-list-item-title>
      </v-list-item>
      <v-list-item
        :disabled="isOnlyView"
        @click="viewStore.makeViewPrimary(viewId)"
      >
        <v-list-item-title>Make Primary View</v-list-item-title>
      </v-list-item>
      <v-list-item
        :disabled="isOnlyView"
        @click="viewStore.makeViewOnly(viewId)"
      >
        <v-list-item-title>Make Only View</v-list-item-title>
      </v-list-item>
      <v-list-item v-if="cropAvailable" @click="toggleCrop">
        <v-list-item-title>
          {{ cropShown ? 'Hide' : 'Show' }} Crop Controls
        </v-list-item-title>
      </v-list-item>
      <v-list-item
        v-if="viewType === '3D'"
        @click="displayStore.toggleOrientationBox(viewId)"
      >
        <v-list-item-title>
          {{ config.orientationBox ? 'Hide' : 'Show' }} Orientation Box
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-else @click="displayStore.toggleCornerAnnotations(viewId)">
        <v-list-item-title>
          {{ config.cornerAnnotations ? 'Hide' : 'Show' }} Corner Annotations
        </v-list-item-title>
      </v-list-item>
      <v-divider />
      <v-list-item
        v-for="background in backgrounds"
        :key="background.mode"
        :active="config.background === background.mode"
        @click="displayStore.setBackground(viewId, background.mode)"
      >
        <v-list-item-title>{{ background.label }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </menu-control-button>
</template>
