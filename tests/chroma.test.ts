import { describe, expect, it } from 'vitest';
import { compileChromaShots } from '../src/chroma/director';
import { isCjkText, groupGlyphsIntoWords } from '../src/chroma/latinRenderer';
import type { Line } from '../src/vendor/folia/types';

const makeLine = (fullText: string, startTime = 0, endTime = 8, wordSegments?: string[]): Line => ({
  id: 'test-line',
  fullText,
  startTime,
  endTime,
  words: [],
  wordSegments,
});

describe('Chroma lyric animation director (Tempera benchmark)', () => {
  it.each([
    '叠层艺术画纸与矿物颜料拼贴',
    'Layered paper collage with mineral pigments',
    '紙片と絵の具のパッチワーク',
    '종이 위에 번지는 푸른 물감',
  ])('preserves text across graphemes: %s', (text) => {
    const shots = compileChromaShots([makeLine(text)]);
    expect(shots.length).toBeGreaterThan(0);
    const reconstructed = shots.flatMap(s => s.phrases).map(p => p.text).join('');
    expect(reconstructed).toBe(text);
  });

  it('preserves timing monotonicity and valid shot ranges', () => {
    const lines = [
      makeLine('调色盘上的赭石与石青', 0, 4),
      makeLine('手作纸张的纤维粗糙而温暖', 5, 9),
      makeLine('印章落下的瞬间色彩凝固', 10, 15),
    ];
    const shots = compileChromaShots(lines);
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
    const run1 = compileChromaShots(lines);
    const run2 = compileChromaShots(lines);
    expect(run1).toEqual(run2);
  });

  it('treats slashes strictly as phrase delimiters and does not include slashes in characters', () => {
    const lineWithSlashes = makeLine('风把远方 / 写成了诗', 0, 8);
    const shots = compileChromaShots([lineWithSlashes]);
    expect(shots.length).toBeGreaterThan(0);

    const allGlyphs = shots.flatMap(s => s.phrases.flatMap(p => p.glyphs));
    const slashGlyphs = allGlyphs.filter(g => g.char === '/');
    expect(slashGlyphs.length).toBe(0);

    // Characters count should only be the 8 real characters
    const totalChars = shots.flatMap(s => s.phrases).reduce((acc, p) => acc + p.glyphs.length, 0);
    expect(totalChars).toBe(8);
  });

  it('honours wordSegments without slashes', () => {
    const line = makeLine('风把远方写成了诗', 0, 8, ['风把远方', '写成了诗']);
    const shots = compileChromaShots([line]);
    expect(shots[0].phrases.length).toBe(2);
    expect(shots[0].phrases[0].text).toBe('风把远方');
    expect(shots[0].phrases[1].text).toBe('写成了诗');
  });

  it('does not arbitrarily chop a normal sentence without slashes into multiple phrases', () => {
    const normalLine = makeLine('调色盘上的赭石与石青沉淀在画纸表面', 0, 8);
    const shots = compileChromaShots([normalLine]);
    expect(shots.length).toBe(1);
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('调色盘上的赭石与石青沉淀在画纸表面');
  });

  it('guarantees strictly distinct coordinates for all phrases in a multi-phrase line (no overlapping)', () => {
    const lineWithMultiplePhrases = makeLine('赭石涂抹 / 石青点缀 / 朱砂钤印', 0, 10);
    const shots = compileChromaShots([lineWithMultiplePhrases]);
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

  it('generates authentic deckle paper seeds, mineral pigment types, and chop seal metadata', () => {
    const line = makeLine('赭石涂抹 / 石青点缀 / 朱砂钤印', 0, 10);
    const shots = compileChromaShots([line]);
    expect(shots[0].backdropChips.length).toBeGreaterThan(0);
    shots[0].backdropChips.forEach((chip) => {
      expect(['cinnabar', 'azurite', 'malachite', 'ochre', 'gold-leaf']).toContain(chip.mineral);
      expect(chip.chineseName.length).toBeGreaterThan(0);
    });

    expect(shots[0].sealStamp).toBeDefined();
    expect(shots[0].sealStamp?.text.length).toBeGreaterThan(0);
    expect(['square', 'circle']).toContain(shots[0].sealStamp?.shape);

    shots[0].phrases.forEach((p) => {
      expect(p.paperSeed).toBeGreaterThan(0);
      expect(p.paperRoughness).toBeGreaterThan(1.0);
      expect(['cinnabar', 'azurite', 'malachite', 'ochre', 'gold-leaf']).toContain(p.mineralType);
    });
  });

  it('accurately distinguishes CJK from Western/Latin lyrics', () => {
    expect(isCjkText('风把远方写成了诗')).toBe(true);
    expect(isCjkText('風にのせて この歌を届けよう')).toBe(true);
    expect(isCjkText('별빛 아래 우리 함께 걸어요')).toBe(true);
    expect(isCjkText('让每一种语言 都唱出心中的光')).toBe(true);

    expect(isCjkText('We follow the light through the city')).toBe(false);
    expect(isCjkText('Kita melangkah mengikuti cahaya')).toBe(false);
    expect(isCjkText('Wir tragen die Träume durch die Nacht')).toBe(false);
    expect(isCjkText('La música nos lleva hacia el mar')).toBe(false);
  });

  it('preserves English words as intact tokens instead of single vertical letters', () => {
    const shots = compileChromaShots([makeLine('We follow the light through the city', 0, 10)]);
    const phrase = shots[0].phrases[0];
    const words = groupGlyphsIntoWords(phrase.glyphs);

    expect(words.map(w => w.text)).toEqual([
      'We',
      'follow',
      'the',
      'light',
      'through',
      'the',
      'city'
    ]);

    // Check monotonic timing for each word
    words.forEach(w => {
      expect(w.endTime).toBeGreaterThanOrEqual(w.startTime);
    });
  });

  it('does NOT fragment English lines into 1-word columns when wordSegments are single words', () => {
    // Automated word segmenters emit individual single words.
    // In Chroma, this must NOT create 7 separate columns (which would show only 1 word per screen).
    const singleWordSegments = ['We', 'follow', 'the', 'light', 'through', 'the', 'city'];
    const line = makeLine('We follow the light through the city', 0, 10, singleWordSegments);
    const shots = compileChromaShots([line]);

    expect(shots.length).toBe(1);
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('We follow the light through the city');

    const words = groupGlyphsIntoWords(shots[0].phrases[0].glyphs);
    expect(words.length).toBe(7);
  });

  it('splits English lines only when explicit slashes or multi-word clauses are provided', () => {
    // 1. Explicit slashes
    const slashLine = makeLine('We follow the light / through the city', 0, 10);
    const slashShots = compileChromaShots([slashLine]);
    expect(slashShots[0].phrases.length).toBe(2);
    expect(slashShots[0].phrases[0].text).toBe('We follow the light');
    expect(slashShots[0].phrases[1].text).toBe('through the city');

    // 2. Multi-word clause segments
    const clauseLine = makeLine('Across the open plain into the rising sun', 0, 10, [
      'Across the open plain',
      'into the rising sun',
    ]);
    const clauseShots = compileChromaShots([clauseLine]);
    expect(clauseShots[0].phrases.length).toBe(2);
    expect(clauseShots[0].phrases[0].text).toBe('Across the open plain');
    expect(clauseShots[0].phrases[1].text).toBe('into the rising sun');
  });

  it('protects CJK lines from being hyper-fragmented by automated 1-character word segmenters', () => {
    // Automated segmenter outputs 1-2 char words: ['风', '把', '远方', '写', '成了', '诗']
    const line = makeLine('风把远方写成了诗', 0, 8, ['风', '把', '远方', '写', '成了', '诗']);
    const shots = compileChromaShots([line]);

    // Should NOT create 6 columns; should keep as 1 continuous calligraphy column
    expect(shots[0].phrases.length).toBe(1);
    expect(shots[0].phrases[0].text).toBe('风把远方写成了诗');
  });
});


