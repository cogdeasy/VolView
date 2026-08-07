<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useHangingProtocolStore } from '@/src/store/hanging-protocols';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { describeWindowLevel } from '@/src/core/hanging-protocols/describe';

const store = useHangingProtocolStore();
const { applied, appliedProtocol, indicatorDismissed, protocols } =
  storeToRefs(store);
const { currentImageID } = useCurrentImage('global');

const showWhy = ref(false);

const visible = computed(
  () => !!appliedProtocol.value && !indicatorDismissed.value
);

const summary = computed(() =>
  appliedProtocol.value
    ? describeWindowLevel(appliedProtocol.value.windowLevel)
    : ''
);

const switchTo = (protocolId: string) => {
  store.applyManually(protocolId, currentImageID.value);
  showWhy.value = false;
};
</script>

<template>
  <v-slide-y-transition>
    <div
      v-if="visible"
      class="protocol-indicator"
      data-testid="protocol-indicator"
    >
      <v-sheet class="indicator-sheet px-3 py-1" rounded="pill" elevation="4">
        <v-icon size="18" color="secondary" class="mr-2">
          mdi-view-dashboard-variant
        </v-icon>
        <span class="text-body-2 mr-1">Hung with</span>
        <span class="text-body-2 font-weight-medium">
          {{ appliedProtocol?.name }}
        </span>
        <span class="text-caption text-medium-emphasis ml-2 d-none d-md-inline">
          {{ summary }}
        </span>

        <v-btn
          class="ml-2"
          size="x-small"
          variant="text"
          density="comfortable"
          icon="mdi-information-outline"
          data-testid="protocol-indicator-why"
          @click="showWhy = !showWhy"
        >
          <v-icon size="18">mdi-information-outline</v-icon>
          <v-tooltip activator="parent" location="bottom">
            Why did this protocol apply?
          </v-tooltip>
        </v-btn>

        <v-menu location="bottom end">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              size="x-small"
              variant="text"
              density="comfortable"
              data-testid="protocol-indicator-switch"
            >
              Switch
              <v-icon size="16" end>mdi-menu-down</v-icon>
            </v-btn>
          </template>
          <v-list density="compact" max-height="320">
            <v-list-item
              v-for="protocol in protocols"
              :key="protocol.id"
              :active="protocol.id === appliedProtocol?.id"
              @click="switchTo(protocol.id)"
            >
              <v-list-item-title>{{ protocol.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ describeWindowLevel(protocol.windowLevel) }}
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item @click="store.managerOpen = true">
              <template v-slot:prepend>
                <v-icon size="18">mdi-cog-outline</v-icon>
              </template>
              <v-list-item-title>Manage protocols…</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn
          size="x-small"
          variant="text"
          density="comfortable"
          icon="mdi-close"
          data-testid="protocol-indicator-dismiss"
          @click="indicatorDismissed = true"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </v-sheet>

      <v-expand-transition>
        <v-sheet
          v-if="showWhy"
          class="why-sheet mt-1 px-4 py-3"
          rounded="lg"
          elevation="4"
        >
          <div class="text-body-2 mb-2">{{ applied?.explanation }}</div>
          <v-table v-if="applied?.criteria.length" density="compact">
            <tbody>
              <tr v-for="(criterion, i) in applied?.criteria" :key="i">
                <td class="text-caption">{{ criterion.criterion }}</td>
                <td class="text-caption text-medium-emphasis">
                  expected {{ criterion.expected }}
                </td>
                <td class="text-caption text-medium-emphasis">
                  found {{ criterion.actual }}
                </td>
                <td>
                  <v-icon
                    size="14"
                    :color="criterion.matched ? 'secondary' : 'error'"
                  >
                    {{ criterion.matched ? 'mdi-check' : 'mdi-close' }}
                  </v-icon>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-sheet>
      </v-expand-transition>
    </div>
  </v-slide-y-transition>
</template>

<style scoped>
.protocol-indicator {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.indicator-sheet,
.why-sheet {
  pointer-events: auto;
  opacity: 0.96;
}

.indicator-sheet {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.why-sheet {
  max-width: 640px;
}
</style>
