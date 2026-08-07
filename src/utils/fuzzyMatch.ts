export interface FuzzyMatch {
  /** Higher is a better match. */
  score: number;
  /** Indices into the haystack that matched, for highlighting. */
  indices: number[];
}

/**
 * Subsequence fuzzy match, in the style of an editor's command palette.
 *
 * Every character of the query must appear in order in the haystack.
 * Consecutive characters and matches at word starts score highest, so
 * "cyl" ranks "Cycle layout" above "Currently loaded".
 */
export function fuzzyMatch(haystack: string, query: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };

  const target = haystack.toLowerCase();
  const needle = query.toLowerCase();
  const indices: number[] = [];

  let score = 0;
  let cursor = 0;

  for (let q = 0; q < needle.length; q += 1) {
    const char = needle[q];
    if (char === ' ') continue;

    const found = target.indexOf(char, cursor);
    if (found === -1) return null;

    if (found === 0) score += 10;
    else if (/[\s\-_/:.]/.test(target[found - 1])) score += 8;
    if (indices.length && found === indices[indices.length - 1] + 1) score += 6;
    // Prefer matches that start early.
    score -= Math.min(found - cursor, 10) * 0.5;

    indices.push(found);
    cursor = found + 1;
  }

  // Slight preference for shorter, tighter titles.
  score -= target.length * 0.01;
  return { score, indices };
}

/**
 * Ranks items by their best fuzzy match, searching `text` first and falling
 * back to `keywords` (which never contributes highlight indices).
 */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  accessors: { text: (item: T) => string; keywords?: (item: T) => string }
): Array<{ item: T; score: number; indices: number[] }> {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 0, indices: [] }));
  }

  return items
    .map((item) => {
      const primary = fuzzyMatch(accessors.text(item), query);
      if (primary) {
        return { item, score: primary.score, indices: primary.indices };
      }
      const keywords = accessors.keywords?.(item);
      const secondary = keywords ? fuzzyMatch(keywords, query) : null;
      if (secondary) {
        // Keyword hits rank below title hits.
        return { item, score: secondary.score - 25, indices: [] };
      }
      return null;
    })
    .filter((entry): entry is { item: T; score: number; indices: number[] } =>
      Boolean(entry)
    )
    .sort((a, b) => b.score - a.score);
}
