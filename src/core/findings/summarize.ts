import type { Vector3 } from '@kitware/vtk.js/types';
import { useAnnotationToolStore } from '@/src/store/tools';
import { AnnotationToolType } from '@/src/store/tools/types';
import type { Finding, FindingMeasurement } from '@/src/types/finding';
import type { ReportMeasurement, ReportQuantity } from './report';
import {
  distance,
  polygonArea,
  polygonPerimeter,
  rectangleDimensions,
} from './measurements';

const mm = (value: number): ReportQuantity['text'] => `${value.toFixed(1)} mm`;
const mm2 = (value: number) => `${value.toFixed(1)} mm²`;

const KIND_LABELS: Record<AnnotationToolType, string> = {
  [AnnotationToolType.Ruler]: 'Ruler',
  [AnnotationToolType.Rectangle]: 'Rectangle',
  [AnnotationToolType.Polygon]: 'Polygon',
};

/**
 * Quantities derived from an annotation's geometry. World coordinates are in
 * patient millimeters, so no unit conversion is needed.
 */
export function quantitiesFor(
  toolType: AnnotationToolType,
  points: Vector3[],
  planeNormal: Vector3
): ReportQuantity[] {
  if (toolType === AnnotationToolType.Ruler) {
    if (points.length < 2) return [];
    return [{ label: 'Length', text: mm(distance(points[0], points[1])) }];
  }
  if (toolType === AnnotationToolType.Rectangle) {
    if (points.length < 2) return [];
    const { width, height, area } = rectangleDimensions(
      points[0],
      points[1],
      planeNormal
    );
    return [
      { label: 'Size', text: `${mm(width)} × ${mm(height)}` },
      { label: 'Area', text: mm2(area) },
    ];
  }
  if (points.length < 3) return [];
  return [
    { label: 'Area', text: mm2(polygonArea(points)) },
    { label: 'Perimeter', text: mm(polygonPerimeter(points)) },
  ];
}

export function summarizeMeasurement(
  measurement: FindingMeasurement
): ReportMeasurement | null {
  const store = useAnnotationToolStore(measurement.toolType);
  const tool = store.toolByID[measurement.toolID];
  if (!tool) return null;
  return {
    kind: KIND_LABELS[measurement.toolType],
    label: tool.labelName ?? '',
    quantities: quantitiesFor(
      measurement.toolType,
      store.getPoints(measurement.toolID),
      tool.frameOfReference.planeNormal
    ),
  };
}

export function summarizeFindingMeasurements(
  finding: Finding
): ReportMeasurement[] {
  return finding.measurements
    .map(summarizeMeasurement)
    .filter((summary): summary is ReportMeasurement => summary !== null);
}

/** One-line measurement summary for the findings list. */
export function measurementHeadline(finding: Finding): string {
  return summarizeFindingMeasurements(finding)
    .flatMap((measurement) =>
      measurement.quantities.map(({ label, text }) => `${label} ${text}`)
    )
    .join(' · ');
}
