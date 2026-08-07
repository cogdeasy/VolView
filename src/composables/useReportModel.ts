import { computed } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useDICOMStore } from '@/src/store/datasets-dicom';
import { useFindingsStore } from '@/src/store/findings';
import { isDicomImage } from '@/src/utils/dataSelection';
import { worldPointToIndex } from '@/src/utils/imageSpace';
import { frameOfReferenceToImageSliceAndAxis } from '@/src/utils/frameOfReference';
import { summarizeFindingMeasurements } from '@/src/core/findings/summarize';
import { LATERALITY_LABELS } from '@/src/core/findings/taxonomy';
import type {
  Report,
  ReportFinding,
  ReportHeaderField,
} from '@/src/core/findings/report';
import type { Finding } from '@/src/types/finding';

/** DICOM DA (YYYYMMDD) to a readable date; anything else passes through. */
export function formatDicomDate(value: string | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

/** DICOM PN component separator to a readable name. */
export function formatPatientName(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\^+$/, '').split('^').filter(Boolean).join(' ');
}

/**
 * Builds the report document model from what the app already knows: the DICOM
 * patient/study/series metadata, the findings and their annotations.
 */
export function useReportModel() {
  const findingsStore = useFindingsStore();
  const dicomStore = useDICOMStore();
  const { currentImageID, currentImageMetadata, currentImageData } =
    useCurrentImage();

  const dicomInfo = computed(() => {
    const volumeKey = currentImageID.value;
    if (!volumeKey || !isDicomImage(volumeKey)) return null;
    const volume = dicomStore.volumeInfo[volumeKey];
    const studyKey = dicomStore.volumeStudy[volumeKey];
    const study = dicomStore.studyInfo[studyKey];
    const patient = dicomStore.patientInfo[dicomStore.studyPatient[studyKey]];
    if (!volume || !study || !patient) return null;
    return { volume, study, patient };
  });

  const modality = computed(() => dicomInfo.value?.volume.Modality ?? '');

  const findings = computed(() =>
    findingsStore.findingsForImage(currentImageID.value)
  );

  function describeFinding(finding: Finding): ReportFinding {
    const type = findingsStore.findingTypeByID[finding.typeID];
    const metadata = currentImageMetadata.value;
    const sliceAndAxis = frameOfReferenceToImageSliceAndAxis(
      finding.frameOfReference,
      metadata,
      { allowOutOfBoundsSlice: true }
    );
    const axis = sliceAndAxis?.axis;
    const sliceCount = axis
      ? metadata.dimensions[metadata.lpsOrientation[axis]]
      : undefined;
    const location =
      finding.frame != null
        ? `Frame ${finding.frame + 1}`
        : `${axis ?? 'Oblique'} slice ${finding.slice + 1}${
            sliceCount ? ` of ${sliceCount}` : ''
          }`;

    const image = currentImageData.value;
    const centroid = findingsStore.measurementCentroid(finding);
    const hasGeometry = finding.measurements.length > 0;
    const coordinates =
      image && hasGeometry
        ? `IJK ${[...worldPointToIndex(image, centroid)]
            .map((component) => Math.round(component))
            .join(', ')}`
        : '';

    return {
      title: finding.title || 'Untitled finding',
      type: type?.label ?? '',
      bodySite: finding.bodySite,
      laterality:
        finding.laterality === 'unknown'
          ? ''
          : LATERALITY_LABELS[finding.laterality],
      categoryLabel: type?.categoryScale === 'birads' ? 'BI-RADS' : 'Severity',
      category: finding.category,
      description: finding.description,
      location,
      coordinates,
      measurements: summarizeFindingMeasurements(finding),
      keyImage: finding.keyImage
        ? {
            dataURL: finding.keyImage.dataURL,
            caption: `${finding.title || 'Finding'} — ${
              finding.keyImage.viewName
            }, slice ${finding.keyImage.slice + 1}`,
          }
        : undefined,
    };
  }

  const patientFields = computed<ReportHeaderField[]>(() => {
    const info = dicomInfo.value;
    return [
      { label: 'Name', value: formatPatientName(info?.patient.PatientName) },
      { label: 'ID', value: info?.patient.PatientID ?? '' },
      {
        label: 'Born',
        value: formatDicomDate(info?.patient.PatientBirthDate),
      },
      { label: 'Sex', value: info?.patient.PatientSex ?? '' },
    ];
  });

  const studyFields = computed<ReportHeaderField[]>(() => {
    const info = dicomInfo.value;
    return [
      { label: 'Description', value: info?.study.StudyDescription ?? '' },
      { label: 'Date', value: formatDicomDate(info?.study.StudyDate) },
      { label: 'Accession', value: info?.study.AccessionNumber ?? '' },
      { label: 'Study ID', value: info?.study.StudyID ?? '' },
    ];
  });

  const seriesFields = computed<ReportHeaderField[]>(() => {
    const info = dicomInfo.value;
    return [
      { label: 'Description', value: info?.volume.SeriesDescription ?? '' },
      { label: 'Modality', value: modality.value },
      { label: 'Series #', value: info?.volume.SeriesNumber ?? '' },
      {
        label: 'Slices',
        value: info ? String(info.volume.NumberOfSlices) : '',
      },
    ];
  });

  /** Stamped when called, so an export carries its own generation time. */
  const buildReport = (): Report => ({
    generatedAt: new Date().toLocaleString(),
    patient: patientFields.value,
    study: studyFields.value,
    series: seriesFields.value,
    impression: findingsStore.impression,
    findings: findings.value.map(describeFinding),
  });

  const report = computed<Report>(buildReport);

  return { report, buildReport, modality, findings, dicomInfo };
}
