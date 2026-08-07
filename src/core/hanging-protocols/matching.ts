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

/**
 * `restored` is never returned by `selectProtocol`: the store uses it for a
 * study whose presentation came back from a saved session.
 */
export type SelectionReason =
  | 'override'
  | 'match'
  | 'default'
  | 'none'
  | 'restored';

export interface ProtocolSelection {
  protocol: HangingProtocol | null;
  reason: SelectionReason;
  criteria: CriterionResult[];
  /** Matching protocols in precedence order, the winner first. */
  candidates: HangingProtocol[];
}

const normalize = (value: string) => value.trim().toUpperCase();

/**
 * `exact` for coded values such as Modality, `contains` for free-text values
 * such as Body Part Examined, where `HEAD` should match `HEADNECK`.
 */
const anyOf = (
  values: string[] | undefined,
  actual: string,
  mode: 'exact' | 'contains'
) => {
  const wanted = (values ?? []).filter((value) => value.trim() !== '');
  if (!wanted.length) return null;
  const target = normalize(actual);
  const hit = (value: string) =>
    mode === 'exact'
      ? target === normalize(value)
      : target.includes(normalize(value));
  return {
    expected: wanted.join(', '),
    matched: wanted.some(hit),
  };
};

export const MAX_PATTERN_LENGTH = 200;

/**
 * Rejects expressions that can backtrack catastrophically before they are ever
 * run. Protocols can be imported from a file, and matching runs on every
 * protocol for every study and on every render of the manager list, so one
 * `(a+)+` would freeze the tab. The check is the standard conservative one: a
 * quantified group that itself contains a quantifier. A production version
 * would evaluate patterns with a linear-time engine (RE2) instead of rejecting
 * them.
 */
export function checkPattern(pattern: string): {
  safe: boolean;
  reason?: string;
} {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      safe: false,
      reason: `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`,
    };
  }

  try {
    RegExp(pattern);
  } catch {
    return { safe: false, reason: 'Pattern is not a valid expression.' };
  }

  const quantifier = /[*+?}]/;
  const openGroups: number[] = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\') {
      i += 1;
    } else if (char === '(') {
      openGroups.push(i);
    } else if (char === ')') {
      const start = openGroups.pop();
      if (start === undefined) continue;
      const body = pattern.slice(start + 1, i);
      const next = pattern[i + 1] ?? '';
      if (quantifier.test(body) && quantifier.test(next)) {
        return {
          safe: false,
          reason: 'Nested quantifiers can hang the browser.',
        };
      }
    }
  }

  return { safe: true };
}

const matchesPattern = (pattern: string | undefined, actual: string) => {
  if (!pattern || pattern.trim() === '') return null;
  // An unusable or unsafe expression never matches; the editor surfaces why.
  const matched = checkPattern(pattern).safe
    ? new RegExp(pattern, 'i').test(actual)
    : false;
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
    anyOf(match.modality, context.modality, 'exact')
  );
  push(
    'Body part',
    context.bodyPart || '(none)',
    anyOf(match.bodyPart, context.bodyPart, 'contains')
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
  // A disabled protocol is off, whether it is reached by rule, by a remembered
  // override or as the default.
  const byId = (id: string | null | undefined) =>
    id
      ? (protocols.find((protocol) => protocol.id === id && protocol.enabled) ??
        null)
      : null;

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
