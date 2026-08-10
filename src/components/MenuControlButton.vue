<script lang="ts">
import { watch, ref, computed, defineComponent } from 'vue';
import { useDisplay, type Anchor } from 'vuetify';
import type { PropType } from 'vue';
import ControlButton from './ControlButton.vue';
import type { Maybe } from '@/src/types';

export default defineComponent({
  name: 'MenuControlButton',
  props: {
    icon: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: [Number, String], default: 40 },
    active: Boolean,
    disabled: Boolean,
    mobileOnlyMenu: Boolean,
    // Overrides the side the menu opens on.
    location: { type: String as PropType<Maybe<Anchor>>, default: null },
  },
  components: {
    ControlButton,
  },
  setup(props) {
    const display = useDisplay();

    const showLeft = computed(() => !display.mobile.value);

    const menuLocation = computed<Anchor>(
      () => props.location ?? (showLeft.value ? 'left' : 'right')
    );

    const menuOn = ref(false);

    const enableMenu = computed(
      () => !props.mobileOnlyMenu || display.mobile.value
    );

    // Disable menu if mobile only
    watch(menuOn, (on) => {
      menuOn.value = on && enableMenu.value;
    });

    // Turn off menu if tool deselected
    const active = computed(() => props.active);
    watch(active, (on) => {
      if (!on) {
        menuOn.value = false;
      }
    });

    return { showLeft, menuLocation, menuOn, enableMenu };
  },
});
</script>

<template>
  <v-menu
    no-click-animation
    :close-on-content-click="false"
    v-model="menuOn"
    :location="menuLocation"
    class="overflow-auto"
  >
    <template #activator="{ props }">
      <control-button
        :icon="icon"
        :name="name"
        :buttonClass="['tool-btn', active ? 'tool-btn-selected' : '']"
        :disabled="disabled"
        :size="size"
        @click="$emit('click')"
        v-bind="props"
      >
        <v-icon
          v-if="active && enableMenu"
          :class="[showLeft ? 'menu-more-left' : 'menu-more-right']"
          size="18"
        >
          {{ showLeft ? 'mdi-menu-left' : 'mdi-menu-right' }}
        </v-icon>
      </control-button>
    </template>

    <div class="menu-content elevation-24">
      <slot />
    </div>
  </v-menu>
</template>

<style scoped>
.menu-more-left {
  position: absolute;
  left: -12%;
}
.menu-more-right {
  position: absolute;
  right: -12%;
}

.menu-content {
  /* Show on top of button tooltip */
  z-index: 1;
}
</style>
