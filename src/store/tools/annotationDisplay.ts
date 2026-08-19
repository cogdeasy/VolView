import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { AnnotationOverlayTextStorageKey } from '@/src/constants';

/**
 * Display preferences shared by the 2D annotation overlays.
 */
export const useAnnotationDisplayStore = defineStore(
  'annotationDisplay',
  () => {
    // Label names and measurement values drawn next to annotations in slice views.
    const overlayTextVisible = useLocalStorage(
      AnnotationOverlayTextStorageKey,
      true
    );

    return { overlayTextVisible };
  }
);
