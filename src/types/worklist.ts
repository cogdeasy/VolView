import type { SampleDataset } from '@/src/types';

/** Where a worklist entry's metadata came from. */
export type WorklistOrigin =
  /** Parsed from DICOM tags of data the user has loaded. */
  | 'loaded'
  /** A downloadable sample dataset; pixel data is real, demographics are not. */
  | 'sample'
  /** Fabricated entry used to make the prototype worklist look populated. */
  | 'synthetic';

export type ReadStatus = 'unread' | 'in-progress' | 'read';

export type Priority = 'stat' | 'routine';

export interface WorklistSeries {
  key: string;
  seriesNumber: string;
  description: string;
  modality: string;
  /** Slice count for volumes, frame count for cine clips. */
  imageCount: number;
  /** Data URI, when one is available (loaded series or sample thumbnail). */
  thumbnail?: string;
}

export interface WorklistStudy {
  key: string;
  origin: WorklistOrigin;
  patientName: string;
  patientId: string;
  /** DICOM DA (YYYYMMDD), empty when unknown. */
  patientBirthDate: string;
  /** DICOM CS: M, F, O or empty. */
  patientSex: string;
  accessionNumber: string;
  /** Primary modality of the study, e.g. CT. */
  modality: string;
  description: string;
  bodyPart: string;
  /** DICOM DA (YYYYMMDD). */
  studyDate: string;
  /** DICOM TM (HHMMSS[.FFFFFF]). */
  studyTime: string;
  seriesCount: number;
  imageCount: number;
  priority: Priority;
  readStatus: ReadStatus;
  assignedReader: string;
  series: WorklistSeries[];
  /**
   * Volume keys in the DICOM store, for entries whose data is already loaded.
   */
  volumeKeys: string[];
  /** Sample dataset to fetch when a non-loaded entry is opened. */
  sample?: SampleDataset;
}

/**
 * Demographics attached to a downloadable sample dataset so it can appear as a
 * worklist row before it is loaded. The pixel data is real; everything here is
 * fabricated.
 */
export interface SampleWorklistMetadata {
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  accessionNumber: string;
  modality: string;
  description: string;
  bodyPart: string;
  /** Study date, expressed relative to today so demo data never goes stale. */
  daysAgo: number;
  /** DICOM TM (HHMMSS). */
  time: string;
  seriesCount: number;
  imageCount: number;
  priority: Priority;
  readStatus: ReadStatus;
  assignedReader: string;
}

/** A fabricated worklist row with no pixel data behind it. */
export interface SyntheticWorklistStudy extends SampleWorklistMetadata {
  key: string;
  series: Array<Omit<WorklistSeries, 'key' | 'thumbnail'>>;
}

export type SortKey =
  | 'patientName'
  | 'studyDateTime'
  | 'modality'
  | 'description'
  | 'accessionNumber'
  | 'priority'
  | 'readStatus';

export type SortDirection = 'asc' | 'desc';

export interface WorklistSort {
  key: SortKey;
  direction: SortDirection;
}

/** Relative windows, so demo data never goes stale. */
export type DateRange =
  | 'any'
  | 'today'
  | 'last3days'
  | 'last7days'
  | 'last30days';

export interface WorklistFilters {
  search: string;
  modalities: string[];
  priorities: Priority[];
  readStatuses: ReadStatus[];
  dateRange: DateRange;
}
