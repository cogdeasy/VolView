<script setup lang="ts">
import { computed } from 'vue';
import { useRendererHealthStore } from '@/src/store/renderer-health';
import { formatBytes } from '@/src/utils/webglInfo';

const health = useRendererHealthStore();

const rows = computed(() => {
  const info = health.webglInfo;
  return [
    { label: 'Renderer', value: info?.renderer ?? 'unavailable' },
    { label: 'Vendor', value: info?.vendor ?? 'unavailable' },
    { label: 'API', value: info?.version ?? 'unavailable' },
    {
      label: 'Acceleration',
      value: info
        ? `${info.softwareRendering ? 'Software' : 'Hardware'} (${
            info.webgl2 ? 'WebGL 2' : 'WebGL 1'
          })`
        : 'unavailable',
    },
    {
      label: 'Max texture size',
      value: info?.maxTextureSize ? `${info.maxTextureSize} px` : 'unavailable',
    },
    {
      label: 'Texture memory in use',
      value: formatBytes(health.approxTextureBytes),
    },
    { label: 'Frames rendered', value: String(health.framesRendered) },
    { label: 'Context losses', value: String(health.contextLostCount) },
    { label: 'Recovery attempts', value: String(health.recoveryAttempts) },
  ];
});

const statusLabel = computed(() => {
  switch (health.status) {
    case 'unhealthy':
      return 'Rendering unavailable';
    case 'recovering':
      return 'Restoring rendering';
    case 'unrecoverable':
      return 'Reload required';
    default:
      return 'Healthy';
  }
});

const statusColor = computed(() =>
  health.status === 'healthy'
    ? 'success'
    : health.status === 'recovering'
      ? 'warning'
      : 'error'
);

const softwareWarning = computed(
  () => health.webglInfo?.softwareRendering ?? false
);
</script>

<template>
  <div class="renderer-diagnostics" data-testid="renderer-diagnostics">
    <div class="d-flex align-center ga-2 mb-3">
      <v-chip :color="statusColor" size="small" variant="flat" label>
        {{ statusLabel }}
      </v-chip>
      <v-chip
        v-if="softwareWarning"
        color="warning"
        size="small"
        variant="tonal"
        label
      >
        No GPU detected
      </v-chip>
    </div>

    <table class="diagnostics-table">
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <th>{{ row.label }}</th>
          <td>{{ row.value }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="softwareWarning" class="hint">
      Rendering is running on the CPU. Volume rendering will be slow and is more
      likely to exhaust graphics resources.
    </p>
  </div>
</template>

<style scoped>
.diagnostics-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.diagnostics-table th,
.diagnostics-table td {
  padding: 4px 0;
  vertical-align: top;
  text-align: left;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.diagnostics-table th {
  width: 45%;
  font-weight: 500;
  opacity: 0.72;
  padding-right: 12px;
}

.diagnostics-table td {
  word-break: break-word;
  font-variant-numeric: tabular-nums;
}

.hint {
  margin: 10px 0 0;
  font-size: 0.76rem;
  opacity: 0.7;
  line-height: 1.4;
}
</style>
