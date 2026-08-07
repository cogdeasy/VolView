<template>
  <item-group
    mandatory
    :model-value="currentTool"
    @update:model-value="setCurrentTool($event)"
  >
    <div class="my-1 tool-separator" />
    <groupable-item
      v-slot:default="{ active, toggle }"
      :value="Tools.WindowLevel"
    >
      <menu-control-button
        icon="mdi-circle-half-full"
        :name="`Window & Level [${nameToShortcut['Window & Level']}]`"
        :aria-label="toolAriaLabel('Window & Level')"
        :pressed="active"
        :active="active"
        :disabled="noCurrentImage"
        @click="toggle"
      >
        <window-level-controls />
      </menu-control-button>
    </groupable-item>
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Pan">
      <control-button
        icon="mdi-cursor-move"
        :name="`Pan [${nameToShortcut['Pan']}]`"
        :aria-label="toolAriaLabel('Pan')"
        :pressed="active"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="noCurrentImage"
        @click="toggle"
      />
    </groupable-item>
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Zoom">
      <control-button
        icon="mdi-magnify-plus-outline"
        :name="`Zoom [${nameToShortcut['Zoom']}]`"
        :aria-label="toolAriaLabel('Zoom')"
        :pressed="active"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="noCurrentImage"
        @click="toggle"
      />
    </groupable-item>
    <groupable-item
      v-slot:default="{ active, toggle }"
      :value="Tools.Crosshairs"
    >
      <control-button
        icon="mdi-crosshairs"
        :name="`Crosshairs [${nameToShortcut['Crosshairs']}]`"
        :aria-label="toolAriaLabel('Crosshairs')"
        :pressed="active"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="
          noCurrentImage ||
          isObliqueLayout ||
          isDisallowedOnCine(Tools.Crosshairs)
        "
        @click="toggle"
      />
    </groupable-item>
    <div class="my-1 tool-separator" />
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Select">
      <control-button
        icon="mdi-cursor-default"
        :name="`Select [${nameToShortcut['Select']}]`"
        :aria-label="toolAriaLabel('Select')"
        :pressed="active"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="noCurrentImage"
        @click="toggle"
      />
    </groupable-item>
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Paint">
      <control-button
        icon="mdi-brush"
        :name="`Paint [${nameToShortcut['Paint']}]`"
        :aria-label="toolAriaLabel('Paint')"
        :pressed="active"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="
          noCurrentImage || isObliqueLayout || isDisallowedOnCine(Tools.Paint)
        "
        @click="toggle"
      ></control-button>
    </groupable-item>
    <groupable-item
      v-slot:default="{ active, toggle }"
      :value="Tools.Rectangle"
    >
      <menu-control-button
        icon="mdi-vector-square"
        :name="`Rectangle [${nameToShortcut['Rectangle']}]`"
        :aria-label="toolAriaLabel('Rectangle')"
        :pressed="active"
        :mobileOnlyMenu="true"
        :active="active"
        :disabled="noCurrentImage || isObliqueLayout"
        @click="toggle"
      >
        <rectangle-controls />
      </menu-control-button>
    </groupable-item>
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Polygon">
      <menu-control-button
        icon="mdi-pentagon-outline"
        :name="`Polygon [${nameToShortcut['Polygon']}]`"
        :aria-label="toolAriaLabel('Polygon')"
        :pressed="active"
        :mobileOnlyMenu="true"
        :active="active"
        :disabled="noCurrentImage || isObliqueLayout"
        @click="toggle"
      >
        <polygon-controls />
      </menu-control-button>
    </groupable-item>
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Ruler">
      <menu-control-button
        icon="mdi-ruler"
        :name="`Ruler [${nameToShortcut['Ruler']}]`"
        :aria-label="toolAriaLabel('Ruler')"
        :pressed="active"
        :mobileOnlyMenu="true"
        :active="active"
        :disabled="noCurrentImage || isObliqueLayout"
        @click="toggle"
      >
        <ruler-controls />
      </menu-control-button>
    </groupable-item>

    <div class="my-1 tool-separator" />
    <groupable-item v-slot:default="{ active, toggle }" :value="Tools.Crop">
      <menu-control-button
        icon="mdi-crop"
        :name="`Crop [${nameToShortcut['Crop']}]`"
        :aria-label="toolAriaLabel('Crop')"
        :pressed="active"
        :active="active"
        :disabled="
          noCurrentImage || isObliqueLayout || isDisallowedOnCine(Tools.Crop)
        "
        @click="toggle"
      >
        <crop-controls />
      </menu-control-button>
    </groupable-item>
    <div class="my-1 tool-separator" />
    <reset-views />
  </item-group>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch } from 'vue';
