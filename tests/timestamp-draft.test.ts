import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultProject } from '../src/domain/model';
import { readTimingDraft, writeTimingDraft } from '../src/timestamp/draft';
import { tokensFromLines } from '../src/timestamp/timing';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
const project = () => defaultProject([{ id: 'one', text: '你好', start: 1, end: 4, words: [], precision: 'imported' }]);
it('restores an incomplete draft both before and after an async project save', () => {
  const base = project();
  const next = { ...base, lines: base.lines.map(line => ({ ...line, start: 2 })) };
  const tokens = tokensFromLines(base.lines).map((token, i) => ({ ...token, time: i === 0 ? 2 : null }));
  writeTimingDraft(base, next, tokens, 1, { one: '你/好' });
  expect(readTimingDraft(base, tokens)?.tokens).toEqual(tokens);
  expect(readTimingDraft(next, tokens)?.cursor).toBe(1);
});
it('does not overwrite newer Studio edits with a stale timing draft', () => {
  const base = project(), tokens = tokensFromLines(base.lines);
  writeTimingDraft(base, base, tokens, 0, {});
  const edited = { ...base, lines: base.lines.map(line => ({ ...line, start: 3 })) };
  expect(readTimingDraft(edited, tokens)).toBeNull();
});
it('rejects drafts from a different lyric or invalid timestamps', () => {
  const base = project(), tokens = tokensFromLines(base.lines);
  writeTimingDraft(base, base, tokens.map(token => ({ ...token, time: -1 })), 0, {});
  expect(readTimingDraft(base, tokens)).toBeNull();
  writeTimingDraft(base, base, tokens, 0, {});
  expect(readTimingDraft({ ...base, audioName: 'another.mp3' }, tokens)).toBeNull();
});
it('restores late raw lyric timestamps when a negative offset puts them inside the audio', () => {
  const base = { ...project(), duration: 10, offset: -3 };
  const tokens = tokensFromLines(base.lines).map((token, i) => ({ ...token, time: i === 0 ? 11 : null }));
  writeTimingDraft(base, base, tokens, 1, {});
  expect(readTimingDraft(base, tokensFromLines(base.lines))?.tokens).toEqual(tokens);
});
it('does not restore a draft after the project offset changes', () => {
  const base = project(), tokens = tokensFromLines(base.lines);
  writeTimingDraft(base, base, tokens, 0, {});
  expect(readTimingDraft({ ...base, offset: 1 }, tokens)).toBeNull();
});
