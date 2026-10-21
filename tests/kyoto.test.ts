import { describe, expect, it } from 'vitest';
import {
  compileKyotoShots,
  isCjkText,
  groupKyotoGlyphsIntoWords,
  resolveContinuousKyotoCamera,
} from '../src/kyoto/director';
import type { Line } from '../src/vendor/folia/types';

const makeLine = (fullText: string, startTime = 0, endTime = 8, wordSegments?: string[]): Line => ({
  id: 'test-line',
  fullText,
  startTime,
  endTime,
  words: [],
  wordSegments,
});

describe('Kyoto lyric animation director (Sonnet benchmark)', () => {
  it.each([
    '日系活字排版与纵横错落',
    'Whispers in the rain through ancient shrines',
    '夜明けの街に響く歌声',
    '달빛 아래 조용히 흐르는 강',
  ])('preserves text across graphemes: %s', (text) => {
    const shots = compileKyotoShots([makeLine(text)]);
    expect(shots.length).toBeGreaterThan(0);
    const reconstructed = shots.flatMap(s => s.phrases).map(p => p.text).join('');
    expect(reconstructed).toBe(text);
  });

  it('preserves timing monotonicity and valid shot ranges', () => {
    const lines = [
      makeLine('京都的晨钟在山间回响', 0, 4),
      makeLine('古道旁的红枫随风摇曳', 5, 9),
      makeLine('石阶上的月光宛如白绢', 10, 15),
    ];
    const shots = compileKyotoShots(lines);
    expect(shots.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      expect(s.end).toBeGreaterThan(s.start);
      if (i > 0) {
        expect(s.start).toBeGreaterThanOrEqual(shots[i - 1].start);
      }
    }
  });

  it('is deterministic for identical inputs', () => {
    const lines = [
      makeLine('风把远方写成了诗', 2, 6),
      makeLine('We follow the light through the city', 7, 12),
    ];
    const run1 = compileKyotoShots(lines);
    const run2 = compileKyotoShots(lines);
    expect(run1).toEqual(run2);
  });

  it('treats slashes strictly as phrase delimiters and does not include slashes in characters', () => {
    const lineWithSlashes = makeLine('风把远方 / 写成了诗', 0, 8);
    const shots = compileKyotoShots([lineWithSlashes]);
    expect(shots.length).toBeGreaterThan(0);

    const allGlyphs = shots.flatMap(s => s.phrases.flatMap(p => p.glyphs));
    const slashGlyphs = allGlyphs.filter(g => g.char === '/');
    expect(slashGlyphs.length).toBe(0);

    // Characters count should only be the 8 real characters (风把远方写成了诗)
    const totalChars = shots.flatMap(s => s.phrases).reduce((acc, p) => acc + p.glyphs.length, 0);
    expect(totalChars).toBe(8);
  });

  it('honours wordSegments without slashes', () => {
    const line = makeLine('风把远方写成了诗', 0, 8, ['风把远方', '写成了诗']);
    const shots = compileKyotoShots([line]);
    expect(shots[0].phrases.length).toBe(2);
    expect(shots[0].phrases[0].text).toBe('风把远方');
    expect(shots[0].phrases[1].text).toBe('写成了诗');
  });

  it('does not arbitrarily chop a normal sentence without slashes into multiple phrases', () => {
    const normalLine = makeLine('古道旁的红枫随风摇曳', 0, 8);
    const shots = compileKyotoShots([normalLine]);
    expect(shots.length).toBe(1);
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('古道旁的红枫随风摇曳');
  });

  it('guarantees strictly distinct coordinates for all phrases in a multi-phrase line (no overlapping)', () => {
    const lineWithMultiplePhrases = makeLine('京都的晨钟 / 在山间回响 / 唤醒了沉睡的古寺', 0, 10);
    const shots = compileKyotoShots([lineWithMultiplePhrases]);
    expect(shots.length).toBe(1);
    const phrases = shots[0].phrases;
    expect(phrases.length).toBe(3);

    const positions = new Set<string>();
    phrases.forEach((p) => {
      const key = `${p.relX.toFixed(3)},${p.relY.toFixed(3)}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    });
  });

  it('accurately distinguishes CJK text from Western / Latin text', () => {
    expect(isCjkText('京都的晨钟在山间回响')).toBe(true);
    expect(isCjkText('夜明けの街に響く歌声')).toBe(true);
    expect(isCjkText('달빛 아래 조용히 흐르는 강')).toBe(true);
    expect(isCjkText('Whispers in the rain through ancient shrines')).toBe(false);
    expect(isCjkText('We follow the light through the city')).toBe(false);
  });

  it('does NOT fragment English lines into 1-word rows when wordSegments are single words', () => {
    const singleWords = ['Whispers', 'in', 'the', 'rain', 'through', 'ancient', 'shrines'];
    const line = makeLine('Whispers in the rain through ancient shrines', 0, 10, singleWords);
    const shots = compileKyotoShots([line]);

    // Should NOT create 7 separate phrases/rows
    expect(shots.length).toBe(1);
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('Whispers in the rain through ancient shrines');

    // Should group glyphs into 7 whole-word tokens
    const words = groupKyotoGlyphsIntoWords(shots[0].phrases[0].glyphs);
    expect(words.map(w => w.text)).toEqual(singleWords);
  });

  it('protects CJK lines from automated 1-character word segmenters', () => {
    const line = makeLine('夜明けの街に響く歌声', 0, 8, ['夜明け', 'の', '街', 'に', '響く', '歌声']);
    const shots = compileKyotoShots([line]);

    // Should NOT chop into 6 fragmented phrases
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('夜明けの街に響く歌声');
  });

  it('generates authentic Hanko seals and poster serial numbers for each shot', () => {
    const lines = [
      makeLine('京都的晨钟在山间回响', 0, 5),
      makeLine('Whispers in the rain / through ancient shrines', 6, 12),
    ];
    const shots = compileKyotoShots(lines);

    expect(shots.length).toBe(2);
    expect(shots[0].seal).toBeDefined();
    expect(shots[0].seal?.text.length).toBe(1);
    expect(['square', 'circle']).toContain(shots[0].seal?.shape);
    expect(['zhuwen', 'baiwen']).toContain(shots[0].seal?.style);
    expect(shots[0].posterSerial).toContain('KYOTO // TYPE 019');

    expect(shots[1].seal).toBeDefined();
    expect(shots[1].posterSerial).toContain('VOL.02');
  });

  it('provides smooth and continuous camera interpolation across shot boundaries', () => {
    const lines = [
      makeLine('京都的晨钟在山间回响', 0, 5),
      makeLine('古道旁的红枫随风摇曳', 6, 12),
    ];
    const shots = compileKyotoShots(lines);

    // Mid-shot camera
    const frameMid0 = resolveContinuousKyotoCamera(shots, 2.5);
    expect(frameMid0.zoom).toBeGreaterThan(0.9);
    expect(typeof frameMid0.x).toBe('number');

    // Transition window between shots
    const transTime = (shots[0].exitStart + shots[1].start) / 2;
    const frameTrans = resolveContinuousKyotoCamera(shots, transTime);
    expect(frameTrans.zoom).toBeGreaterThan(0.9);

    // Second shot
    const frameMid1 = resolveContinuousKyotoCamera(shots, 8.0);
    expect(frameMid1.zoom).toBeGreaterThan(0.9);
  });

  it('extracts impactful hero graphemes for both CJK characters and Latin words', () => {
    const lines = [
      makeLine('京都的晨钟在山间回响', 0, 5),
      makeLine('Whispers in the rain through ancient shrines', 6, 12),
    ];
    const shots = compileKyotoShots(lines);

    // CJK hero grapheme should be a meaningful non-particle character
    expect(shots[0].heroGrapheme).toBeDefined();
    expect(shots[0].heroGrapheme?.length).toBe(1);
    expect(['的', '在', '之', '了']).not.toContain(shots[0].heroGrapheme);

    // Latin hero grapheme should be an uppercase key word
    expect(shots[1].heroGrapheme).toBeDefined();
    expect(shots[1].heroGrapheme).toBe(shots[1].heroGrapheme?.toUpperCase());
  });

  it('generates dynamic collage color plates and chapter badges', () => {
    const lines = [
      makeLine('京都的晨钟在山间回响', 0, 5),
      makeLine('古道旁的红枫随风摇曳', 6, 11),
      makeLine('石阶上的月光宛如白绢', 12, 17),
    ];
    const shots = compileKyotoShots(lines);

    // Chapter badge check
    shots.forEach((s) => {
      expect(s.chapterBadge).toBeDefined();
      expect(s.chapterBadge.length).toBeGreaterThan(0);
    });

    // Check color plates for applicable archetypes
    const hasPlates = shots.some(s => s.colorPlate !== undefined);
    expect(hasPlates).toBe(true);
  });
});