import { onKeyDown, useMagicKeys } from '@vueuse/core';
import { Tools } from '@/src/store/tools/types';
import ControlButton from '@/src/components/ControlButton.vue';
import ItemGroup from '@/src/components/ItemGroup.vue';
import GroupableItem from '@/src/components/GroupableItem.vue';
import { useToolStore, isToolAllowedFor } from '@/src/store/tools';
import { useEffectiveView } from '@/src/composables/useEffectiveView';
import { toRef } from 'vue';
import MenuControlButton from '@/src/components/MenuControlButton.vue';
import CropControls from '@/src/components/tools/crop/CropControls.vue';
import ResetViews from '@/src/components/tools/ResetViews.vue';
import RulerControls from '@/src/components/RulerControls.vue';
import RectangleControls from '@/src/components/RectangleControls.vue';
import PolygonControls from '@/src/components/PolygonControls.vue';
import WindowLevelControls from '@/src/components/tools/windowing/WindowLevelControls.vue';
import { actionToKey } from '@/src/composables/useKeyboardShortcuts';
import { formatBinding } from '@/src/utils/keyBindings';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useViewStore } from '@/src/store/views';

export default defineComponent({
  components: {
    ControlButton,
    MenuControlButton,
    ItemGroup,
    GroupableItem,
    CropControls,
    ResetViews,
    RulerControls,
    RectangleControls,
    PolygonControls,
    WindowLevelControls,
  },
  setup() {
    const toolStore = useToolStore();
    const viewStore = useViewStore();

    const { currentImageID } = useCurrentImage();
    const noCurrentImage = computed(() => !currentImageID.value);
    const currentTool = computed(() => toolStore.currentTool);

    const activeViewRef = toRef(viewStore, 'activeView');
    const activeEffective = useEffectiveView(
      computed(() => activeViewRef.value ?? '')
    );
    // The rendered viewer is decided by effective kind, not stored slot type:
    // a cine clip dropped into an Oblique slot still renders as cine, so the
    // toolbar should treat it as cine, not Oblique.
    const isObliqueLayout = computed(
      () => activeEffective.value?.kind === 'oblique'
    );
    const isCineActive = computed(() => activeEffective.value?.kind === 'cine');
    const isDisallowedOnCine = (tool: Tools) =>
      isCineActive.value && !isToolAllowedFor(tool, activeEffective.value);

    const paintMenu = ref(false);
    const cropMenu = ref(false);
    const windowingMenu = ref(false);

    onKeyDown('Escape', () => {
      paintMenu.value = false;
      cropMenu.value = false;
      windowingMenu.value = false;
    });

    const keys = useMagicKeys();
    const enableTempCrosshairs = computed(
      () => keys[actionToKey.value.temporaryCrosshairs].value
    );
    watch(enableTempCrosshairs, (enable) => {
      if (enable) toolStore.activateTemporaryCrosshairs();
      else toolStore.deactivateTemporaryCrosshairs();
    });

    // Rename the computed property to map tool names to their keyboard shortcuts
    const nameToShortcut = computed(() => {
      const keyMap = actionToKey.value;
      return {
        'Window & Level': keyMap.windowLevel,
        Pan: keyMap.pan,
        Zoom: keyMap.zoom,
        Crosshairs: keyMap.crosshairs,
        Select: keyMap.select,
        Paint: keyMap.paint,
        Rectangle: keyMap.rectangle,
        Polygon: keyMap.polygon,
        Ruler: keyMap.ruler,
        Crop: keyMap.crop,
      };
    });

    type ToolName = keyof (typeof nameToShortcut)['value'];
    // Tooltips read "Pan [n]"; screen readers get a spoken form instead.
    const toolAriaLabel = (name: ToolName) =>
      `${name} tool, shortcut ${formatBinding(nameToShortcut.value[name])}`;

    return {
      currentTool,
      setCurrentTool: toolStore.setCurrentTool,
      toolAriaLabel,
      noCurrentImage,
      isObliqueLayout,
      isDisallowedOnCine,
      Tools,
      paintMenu,
      cropMenu,
      windowingMenu,
      nameToShortcut,
    };
  },
});
</script>

<style>
.tool-btn-selected {
  background-color: rgb(var(--v-theme-selection-bg-color));
}
</style>

<style scoped>
.menu-more {
  position: absolute;
  right: -10%;
}

.tool-separator {
  width: 75%;
  height: 1px;
  border: none;
  border-top: 1px solid rgb(112, 112, 112);
}

.popup-menu {
  max-width: 400px; /* a little less than v-navigation-drawer in App.vue */
}
</style>
