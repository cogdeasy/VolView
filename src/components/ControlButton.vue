<template>
  <v-btn
    variant="text"
    :rounded="0"
    dark
    :height="sizeV"
    :width="sizeV"
    :min-width="sizeV"
    :max-width="sizeV"
    :class="[
      'pv-control-button',
      { 'pv-control-button--density': size == null },
      classV,
    ]"
    :data-testid="`control-button-${name}`"
    v-bind="$attrs"
  >
    <v-icon :size="iconSize">{{ icon }}</v-icon>
    <v-tooltip
      :location="tooltipLocation"
      activator="parent"
      transition="slide-x-transition"
    >
      <span>{{ name }}</span>
    </v-tooltip>
    <slot />
  </v-btn>
</template>

<script>
export default {
  name: 'ControlButton',
  props: {
    icon: { type: String, required: true },
    name: { type: String, required: true },
    /**
     * Explicit pixel edge. Left unset, the button sizes itself from the
     * density token (`--pv-density-tool-button-size`).
     */
    size: { type: [Number, String], default: null },
    buttonClass: [String, Array, Object],
    tooltipLocation: { type: String, default: 'right' },
  },

  computed: {
    sizeV() {
      return this.size == null ? undefined : Number(this.size);
    },
    iconSize() {
      return this.sizeV == null ? undefined : Math.floor(0.6 * this.sizeV);
    },
    classV() {
      const classSpec = this.buttonClass;
      if (typeof classSpec === 'string') {
        return classSpec;
      }
      if (Array.isArray(classSpec)) {
        return classSpec.join(' ');
      }
      if (classSpec && Object.keys(classSpec).length) {
        return Object.keys(this.buttonClass)
          .filter((key) => this.buttonClass[key])
          .join(' ');
      }
      return '';
    },
  },
};
</script>

<style scoped>
/* Sized by the density token unless an explicit `size` is passed. */
.pv-control-button--density {
  height: var(--pv-density-tool-button-size);
  width: var(--pv-density-tool-button-size);
  min-width: var(--pv-density-tool-button-size);
  max-width: var(--pv-density-tool-button-size);
}

/* Deliberately not `!important`: a nested icon that asks for an explicit
   `size` (the menu chevron) sets an inline font-size, and that has to keep
   winning over the density default. */
.pv-control-button--density :deep(.v-icon) {
  font-size: var(--pv-density-tool-icon-size);
}
</style>
