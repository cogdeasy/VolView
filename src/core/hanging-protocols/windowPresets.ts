/**
 * Named window/level presets in Hounsfield units.
 *
 * CT values are the widely taught radiological windows; MR and US have no
 * absolute intensity scale, so those modalities use the auto ranges or the
 * values carried in the DICOM header instead of a fixed preset.
 */
export interface WindowLevelPreset {
  id: string;
  label: string;
  modality: string;
  width: number;
  level: number;
}

const presets: WindowLevelPreset[] = [
  { id: 'ct-brain', label: 'Brain', modality: 'CT', width: 80, level: 40 },
  {
    id: 'ct-subdural',
    label: 'Subdural',
    modality: 'CT',
    width: 200,
    level: 80,
  },
  {
    id: 'ct-posterior-fossa',
    label: 'Posterior Fossa',
    modality: 'CT',
    width: 150,
    level: 40,
  },
  {
    id: 'ct-stroke',
    label: 'Stroke / Grey-White',
    modality: 'CT',
    width: 40,
    level: 40,
  },
  {
    id: 'ct-soft-tissue',
    label: 'Soft Tissue',
    modality: 'CT',
    width: 400,
    level: 50,
  },
  {
    id: 'ct-mediastinum',
    label: 'Mediastinum',
    modality: 'CT',
    width: 350,
    level: 50,
  },
  { id: 'ct-lung', label: 'Lung', modality: 'CT', width: 1500, level: -600 },
  { id: 'ct-bone', label: 'Bone', modality: 'CT', width: 2000, level: 500 },
  { id: 'ct-liver', label: 'Liver', modality: 'CT', width: 150, level: 60 },
  {
    id: 'ct-angio',
    label: 'CT Angio',
    modality: 'CT',
    width: 600,
    level: 150,
  },
];

export const WINDOW_LEVEL_PRESETS: Record<string, WindowLevelPreset> =
  Object.fromEntries(presets.map((preset) => [preset.id, preset]));

export const WINDOW_LEVEL_PRESET_LIST: ReadonlyArray<WindowLevelPreset> =
  presets;

export const getWindowLevelPreset = (
  id: string
): WindowLevelPreset | undefined => WINDOW_LEVEL_PRESETS[id];

/** The preset matching the given width/level exactly, if there is one. */
export const findWindowLevelPreset = (
  width: number,
  level: number
): WindowLevelPreset | undefined =>
  presets.find((preset) => preset.width === width && preset.level === level);
