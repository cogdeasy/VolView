import {
  parseLayoutConfig,
  type LayoutConfig,
} from '@/src/utils/layoutParsing';
import { WLAutoRanges } from '@/src/constants';
import { getWindowLevelPreset } from '@/src/core/hanging-protocols/windowPresets';
import type {
  HangingProtocol,
  SlicePolicy,
  WindowLevelSpec,
} from '@/src/core/hanging-protocols/types';

const humanize = (text: string) => text.replace(/([A-Z])/g, ' $1').trim();

/** e.g. "Axial, Coronal, Sagittal, Volume (4 views)" */
export function describeLayout(layout: LayoutConfig): string {
  try {
    const { views } = parseLayoutConfig(layout);
    if (!views.length) return 'No views';
    return `${views.map((view) => view.name).join(', ')} (${views.length} view${
      views.length === 1 ? '' : 's'
    })`;
  } catch {
    return 'Invalid layout';
  }
}

export function describeWindowLevel(spec: WindowLevelSpec): string {
  switch (spec.kind) {
    case 'preset': {
      const preset = getWindowLevelPreset(spec.preset);
      return preset
        ? `${preset.label} (W ${preset.width} / L ${preset.level})`
        : 'Unknown preset';
    }
    case 'manual':
      return `W ${spec.width} / L ${spec.level}`;
    case 'auto':
      return `Auto — ${humanize(spec.auto)}`;
    case 'dicom':
    default:
      return 'From DICOM header';
  }
}

export const SLICE_POLICY_LABELS: Record<SlicePolicy, string> = {
  first: 'First slice',
  middle: 'Middle slice',
  preserve: 'Same as prior',
};

export const AUTO_RANGE_KEYS = Object.keys(WLAutoRanges);

export function describeProtocol(protocol: HangingProtocol): string {
  return [
    describeLayout(protocol.layout),
    describeWindowLevel(protocol.windowLevel),
    SLICE_POLICY_LABELS[protocol.slicePolicy],
  ].join(' · ');
}

export function describeMatchRules(protocol: HangingProtocol): string[] {
  const { match } = protocol;
  const parts: string[] = [];
  if (match.modality?.length)
    parts.push(`Modality ${match.modality.join('/')}`);
  if (match.bodyPart?.length)
    parts.push(`Body part ${match.bodyPart.join('/')}`);
  if (match.studyDescription) parts.push(`Study /${match.studyDescription}/i`);
  if (match.seriesDescription)
    parts.push(`Series /${match.seriesDescription}/i`);
  if (match.minSeriesCount !== undefined)
    parts.push(`≥ ${match.minSeriesCount} series`);
  if (match.maxSeriesCount !== undefined)
    parts.push(`≤ ${match.maxSeriesCount} series`);
  return parts;
}
