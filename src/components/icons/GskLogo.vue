<script setup lang="ts">
import GskWordmark from '@/src/components/icons/GskWordmark.vue';
import { Brand } from '@/src/branding';
import { useBrandLogoColor } from '@/src/composables/useBrandLogoColor';

const logoColor = useBrandLogoColor();
</script>

<template>
  <div
    class="gsk-logo"
    role="img"
    :aria-label="Brand.productName"
    :style="{ color: logoColor }"
  >
    <gsk-wordmark :size="18" />
    <span class="gsk-logo__product" aria-hidden="true">{{
      Brand.productShortName
    }}</span>
  </div>
</template>

<style scoped>
.gsk-logo {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.gsk-logo__product {
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
