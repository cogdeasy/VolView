import type { ToolID } from '@/src/types/annotation-tool';
import type { AnnotationToolType } from '@/src/store/tools/types';
import type { FrameOfReference } from '@/src/utils/frameOfReference';

export type FindingID = string & { __type: 'FindingID' };

/** Scale used to grade a finding. Chosen by its finding type. */
export type FindingCategoryScale = 'severity' | 'birads' | 'none';

export type Laterality = 'left' | 'right' | 'midline' | 'unknown';

/**
 * An entry in the editable finding taxonomy. Built-in entries ship with the
 * app; a user-defined entry is persisted with the session.
 */
export type FindingType = {
  id: string;
  label: string;
  /** DICOM modality codes this type is offered for. Empty means every one. */
  modalities: string[];
  defaultBodySite: string;
  categoryScale: FindingCategoryScale;
  /** Built-in entries cannot be deleted, only added to. */
  builtin?: boolean;
};

/** A measurement/annotation owned by a finding. */
export type FindingMeasurement = {
  toolType: AnnotationToolType;
  toolID: ToolID;
};

/** A rasterized view snapshot pinned to a finding. */
export type FindingKeyImage = {
  /** PNG data URL. Archived as a zip member in the session state file. */
  dataURL: string;
  viewName: string;
  /** Slice the capture was taken at, 0-based. */
  slice: number;
  capturedAt: string;
};

export type Finding = {
  id: FindingID;
  /** The image the finding was made on. */
  imageID: string;
  title: string;
  /** References a FindingType id; a stale id degrades to free text. */
  typeID: string;
  bodySite: string;
  laterality: Laterality;
  /** A value on the type's category scale, or '' when ungraded. */
  category: string;
  description: string;
  measurements: FindingMeasurement[];
  /** Source slice reference, kept independent of the measurements. */
  slice: number;
  frameOfReference: FrameOfReference;
  /** Temporal cursor for cine findings. */
  frame?: number;
  createdAt: string;
  keyImage?: FindingKeyImage;
};
