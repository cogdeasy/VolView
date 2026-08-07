<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import PhilipsEmblem from '@/src/components/icons/PhilipsEmblem.vue';
import { Brand } from '@/src/branding';

const theme = useTheme();
const logoColor = computed(() =>
  theme.current.value.dark ? '#ffffff' : Brand.colors.primary
);
</script>

<template>
  <philips-emblem :size="30" :style="{ color: logoColor }" />
</template>
