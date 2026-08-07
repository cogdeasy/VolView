<script setup lang="ts">
import PhilipsWordmark from '@/src/components/icons/PhilipsWordmark.vue';
import { Brand } from '@/src/branding';
import { useBrandLogoColor } from '@/src/composables/useBrandLogoColor';

withDefaults(
  defineProps<{
    /** Hides the product name, leaving only the Philips lockup. */
    productNameHidden?: boolean;
  }>(),
  { productNameHidden: false }
);

const logoColor = useBrandLogoColor();
</script>

<template>
  <div
    class="philips-logo"
    role="img"
    :aria-label="Brand.productName"
    :style="{ color: logoColor }"
  >
    <philips-wordmark :size="20" aria-hidden="true" />
    <template v-if="!productNameHidden">
      <span class="philips-logo__rule" />
      <span class="philips-logo__product" aria-hidden="true">{{
        Brand.productShortName
      }}</span>
    </template>
  </div>
</template>

<style scoped>
.philips-logo {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  line-height: 1;
}

.philips-logo__rule {
  width: 1px;
  height: 24px;
  background-color: currentColor;
  opacity: 0.4;
  margin: 0 2px;
}

.philips-logo__product {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
