import { defineAnnotationToolStore } from '@/src/utils/defineAnnotationToolStore';
import type { Vector3 } from '@kitware/vtk.js/types';
import { Manifest, StateFile } from '@/src/io/state-file/schema';
import { RECTANGLE_LABEL_DEFAULTS } from '@/src/config';
import { ToolID } from '@/src/types/annotation-tool';
import {
  RectangleMeasurements,
  rectangleMeasurements,
} from '@/src/core/annotations/measurements';
import { computed } from 'vue';

import {
  declareAnnotationToolManifestRefs,
  useAnnotationTool,
} from './useAnnotationTool';

declareAnnotationToolManifestRefs('rectangles');

const rectangleDefaults = () => ({
  firstPoint: [0, 0, 0] as Vector3,
  secondPoint: [0, 0, 0] as Vector3,
  id: '' as ToolID,
  name: 'Rectangle',
  fillColor: 'transparent',
});

const newLabelDefault = {
  fillColor: 'transparent',
};

export const useRectangleStore = defineAnnotationToolStore('rectangles', () => {
  const toolAPI = useAnnotationTool({
    toolDefaults: rectangleDefaults,
    initialLabels: RECTANGLE_LABEL_DEFAULTS,
    newLabelDefault,
  });

  const measurementsByID = computed<Record<string, RectangleMeasurements>>(
    () => {
      const byID = toolAPI.toolByID.value;
      return toolAPI.toolIDs.value.reduce((measurements, id) => {
        const { frameOfReference, firstPoint, secondPoint } = byID[id];
        return Object.assign(measurements, {
          [id]: rectangleMeasurements(
            frameOfReference,
            firstPoint,
            secondPoint
          ),
        });
      }, {});
    }
  );

  function getPoints(id: ToolID) {
    const tool = toolAPI.toolByID.value[id];
    return [tool.firstPoint, tool.secondPoint];
  }

  // --- serialization --- //

  function serialize(state: StateFile) {
    if (!state.manifest.tools) return;
    state.manifest.tools.rectangles = toolAPI.serializeTools();
  }

  function deserialize(manifest: Manifest, dataIDMap: Record<string, string>) {
    toolAPI.deserializeTools(manifest.tools?.rectangles, dataIDMap);
  }

  return {
    ...toolAPI,
    measurementsByID,
    getPoints,
    serialize,
    deserialize,
  };
});
