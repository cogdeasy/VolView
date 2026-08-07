import { getCurrentScope, onScopeDispose } from 'vue';

import type { AnnotationToolType } from '@/src/store/tools/types';
import type { ToolID } from '@/src/types/annotation-tool';

export type AnnotationReplacement = {
  toolType: AnnotationToolType;
  /** The annotations that were consumed, in the order they were merged. */
  replacedIDs: ToolID[];
  /** The annotation that now stands for them. */
  replacementID: ToolID;
};

type ReplacementCallback = (replacement: AnnotationReplacement) => void;

const subscribers = new Set<ReplacementCallback>();

/**
 * Announces that annotations were replaced by another, rather than deleted:
 * merging polygons mints a new tool and drops its sources, so anything holding
 * a tool id (findings) must follow the geometry to its new id instead of
 * treating the measurement as gone.
 */
export function notifyAnnotationsReplaced(replacement: AnnotationReplacement) {
  subscribers.forEach((callback) => callback(replacement));
}

export function onAnnotationsReplaced(callback: ReplacementCallback) {
  subscribers.add(callback);
  const unsubscribe = () => {
    subscribers.delete(callback);
  };
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return unsubscribe;
}
