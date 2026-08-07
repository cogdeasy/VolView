<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, toRefs, watch } from 'vue';
import { VtkViewContext } from '@/src/components/vtk/context';
import { useViewRendererHealth } from '@/src/composables/useViewRendererHealth';
import { RendererOverlayText } from '@/src/constants';
import { useRendererHealthStore } from '@/src/store/renderer-health';
import { LPSAxis } from '@/src/types/lps';
import { Maybe } from '@/src/types';

type Props = {
  viewId: string;
  imageId: Maybe<string>;
  /** Slice axis for 2D views; omit for volume views. */
  axis?: LPSAxis;
};

const props = defineProps<Props>();
const { viewId, imageId } = toRefs(props);

const view = inject(VtkViewContext);
if (!view) throw new Error('No VtkView');

const health = useRendererHealthStore();

useViewRendererHealth({
  viewId,
  imageId,
  view,
  axis: computed(() => props.axis ?? null),
});

const recovering = computed(() => health.recovering);
// Pixels are equally untrustworthy while the render tree is being rebuilt, so
// the overlay stays up until recovery is confirmed.
const unhealthy = computed(
  () => health.isViewUnhealthy(viewId.value) || recovering.value
);
const unrecoverable = computed(() => health.status === 'unrecoverable');

/**
 * A failure that flickers past is worse than no warning at all: the reader is
 * left unsure whether the pixels they just looked at were trustworthy. However
 * long the failure itself lasted, the overlay ends on an explicit all-clear
 * that stays up long enough to be read.
 */
const ALL_CLEAR_MS = 2500;
const visible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  unhealthy,
  (bad, wasBad) => {
    clearTimeout(hideTimer);
    if (bad) {
      visible.value = true;
      return;
    }
    // Nothing to clear if this view was never in trouble.
    if (!wasBad) {
      visible.value = false;
      return;
    }
    hideTimer = setTimeout(() => {
      visible.value = false;
    }, ALL_CLEAR_MS);
  },
  { immediate: true }
);

onScopeDispose(() => clearTimeout(hideTimer));

/** The view is trustworthy again, but the warning has not been read yet. */
const restored = computed(() => visible.value && !unhealthy.value);

const reason = computed(() => {
  const viewReason = health.getViewHealth(viewId.value).reason;
  const key = viewReason ?? health.failureReason;
  return key ? RendererOverlayText.reasons[key] : '';
});

function restore() {
  health.requestRecovery();
}

function reload() {
  window.location.reload();
}
</script>

<template>
  <div
    v-if="visible"
    class="renderer-health-overlay"
    :class="{ 'renderer-health-overlay--restored': restored }"
    role="alert"
  >
    <div class="panel" :class="{ 'panel--restored': restored }">
      <div class="heading">
        <v-icon
          :icon="restored ? 'mdi-check-circle' : 'mdi-alert-octagon'"
          size="20"
          class="heading-icon"
        />
        <span class="title-text">{{
          restored
            ? RendererOverlayText.restoredTitle
            : RendererOverlayText.title
        }}</span>
      </div>
      <p class="body-text">
        {{
          restored ? RendererOverlayText.restoredBody : RendererOverlayText.body
        }}
      </p>
      <p v-if="reason && !restored" class="reason-text">{{ reason }}</p>
      <div v-if="!restored" class="actions">
        <template v-if="recovering">
          <v-progress-circular indeterminate size="16" width="2" />
          <span class="restoring-text">{{
            RendererOverlayText.restoring
          }}</span>
        </template>
        <template v-else>
          <v-btn
            v-if="!unrecoverable"
            size="small"
            variant="flat"
            color="primary"
            @click="restore"
          >
            {{ RendererOverlayText.restoreAction }}
          </v-btn>
          <v-btn size="small" variant="outlined" @click="reload">
            {{ RendererOverlayText.reloadAction }}
          </v-btn>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.renderer-health-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Fully occlude the untrustworthy pixels underneath. */
  background: rgb(var(--v-theme-surface));
  padding: 12px;
}

/* Let the reader watch the image come back behind the all-clear. */
.renderer-health-overlay--restored {
  background: rgba(var(--v-theme-surface), 0.55);
  pointer-events: none;
}

.panel {
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 22px;
  border-left: 3px solid rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
}

.heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-error));
}

.panel--restored {
  border-left-color: rgb(var(--v-theme-success));
}

.panel--restored .heading {
  color: rgb(var(--v-theme-success));
}

.heading-icon {
  flex: none;
}

.title-text {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.body-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
}

.reason-text {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.72;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}

.restoring-text {
  font-size: 0.82rem;
  opacity: 0.8;
}
</style>
