<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string;
  }>(),
  { size: 28 }
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    :width="size"
    :height="size"
    role="img"
    aria-label="Philips emblem"
  >
    <circle
      cx="32.0"
      cy="32.0"
      r="28.30"
      fill="none"
      stroke="currentColor"
      stroke-width="3.4"
    />
    <path
      d="M20.00,10.00 L21.76,14.97 L27.04,15.11 L22.85,18.33 L24.35,23.39 L20.00,20.40 L15.65,23.39 L17.15,18.33 L12.96,15.11 L18.24,14.97 Z"
      fill="currentColor"
    />
    <path
      d="M44.00,10.00 L45.76,14.97 L51.04,15.11 L46.85,18.33 L48.35,23.39 L44.00,20.40 L39.65,23.39 L41.15,18.33 L36.96,15.11 L42.24,14.97 Z"
      fill="currentColor"
    />
    <path
      d="M20.00,39.20 L21.76,44.17 L27.04,44.31 L22.85,47.53 L24.35,52.59 L20.00,49.60 L15.65,52.59 L17.15,47.53 L12.96,44.31 L18.24,44.17 Z"
      fill="currentColor"
    />
    <path
      d="M44.00,39.20 L45.76,44.17 L51.04,44.31 L46.85,47.53 L48.35,52.59 L44.00,49.60 L39.65,52.59 L41.15,47.53 L36.96,44.31 L42.24,44.17 Z"
      fill="currentColor"
    />
    <path
      d="M8.40,26.40 Q13.12,23.60 17.85,26.40 Q22.58,29.20 27.30,26.40 Q32.02,23.60 36.75,26.40 Q41.48,29.20 46.20,26.40 Q50.90,23.60 55.60,26.40"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
    <path
      d="M8.40,32.00 Q13.12,29.20 17.85,32.00 Q22.58,34.80 27.30,32.00 Q32.02,29.20 36.75,32.00 Q41.48,34.80 46.20,32.00 Q50.90,29.20 55.60,32.00"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
    <path
      d="M8.40,37.60 Q13.12,34.80 17.85,37.60 Q22.58,40.40 27.30,37.60 Q32.02,34.80 36.75,37.60 Q41.48,40.40 46.20,37.60 Q50.90,34.80 55.60,37.60"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
  </svg>
</template>
