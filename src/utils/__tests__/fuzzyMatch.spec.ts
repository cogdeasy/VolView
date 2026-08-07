import { describe, it, expect } from 'vitest';

import { fuzzyMatch, fuzzyRank } from '@/src/utils/fuzzyMatch';

describe('fuzzyMatch', () => {
  it('matches a subsequence and reports the matched indices', () => {
    const match = fuzzyMatch('Cycle layout', 'cyt');
    expect(match).not.toBeNull();
    expect(match!.indices).toEqual([0, 1, 11]);
  });

  it('rejects characters that are out of order or missing', () => {
    expect(fuzzyMatch('Cycle layout', 'lyc')).toBeNull();
    expect(fuzzyMatch('Cycle layout', 'czz')).toBeNull();
  });

  it('scores word starts above mid-word matches', () => {
    const wordStart = fuzzyMatch('Reset views', 'rv')!;
    const midWord = fuzzyMatch('Grayscale invert', 'rv')!;
    expect(wordStart.score).toBeGreaterThan(midWord.score);
  });
});

describe('fuzzyRank', () => {
  const items = [
    { title: 'Cycle layout', keywords: 'grid' },
    { title: 'Cycle window preset', keywords: 'level' },
    { title: 'Next slice', keywords: 'scroll' },
  ];
  const accessors = {
    text: (item: (typeof items)[number]) => item.title,
    keywords: (item: (typeof items)[number]) => item.keywords,
  };

  it('returns every item, in order, for an empty query', () => {
    expect(fuzzyRank(items, '  ', accessors).map(({ item }) => item)).toEqual(
      items
    );
  });

  it('ranks title matches above keyword-only matches', () => {
    const ranked = fuzzyRank(items, 'level', accessors);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].item.title).toBe('Cycle window preset');

    const both = fuzzyRank(
      [{ title: 'Level', keywords: '' }, ...items],
      'level',
      accessors
    );
    expect(both[0].item.title).toBe('Level');
  });

  it('drops items that do not match at all', () => {
    expect(fuzzyRank(items, 'zzz', accessors)).toEqual([]);
  });
});
