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
    <gsk-wordmark :size="24" />
    <span class="gsk-logo__rule" />
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
  gap: 10px;
  line-height: 1;
}

.gsk-logo__rule {
  width: 1px;
  height: 24px;
  background-color: currentColor;
  opacity: 0.4;
  margin: 0 2px;
}

.gsk-logo__product {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
