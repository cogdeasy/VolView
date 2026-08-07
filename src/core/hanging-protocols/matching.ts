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
/** Above this, a bounded repeat is treated as unbounded for safety. */
const SMALL_REPEAT = 10;

interface Quantifier {
  /** Characters the quantifier occupies, including a trailing lazy `?`. */
  length: number;
  /** Whether it can repeat enough times to blow up when nested. */
  risky: boolean;
  /**
   * Whether it can run the thing it quantifies more than once. `?` cannot:
   * it doubles the paths through the pattern and no more, so an optional
   * group is safe however that group is built. It still counts as `risky`
   * inside a group, because `(a?b?)+` does blow up.
   */
  repeats: boolean;
}

/** Reads `*`, `+`, `?` or `{n,m}` at `index`, if one starts there. */
function readQuantifier(pattern: string, index: number): Quantifier | null {
  const char = pattern[index];
  let length = 0;
  let risky = true;
  let repeats = true;

  if (char === '*' || char === '+') {
    length = 1;
  } else if (char === '?') {
    length = 1;
    repeats = false;
  } else if (char === '{') {
    const close = pattern.indexOf('}', index);
    if (close === -1) return null;
    const body = pattern.slice(index + 1, close);
    if (!/^\d+(,\d*)?$/.test(body)) return null;
    const [min, max] = body.split(',');
    // `{n}` repeats exactly n times; `{n,}` has no ceiling at all.
    const ceiling = max === undefined ? min : max;
    risky = ceiling === '' || Number(ceiling) > SMALL_REPEAT;
    repeats = risky;
    length = close - index + 1;
  }

  if (!length) return null;
  // A lazy quantifier backtracks just as badly as a greedy one.
  if (pattern[index + length] === '?') length += 1;
  return { length, risky, repeats };
}

/** Consumes the `?:`, `?=`, `?<name>` etc. that follows a `(`. */
function readGroupPrefix(pattern: string, index: number) {
  if (pattern[index] !== '?') return 0;
  if (pattern[index + 1] === '<' && !'=!'.includes(pattern[index + 2] ?? '')) {
    const close = pattern.indexOf('>', index);
    return close === -1 ? 1 : close - index + 1;
  }
  return pattern[index + 1] === '<' ? 3 : 2;
}

interface GroupFrame {
  /** A repetition that can expand far enough to matter sits inside. */
  risky: boolean;
  /** Alternation branches that can match the same text sit inside. */
  alternation: boolean;
}

/**
 * Rejects expressions that can backtrack catastrophically before they are ever
 * run. Protocols can be imported from a file, and matching runs on every
 * protocol for every study and on every render of the manager list, so one
 * `(a+)+` would freeze the tab.
 *
 * The rule is: a group that is repeated more than once, and that contains
 * either an unbounded repetition or an alternation, is refused. An optional
 * group is not a repetition — `(head|brain)?` only doubles the paths through
 * the pattern — so it stays usable, as do character classes: `(a[+])+` and
 * `(x{2}y)?` are fine. This is deliberately conservative rather than exact —
 * it still refuses some harmless patterns, and it cannot prove the ones it
 * accepts are linear. A production version would run patterns on a
 * linear-time engine (RE2) and drop the heuristic entirely.
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

  const stack: GroupFrame[] = [{ risky: false, alternation: false }];
  const top = () => stack[stack.length - 1];
  // The group that just closed, and so is what a quantifier here would repeat.
  let closedGroup: GroupFrame | null = null;
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === '\\') {
      // A backreference makes the matcher's cost impossible to reason about.
      if (/[1-9]/.test(pattern[index + 1] ?? '')) {
        return {
          safe: false,
          reason: 'Backreferences are not allowed in a protocol pattern.',
        };
      }
      index += 2;
      closedGroup = null;
    } else if (char === '[') {
      // A class is one atom: quantifiers inside it are literal characters.
      let cursor = index + 1;
      while (cursor < pattern.length && pattern[cursor] !== ']') {
        cursor += pattern[cursor] === '\\' ? 2 : 1;
      }
      index = cursor + 1;
      closedGroup = null;
    } else if (char === '(') {
      stack.push({ risky: false, alternation: false });
      index += 1 + readGroupPrefix(pattern, index + 1);
      closedGroup = null;
    } else if (char === ')') {
      // The validity check above guarantees the parentheses balance.
      closedGroup = stack.pop() ?? { risky: false, alternation: false };
      // What was risky inside the group is risky inside its parent too, and
      // an alternation stays an alternation however many groups are wrapped
      // around it: `((a|a))+` backtracks exactly like `(a|a)+`.
      if (closedGroup.risky) top().risky = true;
      if (closedGroup.alternation) top().alternation = true;
      index += 1;
    } else if (char === '|') {
      top().alternation = true;
      index += 1;
      closedGroup = null;
    } else {
      const quantifier = readQuantifier(pattern, index);
      if (
        quantifier?.repeats &&
        (closedGroup?.risky || closedGroup?.alternation)
      ) {
        return {
          safe: false,
          reason:
            'A repeated group containing a repetition or alternation can ' +
            'hang the browser.',
        };
      }
      if (quantifier?.risky) top().risky = true;
      index += quantifier?.length ?? 1;
      closedGroup = null;
    }
  }

  return { safe: true };
}

/**
 * DICOM Long String values are 64 characters, so this truncation never changes
 * a real match. It bounds the input the pattern runs against, which bounds the
 * damage any expression the heuristic wrongly accepts can do.
 */
export const MAX_SUBJECT_LENGTH = 128;

const matchesPattern = (pattern: string | undefined, actual: string) => {
  if (!pattern || pattern.trim() === '') return null;
  // An unusable or unsafe expression never matches; the editor surfaces why.
  const matched = checkPattern(pattern).safe
    ? new RegExp(pattern, 'i').test(actual.slice(0, MAX_SUBJECT_LENGTH))
    : false;
  return { expected: `/${pattern}/i`, matched };
};

/**
 * How many rules the protocol declares. Counted the same way `evaluateProtocol`
 * decides which criteria to report, so a `minSeriesCount` of 0 counts while an
 * empty list or an empty pattern does not.
 */
export const countRules = (rules: MatchRules) =>
  [
    !!rules.modality?.length,
    !!rules.bodyPart?.length,
    !!rules.studyDescription,
    !!rules.seriesDescription,
    rules.minSeriesCount !== undefined,
    rules.maxSeriesCount !== undefined,
  ].filter(Boolean).length;

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
