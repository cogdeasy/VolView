<script setup lang="ts">
import PhilipsEmblem from '@/src/components/icons/PhilipsEmblem.vue';
import { useBrandLogoColor } from '@/src/composables/useBrandLogoColor';

const logoColor = useBrandLogoColor();
</script>

<template>
  <philips-emblem :size="30" :style="{ color: logoColor }" />
</template>
