import type {
  HangingProtocol,
  MatchRules,
  StudyContext,
} from '@/src/core/hanging-protocols/types';

export interface CriterionResult {
  criterion: string;
  expected: string;
  actual: string;
  matched: boolean;
}

export interface ProtocolEvaluation {
  protocol: HangingProtocol;
  matched: boolean;
  /** Every rule the protocol declares, matched or not. */
  criteria: CriterionResult[];
  /** Number of declared rules; used only to describe how specific a match is. */
  specificity: number;
}

export type SelectionReason = 'override' | 'match' | 'default' | 'none';

export interface ProtocolSelection {
  protocol: HangingProtocol | null;
  reason: SelectionReason;
  criteria: CriterionResult[];
  /** Matching protocols in precedence order, the winner first. */
  candidates: HangingProtocol[];
}

const normalize = (value: string) => value.trim().toUpperCase();

const anyOf = (values: string[] | undefined, actual: string) => {
  const wanted = (values ?? []).filter((value) => value.trim() !== '');
  if (!wanted.length) return null;
  const target = normalize(actual);
  return {
    expected: wanted.join(', '),
    matched: wanted.some((value) => target.includes(normalize(value))),
  };
};

const matchesPattern = (pattern: string | undefined, actual: string) => {
  if (!pattern || pattern.trim() === '') return null;
  let matched = false;
  try {
    matched = new RegExp(pattern, 'i').test(actual);
  } catch {
    // An unparseable expression never matches; the editor surfaces the error.
    matched = false;
  }
  return { expected: `/${pattern}/i`, matched };
};

export const countRules = (rules: MatchRules) =>
  [
    rules.modality?.length,
    rules.bodyPart?.length,
    rules.studyDescription,
    rules.seriesDescription,
    rules.minSeriesCount,
    rules.maxSeriesCount,
  ].filter((rule) => rule !== undefined && rule !== '' && rule !== 0).length;

export function evaluateProtocol(
  protocol: HangingProtocol,
  context: StudyContext
): ProtocolEvaluation {
  const { match } = protocol;
  const criteria: CriterionResult[] = [];

  const push = (
    criterion: string,
    actual: string,
    result: { expected: string; matched: boolean } | null
  ) => {
    if (!result) return;
    criteria.push({ criterion, actual, ...result });
  };

  push(
    'Modality',
    context.modality || '(none)',
    anyOf(match.modality, context.modality)
  );
  push(
    'Body part',
    context.bodyPart || '(none)',
    anyOf(match.bodyPart, context.bodyPart)
  );
  push(
    'Study description',
    context.studyDescription || '(none)',
    matchesPattern(match.studyDescription, context.studyDescription)
  );
  push(
    'Series description',
    context.seriesDescription || '(none)',
    matchesPattern(match.seriesDescription, context.seriesDescription)
  );
  if (match.minSeriesCount !== undefined) {
    criteria.push({
      criterion: 'Series count',
      expected: `at least ${match.minSeriesCount}`,
      actual: String(context.seriesCount),
      matched: context.seriesCount >= match.minSeriesCount,
    });
  }
  if (match.maxSeriesCount !== undefined) {
    criteria.push({
      criterion: 'Series count',
      expected: `at most ${match.maxSeriesCount}`,
      actual: String(context.seriesCount),
      matched: context.seriesCount <= match.maxSeriesCount,
    });
  }

  return {
    protocol,
    // A protocol with no rules never hangs a study by itself; it can still be
    // chosen as the default or applied by hand.
    matched: criteria.length > 0 && criteria.every((c) => c.matched),
    criteria,
    specificity: criteria.length,
  };
}

/**
 * Picks the protocol for a study.
 *
 * Precedence, highest first:
 *  1. a manual override the reader made for this study,
 *  2. the first enabled protocol whose rules all hold, in list order,
 *  3. the configured default protocol.
 */
export function selectProtocol(
  protocols: HangingProtocol[],
  context: StudyContext,
  options: { overrideId?: string | null; defaultId?: string | null } = {}
): ProtocolSelection {
  const byId = (id: string | null | undefined) =>
    id ? (protocols.find((protocol) => protocol.id === id) ?? null) : null;

  const evaluations = protocols
    .filter((protocol) => protocol.enabled)
    .map((protocol) => evaluateProtocol(protocol, context));
  const candidates = evaluations
    .filter((evaluation) => evaluation.matched)
    .map((evaluation) => evaluation.protocol);

  const override = byId(options.overrideId);
  if (override) {
    return {
      protocol: override,
      reason: 'override',
      criteria: evaluateProtocol(override, context).criteria,
      candidates,
    };
  }

  const winner = evaluations.find((evaluation) => evaluation.matched);
  if (winner) {
    return {
      protocol: winner.protocol,
      reason: 'match',
      criteria: winner.criteria,
      candidates,
    };
  }

  const fallback = byId(options.defaultId);
  if (fallback) {
    return {
      protocol: fallback,
      reason: 'default',
      criteria: [],
      candidates,
    };
  }

  return { protocol: null, reason: 'none', criteria: [], candidates };
}

/** One-line "why did this protocol apply?" explanation. */
export function explainSelection(selection: ProtocolSelection): string {
  const { protocol, reason, criteria, candidates } = selection;
  if (!protocol) {
    return 'No protocol matched this study, so the viewer defaults are in use.';
  }

  if (reason === 'override') {
    return `You chose ${protocol.name} for this study, so it is used instead of the matching protocol.`;
  }

  if (reason === 'default') {
    return `No protocol matched this study, so the default (${protocol.name}) was applied.`;
  }

  const matched = criteria
    .filter((criterion) => criterion.matched)
    .map((criterion) => `${criterion.criterion} ${criterion.actual}`)
    .join(', ');
  const others =
    candidates.length > 1
      ? ` It has the highest precedence of ${candidates.length} matching protocols.`
      : '';
  return `${protocol.name} matched on ${matched}.${others}`;
}
