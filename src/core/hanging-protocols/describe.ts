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

const layoutSignature = (layout: LayoutConfig) => {
  const { layout: tree, views } = parseLayoutConfig(layout);
  return JSON.stringify([tree, views.map((view) => [view.type, view.options])]);
};

// The named layouts are fixed for the life of the app, but this runs for
// every protocol row in the manager and in the indicator's switch menu, and
// again on every apply. Their signatures are computed once per set.
const namedSignatures = new WeakMap<
  Record<string, LayoutConfig>,
  Array<[string, string]>
>();

const signaturesOf = (named: Record<string, LayoutConfig>) => {
  const cached = namedSignatures.get(named);
  if (cached) return cached;
  const signatures = Object.keys(named).flatMap((name): [string, string][] => {
    try {
      return [[name, layoutSignature(named[name])]];
    } catch {
      return [];
    }
  });
  namedSignatures.set(named, signatures);
  return signatures;
};

/** The named layout equal to this one, if any. */
export function findNamedLayout(
  layout: LayoutConfig,
  named: Record<string, LayoutConfig>
): string | null {
  try {
    const signature = layoutSignature(layout);
    return (
      signaturesOf(named).find(
        ([, candidate]) => candidate === signature
      )?.[0] ?? null
    );
  } catch {
    return null;
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
