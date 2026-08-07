import type {
  DateRange,
  Priority,
  ReadStatus,
  WorklistFilters,
  WorklistSort,
  WorklistStudy,
} from '@/src/types/worklist';

export const READ_STATUS_LABELS: Record<ReadStatus, string> = {
  unread: 'Unread',
  'in-progress': 'In progress',
  read: 'Read',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  stat: 'STAT',
  routine: 'Routine',
};

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any date',
  today: 'Today',
  last3days: 'Last 3 days',
  last7days: 'Last 7 days',
  last30days: 'Last 30 days',
};

const DATE_RANGE_DAYS: Record<Exclude<DateRange, 'any'>, number> = {
  today: 1,
  last3days: 3,
  last7days: 7,
  last30days: 30,
};

export const defaultFilters = (): WorklistFilters => ({
  search: '',
  modalities: [],
  priorities: [],
  readStatuses: [],
  dateRange: 'any',
});

export const isFilterActive = (filters: WorklistFilters) =>
  filters.search.trim() !== '' ||
  filters.modalities.length > 0 ||
  filters.priorities.length > 0 ||
  filters.readStatuses.length > 0 ||
  filters.dateRange !== 'any';

const DA_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

/** Parses a DICOM DA (YYYYMMDD) into a local-time Date. */
export function parseDicomDate(value: string): Date | null {
  const match = DA_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a DICOM DA as YYYY-MM-DD, the unambiguous form used in radiology. */
export function formatDicomDate(value: string): string {
  const match = DA_PATTERN.exec(value.trim());
  if (!match) return value.trim();
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

/** Formats a DICOM TM (HHMMSS.FFFFFF) as HH:MM. */
export function formatDicomTime(value: string): string {
  const digits = value.trim().split('.')[0];
  if (digits.length < 4) return '';
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

export function formatDicomDateTime(date: string, time: string): string {
  const formattedDate = formatDicomDate(date);
  const formattedTime = formatDicomTime(time);
  if (!formattedDate) return formattedTime;
  return formattedTime ? `${formattedDate} ${formattedTime}` : formattedDate;
}

/**
 * DICOM PN is caret-delimited (Family^Given^Middle^Prefix^Suffix); render it
 * the way a reading room expects to see it.
 */
export function formatPatientName(value: string): string {
  const name = value.trim();
  if (!name) return '';
  if (!name.includes('^')) return name.replace(/\s+/g, ' ');
  const [family = '', given = '', middle = ''] = name.split('^');
  return [given, middle, family]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Family name first, the order a reading list is alphabetized by, whichever
 * way the name is displayed.
 */
export function patientSortKey(value: string): string {
  return value.trim().replace(/\^/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

/** Age in whole years at the study date, formatted DICOM-style (e.g. 064Y). */
export function formatAge(birthDate: string, studyDate: string): string {
  const birth = parseDicomDate(birthDate);
  const study = parseDicomDate(studyDate) ?? new Date();
  if (!birth) return '';
  let years = study.getFullYear() - birth.getFullYear();
  const monthDelta = study.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && study.getDate() < birth.getDate()))
    years -= 1;
  if (years < 0 || years > 150) return '';
  return `${String(years).padStart(3, '0')}Y`;
}

export function formatAgeSex(study: WorklistStudy): string {
  const age = formatAge(study.patientBirthDate, study.studyDate);
  const sex = study.patientSex.trim().toUpperCase();
  return [age, sex].filter(Boolean).join(' / ');
}

/** Sortable numeric stamp; studies with no date sort first in ascending order. */
export function studyTimestamp(study: WorklistStudy): number {
  const date = parseDicomDate(study.studyDate);
  if (!date) return Number.NEGATIVE_INFINITY;
  const digits = study.studyTime.trim().split('.')[0];
  const hours = Number(digits.slice(0, 2) || 0);
  const minutes = Number(digits.slice(2, 4) || 0);
  const seconds = Number(digits.slice(4, 6) || 0);
  date.setHours(hours, minutes, seconds, 0);
  return date.getTime();
}

export function isWithinDateRange(
  study: WorklistStudy,
  range: DateRange,
  now: Date = new Date()
): boolean {
  if (range === 'any') return true;
  const date = parseDicomDate(study.studyDate);
  if (!date) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (DATE_RANGE_DAYS[range] - 1));
  return date.getTime() >= start.getTime();
}

export function matchesSearch(study: WorklistStudy, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    formatPatientName(study.patientName),
    study.patientName,
    study.patientId,
    study.accessionNumber,
    study.description,
    study.bodyPart,
    study.modality,
    study.assignedReader,
    ...study.series.map((series) => series.description),
  ]
    .join(' ')
    .toLowerCase();
  return needle.split(/\s+/).every((term: string) => haystack.includes(term));
}

export function filterStudies(
  studies: WorklistStudy[],
  filters: WorklistFilters,
  now: Date = new Date()
): WorklistStudy[] {
  return studies.filter((study) => {
    if (!matchesSearch(study, filters.search)) return false;
    if (
      filters.modalities.length > 0 &&
      !filters.modalities.includes(study.modality)
    )
      return false;
    if (
      filters.priorities.length > 0 &&
      !filters.priorities.includes(study.priority)
    )
      return false;
    if (
      filters.readStatuses.length > 0 &&
      !filters.readStatuses.includes(study.readStatus)
    )
      return false;
    return isWithinDateRange(study, filters.dateRange, now);
  });
}

const PRIORITY_ORDER: Record<Priority, number> = { stat: 0, routine: 1 };
const READ_STATUS_ORDER: Record<ReadStatus, number> = {
  unread: 0,
  'in-progress': 1,
  read: 2,
};

/** Ordering comparison; subtraction would yield NaN for two -Infinity stamps. */
function compareNumbers(a: number, b: number): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function compareBySortKey(
  a: WorklistStudy,
  b: WorklistStudy,
  key: WorklistSort['key']
): number {
  switch (key) {
    case 'studyDateTime':
      return compareNumbers(studyTimestamp(a), studyTimestamp(b));
    case 'priority':
      return compareNumbers(
        PRIORITY_ORDER[a.priority],
        PRIORITY_ORDER[b.priority]
      );
    case 'readStatus':
      return compareNumbers(
        READ_STATUS_ORDER[a.readStatus],
        READ_STATUS_ORDER[b.readStatus]
      );
    case 'patientName':
      return patientSortKey(a.patientName).localeCompare(
        patientSortKey(b.patientName)
      );
    default:
      return String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
  }
}

export function sortStudies(
  studies: WorklistStudy[],
  sort: WorklistSort
): WorklistStudy[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  // Stable secondary sort on key keeps row order from jittering as read
  // statuses change underneath the user.
  return [...studies].sort((a, b) => {
    const result = compareBySortKey(a, b, sort.key);
    if (result !== 0) return result * sign;
    return a.key.localeCompare(b.key);
  });
}

/** Modalities present in the list, for populating the modality filter. */
export function availableModalities(studies: WorklistStudy[]): string[] {
  return [
    ...new Set(studies.map((study) => study.modality).filter(Boolean)),
  ].sort();
}
