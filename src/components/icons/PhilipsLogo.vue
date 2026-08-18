<script setup lang="ts">
import PhilipsShield from '@/src/components/icons/PhilipsShield.vue';
import { Brand } from '@/src/branding';
import { useBrandLogoColor } from '@/src/composables/useBrandLogoColor';

const logoColor = useBrandLogoColor();
</script>

<template>
  <div
    class="philips-logo"
    role="img"
    :aria-label="Brand.productName"
    :style="{ color: logoColor }"
  >
    <philips-shield :size="30" />
    <span class="philips-logo__product" aria-hidden="true">{{
      Brand.productShortName
    }}</span>
  </div>
</template>

<style scoped>
.philips-logo {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.philips-logo__product {
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
