<script setup lang="ts">
import PhilipsShield from '@/src/components/icons/PhilipsShield.vue';
import { useBrandLogoColor } from '@/src/composables/useBrandLogoColor';

const logoColor = useBrandLogoColor();
</script>

<template>
  <philips-shield :size="32" :style="{ color: logoColor }" />
</template>
