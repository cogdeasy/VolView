import type { LayoutConfig } from '@/src/utils/layoutParsing';
import type { LPSAxis } from '@/src/types/lps';
import type { Maybe } from '@/src/types';

/**
 * Which half of a comparison pair a view belongs to.
 */
export type ComparisonRole = 'current' | 'prior';

/**
 * Comparison panes are identified by their view name: the layout definition is
 * the only place that decides which slot shows which study, and the name
 * travels with the view through `switchToNamedLayout`.
 */
export const ComparisonViewNames = {
  currentAxial: 'Current Axial',
  currentCoronal: 'Current Coronal',
  priorAxial: 'Prior Axial',
  priorCoronal: 'Prior Coronal',
} as const;

export const ComparisonLayoutNames = {
  pair: 'Comparison: Axial Pair',
  quad: 'Comparison: Axial + Coronal',
} as const;

interface ComparisonPaneSpec {
  role: ComparisonRole;
  axis: LPSAxis;
}

const PANE_BY_VIEW_NAME: Record<string, ComparisonPaneSpec> = {
  [ComparisonViewNames.currentAxial]: { role: 'current', axis: 'Axial' },
  [ComparisonViewNames.currentCoronal]: { role: 'current', axis: 'Coronal' },
  [ComparisonViewNames.priorAxial]: { role: 'prior', axis: 'Axial' },
  [ComparisonViewNames.priorCoronal]: { role: 'prior', axis: 'Coronal' },
};

export function comparisonPaneSpec(
  viewName: Maybe<string>
): ComparisonPaneSpec | null {
  if (!viewName) return null;
  return PANE_BY_VIEW_NAME[viewName] ?? null;
}

export const ComparisonLayouts: Record<string, LayoutConfig> = {
  [ComparisonLayoutNames.pair]: {
    direction: 'row',
    items: [
      {
        type: '2D',
        name: ComparisonViewNames.currentAxial,
        orientation: 'Axial',
      },
      {
        type: '2D',
        name: ComparisonViewNames.priorAxial,
        orientation: 'Axial',
      },
    ],
  },
  [ComparisonLayoutNames.quad]: {
    direction: 'column',
    items: [
      {
        direction: 'row',
        items: [
          {
            type: '2D',
            name: ComparisonViewNames.currentAxial,
            orientation: 'Axial',
          },
          {
            type: '2D',
            name: ComparisonViewNames.currentCoronal,
            orientation: 'Coronal',
          },
        ],
      },
      {
        direction: 'row',
        items: [
          {
            type: '2D',
            name: ComparisonViewNames.priorAxial,
            orientation: 'Axial',
          },
          {
            type: '2D',
            name: ComparisonViewNames.priorCoronal,
            orientation: 'Coronal',
          },
        ],
      },
    ],
  },
};
