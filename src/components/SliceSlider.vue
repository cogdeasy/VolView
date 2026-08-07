<template>
  <div
    class="slice-slider"
    ref="handleContainer"
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    :aria-valuetext="`${unit} ${modelValue + 1} of ${max + 1}`"
    @keydown="onKeyDown"
    @pointerdown="onDragStart"
    @pointermove="onDragMove"
    @pointerup="onDragEnd"
    @pointercancel="onDragEnd"
    @contextmenu="$event.preventDefault()"
  >
    <div class="slice-slider-track" />
    <div
      class="slice-slider-handle"
      ref="handle"
      :style="{
        height: `${handleHeight}px`,
        transform: `translate3d(0, ${handlePosition}px, 0)`,
      }"
    />
  </div>
</template>

<script>
function getYOffsetFromTransform(matStr) {
  if (!matStr || matStr === 'none') {
    return 0;
  }
  const values = matStr
    .match(/matrix(?:3d)?\((.+)\)/)[1]
    .split(',')
    .map((v) => Number(v));
  const is3D = matStr.includes('3d');
  return is3D ? values[13] : values[5];
}

export default {
  props: {
    modelValue: {
      type: Number,
      default: 0,
    },
    min: {
      type: Number,
      required: true,
    },
    max: {
      type: Number,
      required: true,
    },
    step: {
      type: Number,
      required: true,
    },
    handleHeight: {
      type: Number,
      default: 20,
    },
    // What the value counts, spoken as e.g. "Slice 12 of 40".
    unit: {
      type: String,
      default: 'Slice',
    },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      maxHandlePos: 0,
      dragging: false,
      initialHandlePos: 0,
      initialMousePosY: 0,
      yOffset: 0,
    };
  },

  computed: {
    handlePosition() {
      const range = this.max - this.min <= 0 ? 1 : this.max - this.min;
      // Invert mapping: lower slice numbers at bottom for anatomical consistency
      const pos =
        this.maxHandlePos * (1 - (this.modelValue - this.min) / range);
      return this.dragging ? this.draggingHandlePos : pos;
    },
    draggingHandlePos() {
      return Math.min(
        Math.max(0, this.initialHandlePos + this.yOffset),
        this.maxHandlePos
      );
    },
  },

  mounted() {
    this.updateMaxHandlePos();
    this.resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 1) {
        this.updateMaxHandlePos();
      }
    });
    this.resizeObserver.observe(this.$refs.handleContainer);
  },

  beforeUnmount() {
    this.resizeObserver.disconnect();
  },

  methods: {
    updateMaxHandlePos() {
      this.maxHandlePos =
        this.$refs.handleContainer.clientHeight - this.handleHeight;
    },

    onDragStart(ev) {
      ev.preventDefault();

      this.dragging = true;
      this.initialMousePosY = ev.pageY;

      if (ev.target === this.$refs.handle) {
        const handleStyles = window.getComputedStyle(this.$refs.handle);
        this.initialHandlePos = getYOffsetFromTransform(handleStyles.transform);
      } else {
        // move handle to mouse pos
        const { y } = this.$refs.handleContainer.getBoundingClientRect();
        this.initialHandlePos = Math.max(
          0,
          Math.min(this.maxHandlePos, ev.pageY - y - this.handleHeight / 2)
        );
        const newSlice = this.getNearestSlice(this.initialHandlePos);
        this.$emit('update:modelValue', newSlice);
      }

      this.yOffset = 0;

      this.$refs.handleContainer.setPointerCapture(ev.pointerId);
    },

    onDragMove(ev) {
      if (!this.$refs.handleContainer.hasPointerCapture(ev.pointerId)) return;
      ev.preventDefault();

      this.yOffset = ev.pageY - this.initialMousePosY;
      const slice = this.getNearestSlice(this.handlePosition);
      this.$emit('update:modelValue', slice);
    },

    onDragEnd(ev) {
      if (!this.$refs.handleContainer.hasPointerCapture(ev.pointerId)) return;
      ev.preventDefault();
      this.$refs.handleContainer.releasePointerCapture(ev.pointerId);

      this.dragging = false;
      const slice = this.getNearestSlice(this.handlePosition);
      this.$emit('update:modelValue', slice);
    },

    // The slider owns the arrow keys while focused, so the global slice
    // shortcuts must not also fire: hence stopPropagation.
    onKeyDown(ev) {
      const page = Math.max(this.step, Math.round((this.max - this.min) / 10));
      const deltas = {
        ArrowUp: this.step,
        ArrowRight: this.step,
        ArrowDown: -this.step,
        ArrowLeft: -this.step,
        PageUp: page,
        PageDown: -page,
      };

      let next = null;
      if (ev.key in deltas) next = this.modelValue + deltas[ev.key];
      // Home/End follow the slider value, not the handle's screen position.
      else if (ev.key === 'Home') next = this.min;
      else if (ev.key === 'End') next = this.max;
      if (next === null) return;

      ev.preventDefault();
      ev.stopPropagation();
      this.$emit(
        'update:modelValue',
        Math.min(this.max, Math.max(this.min, next))
      );
    },

    getNearestSlice(pos) {
      // Invert position: bottom of slider = lower slice numbers
      const sliceEstimate = 1 - pos / this.maxHandlePos;
      const frac = sliceEstimate * (this.max - this.min) + this.min;
      return Math.round(frac / this.step) * this.step;
    },
  },
};
</script>

<style scoped>
.slice-slider {
  touch-action: none;
}

.slice-slider:focus-visible {
  outline: 2px solid rgb(var(--v-theme-secondary));
  outline-offset: 2px;
}

.slice-slider-handle {
  position: relative;
  width: 100%;
  background: #ccc;
  box-sizing: border-box;
  border-radius: 3px;
  border: 1px solid #999;
}

.slice-slider-track {
  position: absolute;
  margin: 0 auto;
  top: 8px;
  left: 0;
  right: 0;
  bottom: 8px;
  width: 1px;
  border: 1px solid #888;
  border-radius: 2px;
}
</style>
