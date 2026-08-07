<script setup lang="ts">
import PhilipsEmblem from '@/src/components/icons/PhilipsEmblem.vue';
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
  <div class="philips-logo" :style="{ color: logoColor }">
    <philips-emblem :size="30" />
    <span class="philips-logo__wordmark">{{ Brand.company }}</span>
    <template v-if="!productNameHidden">
      <span class="philips-logo__rule" />
      <span class="philips-logo__product">{{ Brand.productShortName }}</span>
    </template>
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

.philips-logo__wordmark {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.philips-logo__rule {
  width: 1px;
  height: 24px;
  background-color: currentColor;
  opacity: 0.4;
  margin: 0 4px;
}

.philips-logo__product {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
