<script setup lang="ts">
import { computed } from 'vue';
import { useViewStore } from '@/src/store/views';
import { groupLayoutNames } from '@/src/utils/layoutGrouping';
import LayoutGridEditor from './LayoutGridEditor.vue';

const viewStore = useViewStore();

const layoutGridSize = computed({
  get: () => [0, 0] as [number, number],
  set: (size: [number, number]) => {
    viewStore.setLayoutFromGrid(size);
  },
});

const layoutEntries = computed(() =>
  groupLayoutNames(Object.keys(viewStore.namedLayouts))
);

const isActive = (name: string) => viewStore.currentLayoutName === name;

const selectNamedLayout = (name: string) => {
  viewStore.switchToNamedLayout(name);
};
</script>

<template>
  <div>
    <div v-if="layoutEntries.length > 0" class="named-layouts">
      <v-list density="compact">
        <template v-for="entry in layoutEntries">
          <v-menu
            v-if="entry.kind === 'group'"
            :key="`group-${entry.label}`"
            location="end"
            open-on-hover
            :open-on-focus="false"
          >
            <template #activator="{ props }">
              <v-list-item
                v-bind="props"
                :active="entry.items.some((item) => isActive(item.name))"
                append-icon="mdi-menu-right"
              >
                <v-list-item-title>{{ entry.label }}</v-list-item-title>
              </v-list-item>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="item in entry.items"
                :key="item.name"
                :active="isActive(item.name)"
                @click="selectNamedLayout(item.name)"
              >
                <v-list-item-title>{{ item.label }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-list-item
            v-else
            :key="entry.name"
            :active="isActive(entry.name)"
            @click="selectNamedLayout(entry.name)"
          >
            <v-list-item-title>{{ entry.label }}</v-list-item-title>
          </v-list-item>
        </template>
      </v-list>
      <v-divider class="my-2" />
    </div>
    <div class="grid-editor">
      <LayoutGridEditor v-model="layoutGridSize" />
    </div>
  </div>
</template>

<style scoped>
.named-layouts {
  padding-bottom: 8px;
}

.grid-editor {
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
