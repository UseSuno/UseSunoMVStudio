import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/domain/model';
import { validateProject } from '../src/persistence/project';
import type { Project } from '../src/domain/model';
import { introEnd, introFrame, wrapIntroText } from '../src/folia/intro';
const project = (start: number, overrides: Partial<Project> = {}) => ({ title: 'Song', artist: 'Artist', template: 'folia-classic', duration: 120, offset: 0, lines: [{ text: 'Lyrics', start, end: start + 3 }], ...overrides } as Project);
describe('automatic song intro', () => {
  it('preserves the opt-out through project serialization and defaults older projects to on', () => {
    const p = { ...defaultProject([]), autoIntro: false };
    expect(introEnd(validateProject(JSON.parse(JSON.stringify(p))))).toBe(0);
    expect(validateProject(p).autoIntro).toBe(false);
    const { autoIntro, ...legacy } = p;
    expect(validateProject(legacy).autoIntro).toBe(true);
    expect(() => validateProject({ ...p, autoIntro: 'false' })).toThrow();
    expect(introEnd(project(20, { autoIntro: false }))).toBe(0);
  });
  it('skips short intros and native title renderers', () => {
    expect(introEnd(project(2.99))).toBe(0);
    expect(introEnd(project(3))).toBe(3);
    for (const template of ['folia-monet', 'folia-cappella'] as const) expect(introEnd(project(20, { template }))).toBe(0);
    expect(introEnd(project(20, { title: '', artist: '' }))).toBe(0);
  });
  it('uses media time and preserves the offset and lyric timestamps', () => {
    const p = project(4, { offset: -2 });
    expect(introEnd(p)).toBe(0); expect(p.lines[0].start).toBe(4);
    expect(introEnd(project(2, { offset: 3 }))).toBe(5);
    expect(introEnd(project(30, { duration: 12 }))).toBe(12);
  });
  it('fades at the first lyric and is deterministic across seek and pause', () => {
    const opening = introFrame(0, 20);
    expect(opening).toMatchObject({ active: true, opacity: 1, compact: 0 });
    expect(introFrame(8, 20).compact).toBe(1);
    expect(introFrame(9, 10).compact).toBe(0);
    expect(introFrame(19.65, 20).opacity).toBeCloseTo(.5);
    expect(introFrame(20, 20).active).toBe(false);
    expect(introFrame(0, 20)).toEqual(opening);
    expect(introFrame(-1, 20).active).toBe(false);
  });
  it('supports instrumental tracks and ignores untimed lines', () => {
    expect(introEnd(project(0, { lines: [] }))).toBe(120);
    expect(introEnd(project(0, { lines: [{ text: 'Draft', start: null, end: null }] as Project['lines'] }))).toBe(120);
  });
  it('wraps CJK and preserves joined emoji', () => {
    expect(wrapIntroText('山水之间一直走', 3, text => text.length)).toEqual(['山水之', '间一直', '走']);
    const text = '👨‍👩‍👧‍👦你好';
    const lines = wrapIntroText(text, 1, value => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length);
    expect(lines).toEqual(['👨‍👩‍👧‍👦', '你', '好']);
  });
});
