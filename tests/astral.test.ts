import { describe, expect, it } from 'vitest';
import { compileAstralShots } from '../src/astral/director';
import type { Line } from '../src/vendor/folia/types';

const makeLine = (fullText: string, startTime = 0, endTime = 8): Line => ({
  id: 'test-astral',
  fullText,
  startTime,
  endTime,
  words: [],
});

describe('Astral lyric animation director', () => {
  it.each([
    '深空星轨与三维星座引力',
    'Floating across the cosmic ocean of starlight',
    '星の海を渡る光の舟',
    '은하수를 따라 흐르는 선율',
  ])('preserves complete text content: %s', (text) => {
    const shots = compileAstralShots([makeLine(text)]);
    expect(shots.length).toBeGreaterThan(0);
    const reconstructed = shots.flatMap(s => s.phrases).map(p => p.text).join('');
    expect(reconstructed).toBe(text);
  });

  it('generates valid 3D orbital parameters and chronological shots', () => {
    const lines = [
      makeLine('星云初现', 0, 3),
      makeLine('轨道环绕', 4, 8),
      makeLine('引力共振', 9, 14),
    ];
    const shots = compileAstralShots(lines);
    expect(shots.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < shots.length; i++) {
      expect(shots[i].orbitRadius).toBeGreaterThan(0);
      expect(typeof shots[i].orbitTilt).toBe('number');
      if (i > 0) {
        expect(shots[i].start).toBeGreaterThanOrEqual(shots[i - 1].start);
      }
    }
  });

  it('is deterministic for identical input lines', () => {
    const lines = [
      makeLine('漫步在星尘交织的光年里', 0, 5),
      makeLine('Every star sings a timeless song', 6, 11),
    ];
    expect(compileAstralShots(lines)).toEqual(compileAstralShots(lines));
  });

  it('treats slashes strictly as phrase delimiters and keeps 1 shot per line', () => {
    const lineWithSlashes = makeLine('风把远方 / 写成了诗', 0, 8);
    const shots = compileAstralShots([lineWithSlashes]);
    expect(shots.length).toBe(1);

    const allGlyphs = shots.flatMap(s => s.phrases.flatMap(p => p.glyphs));
    const slashGlyphs = allGlyphs.filter(g => g.char === '/');
    expect(slashGlyphs.length).toBe(0);

    const totalChars = shots.flatMap(s => s.phrases).reduce((acc, p) => acc + p.glyphs.length, 0);
    expect(totalChars).toBe(8);
  });
});
