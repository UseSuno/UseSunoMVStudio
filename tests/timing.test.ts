import { describe, expect, it } from 'vitest';
import { applyTokenTimes, tokenizeLine, tokensFromLines, previewTimes, parseTimingInput, timingTimeError, toLyricTime, toMediaTime } from '../src/timestamp/timing';
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

it('preserves imported line timing while a word is being retapped', () => {
  const imported: LyricLine[] = [{ ...lines[0], start: 1, end: 6, precision: 'imported', words: [{ text: '你', start: 1, end: 2 }, { text: '好', start: 2, end: 3 }, { text: 'world', start: 3, end: 6 }] }];
  const partial = tokensFromLines(imported).map((token, index) => index === 1 ? { ...token, time: null } : token);
  expect(applyTokenTimes(imported, partial, 8)).toEqual(imported);
});

it('retains the original word segmentation and line-start anchors', () => {
  const grouped: LyricLine[] = [{ ...lines[0], words: [{ text: '你好', start: 1, end: 2 }, { text: 'world', start: 2, end: 3 }] }];
  expect(tokensFromLines(grouped).map(token => [token.text, token.time])).toEqual([['你好', 1], ['world', 2]]);
  expect(tokensFromLines([{ ...lines[0], start: 4 }]).map(token => token.time)).toEqual([4, null, null]);
});

it('does not publish backwards or out-of-range word intervals', () => {
  for (const times of [[1, .5, 2], [1, 2, 9], [1, NaN, 2]]) {
    const tokens = tokensFromLines([lines[0]]).map((token, i) => ({ ...token, time: times[i] }));
    expect(applyTokenTimes([lines[0]], tokens, 8)).toEqual([lines[0]]);
  }
});

it('interpolates preview between anchors without filling the saved draft', () => {
  const anchored = [{ ...lines[0], start: 1, end: 7 }];
  const tokens = tokensFromLines(anchored);
  expect(previewTimes(anchored, tokens, 8)).toEqual([1, 3, 5]);
  expect(tokens.map(token => token.time)).toEqual([1, null, null]);
});

it('accepts seconds and mm:ss.mmm while rejecting malformed times', () => {
  expect(parseTimingInput('01:02.345')).toBe(62.345);
  expect(parseTimingInput('2,5')).toBe(2.5);
  expect(parseTimingInput('')).toBeNull();
  for (const text of ['Infinity', '-1', '1:90', '1e2', '1::2']) expect(parseTimingInput(text)).toBeNaN();
});

describe('audio-clock editing with a project lyric offset', () => {
  const imported: LyricLine[] = [{ id: 'intro', text: 'Hello world', start: 10, end: 15, precision: 'imported', words: [{ text: 'Hello', start: 10, end: 12 }, { text: 'world', start: 12, end: 15 }] }];
  it('shows and seeks to the same audio times as Studio while leaving saved lyric times untouched', () => {
    const tokens = tokensFromLines(imported);
    expect(previewTimes(imported, tokens, 60, 1)).toEqual([11, 13]);
    expect(toMediaTime(tokens[0].time!, 1)).toBe(11);
    expect(applyTokenTimes(imported, tokens, 60, 1)).toEqual(imported);
  });
  it('stores a tap or manual correction once, and preserves that timing after reopening', () => {
    for (const offset of [1, -2.5]) {
      const tokens = tokensFromLines(imported).map((token, index) => ({ ...token, time: toLyricTime([11, 13][index], offset) }));
      const saved = applyTokenTimes(imported, tokens, 60, offset);
      expect(saved[0].start).toBe(11 - offset);
      expect(previewTimes(saved, tokensFromLines(saved), 60, offset)).toEqual([11, 13]);
      expect(applyTokenTimes(saved, tokensFromLines(saved), 60, offset)).toEqual(saved);
    }
  });
  it('interpolates untapped words in audio time and clips the final saved interval to the shifted audio end', () => {
    const untapped = [{ ...lines[0], start: 1, end: 7 }];
    expect(previewTimes(untapped, tokensFromLines(untapped), 10, 2)).toEqual([3, 5, 7]);
    const late: LyricLine[] = [{ ...lines[0], text: 'Final', start: null, end: null }];
    const tokens = tokensFromLines(late).map(token => ({ ...token, time: toLyricTime(59, -3) }));
    const saved = applyTokenTimes(late, tokens, 60, -3);
    expect(saved[0]).toMatchObject({ start: 62, end: 63 });
    expect(toMediaTime(saved[0].end!, -3)).toBe(60);
  });
  it('rejects unrepresentable or out-of-audio edits rather than silently moving them', () => {
    expect(timingTimeError(.5, 60, 1)).toBe('beforeOffset');
    expect(timingTimeError(1, 60, 1)).toBeNull();
    expect(timingTimeError(59, 60, -3)).toBeNull();
    for (const value of [-1, 60, NaN]) expect(timingTimeError(value, 60, 1)).toBe('invalidTime');
  });
});
