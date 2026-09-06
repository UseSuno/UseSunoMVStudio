import { describe, expect, it } from 'vitest';
import { estimateTiming, parseLyrics, toLrc } from '../src/import/lyrics';
import { defaultProject, templates } from '../src/domain/model';
import { validateProject } from '../src/persistence/project';
import { fontFamily } from '../src/fonts/fonts';
// Source precision, malformed input and boundary times are export-critical contracts.
describe('lyric import', () => {
  it('does not invent timing for plain text', () => { const { lines } = parseLyrics('第一句\n第二句', 10); expect(lines).toHaveLength(2); expect(lines[0]).toMatchObject({ start: null, end: null, precision: 'untimed', words: [] }); });
  it('preserves repeated timestamps, sorts, handles BOM and signed offset', () => { const { lines } = parseLyrics('\uFEFF[offset:-500]\r\n[00:07.00][00:02.00]回声\r\n[00:04.20]城市', 10); expect(lines.map(l => l.start)).toEqual([1.5, 3.7, 6.5]); expect(lines[0].end).toBe(3.7); expect(new Set(lines.map(l => l.id)).size).toBe(3); });
  it('retains enhanced word timing instead of distributing evenly', () => { const { lines } = parseLyrics('[00:01.00]<00:01.00>风<00:01.20>来了<00:03.50>\n[00:04.00]下一句', 8); expect(lines[0].words).toEqual([{ text: '风', start: 1, end: 1.2 }, { text: '来了', start: 1.2, end: 3.5 }]); });
  it('retains long gaps by limiting estimated line holds', () => { const { lines } = parseLyrics('[00:00.00]第一句\n[00:20.00]第二句', 30); expect(lines[0].end).toBe(8); });
  it('makes estimated timing explicit and exports offset only once', () => { const lines = estimateTiming(parseLyrics('a\nb', 10).lines, 10); expect(lines.map(l => l.precision)).toEqual(['estimated', 'estimated']); expect(toLrc(lines, 1)).toBe('[00:01.00]a\n[00:06.00]b'); });
  it('ignores metadata and warns on out of range lyrics', () => { const parsed = parseLyrics('[ti:Title]\n[ar:Artist]\n[01:00.00]late', 10); expect(parsed.lines).toHaveLength(1); expect(parsed.warnings[0]).toContain('超出'); });
});
describe('project validation', () => {
  it('roundtrips a valid versioned project', () => { const p = defaultProject(parseLyrics('[00:00.00]Hello', 46).lines); expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p); });
  it('rejects unsupported schema, unbounded geometry and malformed timelines', () => { const p = defaultProject([]); expect(() => validateProject({ ...p, version: 9 })).toThrow(); expect(() => validateProject({ ...p, fontScale: Infinity })).toThrow(); expect(() => validateProject({ ...p, lines: [{ id: 'a', text: 'x', start: 5, end: 2, precision: 'manual', words: [] }] })).toThrow(); });
});

it('accepts Google and local font selections', () => {
  expect(validateProject({ ...defaultProject([]), font: 'noto-serif-sc' }).font).toBe('noto-serif-sc');
  const local = validateProject({ ...defaultProject([]), font: 'local', customFontName: 'My Font' });
  expect(local.customFontName).toBe('My Font');
  expect(fontFamily(local)).toBe('My Font');
});

import { normalizeEmbedded } from '../src/import/embedded';
describe('embedded synchronization', () => {
  it('aligns per-glyph SYLT to matching unsynchronized line breaks', () => {
    const candidates = normalizeEmbedded([{ timeStampFormat: 2, syncText: [{text:'风',timestamp:1000},{text:'来',timestamp:1300},{text:'了',timestamp:1600},{text:'你',timestamp:3000},{text:'好',timestamp:3400}] }, {text:'风来了\n你好'}]);
    const result = parseLyrics(candidates[0].text, 10); expect(result.lines).toHaveLength(2); expect(result.lines[0].text).toBe('风来了'); expect(result.lines[0].words).toHaveLength(3); expect(result.lines[1].start).toBe(3);
  });
  it('does not misread MPEG frame timestamps as milliseconds', () => { const c = normalizeEmbedded([{timeStampFormat:1,syncText:[{text:'风',timestamp:1000}]}]); expect(c[0].text).toBe('风'); expect(c[0].label).toContain('需校时'); });
});

it('persists every selectable Folia mode without losing its identity', () => {
 for (const {id} of templates) {
  const project = {...defaultProject([]), template:id};
  expect(validateProject(JSON.parse(JSON.stringify(project))).template).toBe(id);
 }
});
