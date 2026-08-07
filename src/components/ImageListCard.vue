<template>
  <v-hover v-slot="{ isHovering, props }">
    <v-card
      :disabled="disabled"
      variant="outlined"
      :ripple="!disabled"
      :class="{
        'image-list-card-hover': !disabled && isHovering,
        'image-list-card-active': !disabled && active,
      }"
      v-bind="{ ...props, ...$attrs }"
    >
      <v-container :title="htmlTitle">
        <v-row no-gutters class="flex-nowrap">
          <v-col v-if="selectable" cols="1" class="d-flex align-center">
            <v-checkbox
              @click.stop
              :key="id"
              density="compact"
              :disabled="disabled"
              :value="inputValue"
              :model-value="modelValue"
              @update:model-value="$emit('update:model-value', $event)"
            />
          </v-col>
          <v-col
            cols="4"
            class="image-container flex-grow-0"
            :style="{ maxWidth: `${imageSize}px` }"
          >
            <v-img
              contain
              :height="`${imageSize}px`"
              :width="`${imageSize}px`"
              :src="imageUrl"
            />
            <persistent-overlay :disabled="!$slots['image-overlay']">
              <slot name="image-overlay" />
            </persistent-overlay>
          </v-col>
          <v-col :cols="selectable ? 7 : 8" class="ml-2">
            <slot></slot>
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-hover>
</template>

<style scoped>
.image-list-card-active {
  background-color: rgb(var(--v-theme-selection-bg-color));
  border-color: rgb(var(--v-theme-selection-border-color)) !important;
  color: rgb(var(--v-theme-on-selection));
}

/* Selection outranks hover, so hovering the selected card keeps its border. */
.image-list-card-hover:not(.image-list-card-active) {
  border-color: rgb(var(--v-theme-primary)) !important;
}

.image-container {
  position: relative;
  margin-left: var(--pv-space-sm);
  margin-right: var(--pv-space-sm);
}
</style>

<script lang="ts">
import { defineComponent } from 'vue';
import PersistentOverlay from './PersistentOverlay.vue';

export default defineComponent({
  name: 'ImageListCard',
  props: {
    active: Boolean,
    imageSize: {
      type: Number,
      default: 80,
    },
    imageUrl: {
      type: String,
    },
    selectable: {
      type: Boolean,
      default: false,
    },
    id: String,
    modelValue: Array,
    inputValue: String,
    disabled: Boolean,
    htmlTitle: String,
  },
  components: { PersistentOverlay },
});
</script>
