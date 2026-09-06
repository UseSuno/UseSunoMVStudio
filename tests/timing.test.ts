import { describe, expect, it } from 'vitest';
import { applyTokenTimes, tokenizeLine, tokensFromLines } from '../src/timestamp/timing';
import type { LyricLine } from '../src/domain/model';

const lines: LyricLine[] = [
  { id: 'a', text: '你好 world', start: null, end: null, precision: 'untimed', words: [] },
  { id: 'b', text: '下一句', start: null, end: null, precision: 'untimed', words: [] },
];

describe('timestamp workspace', () => {
  it('uses CJK graphemes and Latin words as timing units', () => {
    expect(tokenizeLine('你好 world')).toEqual(['你', '好', 'world']);
  });

  it('builds line and word intervals from manual stamps', () => {
    const tokens = tokensFromLines(lines).map((token, index) => ({ ...token, time: [1, 1.4, 2, 4, 4.3, 4.8][index] }));
    const result = applyTokenTimes(lines, tokens, 8);
    expect(result[0]).toMatchObject({ start: 1, end: 4, precision: 'manual' });
    expect(result[0].words.map(word => [word.text, word.start, word.end])).toEqual([['你', 1, 1.4], ['好', 1.4, 2], ['world', 2, 4]]);
    expect(result[1]).toMatchObject({ start: 4, end: 8 });
  });

  it('keeps an incompletely stamped line untimed', () => {
    const tokens = tokensFromLines(lines).map((token, index) => ({ ...token, time: index < 2 ? index + 1 : null }));
    expect(applyTokenTimes(lines, tokens, 8)[0]).toMatchObject({ start: null, end: null, precision: 'untimed', words: [] });
  });
});
