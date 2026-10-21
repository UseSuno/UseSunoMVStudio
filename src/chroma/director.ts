import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline, type GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';

export type ChromaShotKind = 'duo-split' | 'quad-split' | 'thirds-stack' | 'cinema-letterbox';
export type ChromaEnterStyle = 'slide' | 'from-left' | 'from-right' | 'from-above' | 'from-below' | 'stamp';
export type ChromaTone = 'accent' | 'contrast' | 'tint' | 'muted';
export type ChromaMineralType = 'cinnabar' | 'azurite' | 'malachite' | 'ochre' | 'gold-leaf';
export type ChromaLayoutDirection = 'horizontal' | 'vertical';

export interface ChromaGlyph extends GraphemeTiming {
  char: string;
  startTime: number;
  endTime: number;
  indexInPhrase: number;
}

export interface ChromaSeal {
  text: string;
  relX: number;
  relY: number;
  size: number;
  shape: 'square' | 'circle';
}

export interface ChromaWashiTape {
  relX: number;
  relY: number;
  angle: number;
  width: number;
  height: number;
}

export interface ChromaBackdropChip {
  relX: number;
  relY: number;
  width: number;
  height: number;
  angle: number;
  mineral: ChromaMineralType;
  chineseName: string;
  latinName: string;
}

export interface ChromaMonumentalGlyph {
  char: string;
  relX: number;
  relY: number;
  scale: number;
  angle: number;
  startTime: number;
  endTime: number;
  mineral: ChromaMineralType;
}

export interface ChromaPhrase {
  text: string;
  glyphs: ChromaGlyph[];
  start: number;
  end: number;
  role: 'hero' | 'support' | 'accent';
  relX: number;
  relY: number;
  fontScale: number;
  enterStyle: ChromaEnterStyle;
  tone: ChromaTone;
  cardAngle: number;
  paperSeed: number;
  paperRoughness: number;
  mineralType: ChromaMineralType;
  seal?: ChromaSeal;
  washiTape?: ChromaWashiTape;
  zOrder: number;
  layoutDirection: ChromaLayoutDirection;
  globalColIndex: number;
}

export interface ChromaCameraKey {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface ChromaShot {
  id: string;
  lineIndex: number;
  start: number;
  end: number;
  lineStartTime: number;
  lineEndTime: number;
  exitStart: number;
  kind: ChromaShotKind;
  phrases: ChromaPhrase[];
  hero: number;
  flowAngle: number;
  camera: ChromaCameraKey;
  cameraEnd: ChromaCameraKey;
  backdropChips: ChromaBackdropChip[];
  sealStamp?: ChromaSeal;
  openingSeal?: ChromaSeal;
  cornerSeal?: ChromaSeal;
  editionPlate: string;
  monumentalGlyph?: ChromaMonumentalGlyph;
  globalStartCol: number;
  globalEndCol: number;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const easeSoftBack = (t: number) => {
  const c1 = 1.2;
  const c3 = c1 + 1;
  const p = clamp01(t);
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export const easeInOutCubic = (t: number) => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

export const easeExpoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const resolveChromaCameraFrame = (shot: ChromaShot, time: number): ChromaCameraKey => {
  const duration = Math.max(shot.end - shot.start, 0.001);
  const rawProgress = (time - shot.start) / duration;
  const clamped = clamp01(rawProgress);
  const eased = clamped * 0.55 + easeInOutCubic(clamped) * 0.45;
  const overshoot = Math.max(0, rawProgress - 1) * 0.25;
  const t = eased + overshoot;

  return {
    x: shot.camera.x + (shot.cameraEnd.x - shot.camera.x) * t,
    y: shot.camera.y + (shot.cameraEnd.y - shot.camera.y) * t,
    zoom: shot.camera.zoom + (shot.cameraEnd.zoom - shot.camera.zoom) * t,
    rotation: shot.camera.rotation + (shot.cameraEnd.rotation - shot.camera.rotation) * t,
  };
};

const MINERAL_SPECS: Array<{ type: ChromaMineralType; chinese: string; latin: string }> = [
  { type: 'cinnabar', chinese: '朱砂', latin: 'Cinnabar' },
  { type: 'azurite', chinese: '石青', latin: 'Azurite' },
  { type: 'malachite', chinese: '石绿', latin: 'Malachite' },
  { type: 'ochre', chinese: '赭石', latin: 'Ochre' },
  { type: 'gold-leaf', chinese: '泥金', latin: 'Gold Leaf' },
];

const SEAL_CHARS = ['墨', '韻', '彩', '印', '雅', '聲', '石', '風', '書', '金'];
const OPENING_SEALS = ['游心', '汲古', '静观', '云水', '听雨', '悟真'];
const CORNER_SEALS = ['金石录', '长乐', '天趣', '墨缘', '枕流', '大观'];

/**
 * Checks whether text contains CJK characters (Chinese Hanzi, Japanese Kana, or Korean Hangul).
 * If false, the text is treated as Western / Latin script.
 */
export function isCjkText(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

/**
 * Determines whether line.wordSegments should be used to split a line into separate visual columns.
 *
 * In Folia Chroma:
 * - Each visual phrase becomes a distinct column in the handscroll / manuscript with camera tracking.
 * - For Western/Latin text: automated word segmenters break sentences into single words
 *   (e.g. ['We', 'follow', 'the', 'light', 'through', 'the', 'city']).
 *   Treating each word as a separate column causes the jarring defect of showing ONLY ONE WORD
 *   per screen! Single-word segments must NEVER be split into separate columns.
 *   Only multi-word clauses represent true visual phrases.
 * - For CJK text: automated word segmenters break sentences into tiny 1-2 char words
 *   (e.g. ['风', '把', '远方', '写成了', '诗']).
 *   In traditional Chinese calligraphy, an entire verse is written down a continuous vertical column.
 *   Only substantial phrase segments (averaging >= 3.0 characters, none < 2 chars)
 *   should form separate columns.
 */
export function shouldSplitBySegments(segments: string[] | undefined, _fullText: string, isCjk: boolean): boolean {
  if (!segments || segments.length <= 1) return false;

  const cleanSegments = segments.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
  if (cleanSegments.length <= 1) return false;

  if (!isCjk) {
    // For Latin / Western lyrics:
    // Only accept segmentation if it consists of multi-word phrases (clauses with spaces).
    // If every segment is just an isolated single word without spaces, reject it so the full
    // stanza is laid out cohesively on screen.
    const hasMultiWordSegment = cleanSegments.some(s => s.includes(' '));
    return hasMultiWordSegment;
  } else {
    // For CJK lyrics:
    // Raw word segmentation produces 1-2 character fragments.
    // Meaningful calligraphy columns require substantial length (average >= 3.0 chars, none < 2 chars).
    const totalChars = cleanSegments.reduce((sum, s) => sum + s.replace(/\s+/g, '').length, 0);
    const avgLen = totalChars / cleanSegments.length;
    const allSubstantial = cleanSegments.every(s => s.replace(/\s+/g, '').length >= 2);
    return avgLen >= 3.0 && allSubstantial;
  }
}

export function compileChromaShots(lines: Line[]): ChromaShot[] {
  const shots: ChromaShot[] = [];
  let totalColumnCounter = 0;

  lines.forEach((line, lineIndex) => {
    const allGlyphs = buildLineGraphemeTimeline(line);
    if (!allGlyphs.length) return;

    // Filter out slashes: slashes are purely phrase delimiters and do NOT count toward character count
    const cleanGlyphs = allGlyphs.filter(g => g.char !== '/');
    if (!cleanGlyphs.length) return;

    const text = line.fullText;
    const isCjk = isCjkText(text);
    let groups: string[] = [];

    if (text.includes('/')) {
      // User explicitly delimited phrases/columns with slashes
      groups = text.split('/').map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else if (shouldSplitBySegments(line.wordSegments, text, isCjk)) {
      groups = line.wordSegments!.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else {
      // Single continuous sentence / stanza without splitting into arbitrary single-word or tiny fragments
      groups = [text.replace(/\//g, '').trim()].filter(Boolean);
      if (!groups.length) groups = [text];
    }

    let cursor = 0;
    const phrasesInLine: { text: string; glyphs: ChromaGlyph[]; start: number; end: number }[] = [];
    for (const group of groups) {
      const cleanGroup = group.replace(/\//g, '');
      const groupChars = Array.from(cleanGroup);
      const timed: ChromaGlyph[] = [];
      let charIdx = 0;

      while (cursor < cleanGlyphs.length && charIdx < groupChars.length) {
        const g = cleanGlyphs[cursor++];
        if (g.char === groupChars[charIdx]) {
          timed.push({ ...g, indexInPhrase: timed.length });
          charIdx++;
        } else if (/^\s+$/.test(g.char) && groupChars[charIdx] !== ' ') {
          continue;
        } else {
          timed.push({ ...g, indexInPhrase: timed.length });
          charIdx++;
        }
      }

      if (timed.length > 0) {
        phrasesInLine.push({
          text: cleanGroup,
          glyphs: timed,
          start: timed[0].startTime,
          end: timed[timed.length - 1].endTime,
        });
      }
    }

    if (cursor < cleanGlyphs.length) {
      const remaining = cleanGlyphs.slice(cursor).filter(g => !/^\s+$/.test(g.char));
      if (remaining.length > 0) {
        const lastPhrase = phrasesInLine[phrasesInLine.length - 1];
        if (lastPhrase) {
          remaining.forEach(g => {
            lastPhrase.glyphs.push({ ...g, indexInPhrase: lastPhrase.glyphs.length });
            lastPhrase.text += g.char;
            lastPhrase.end = Math.max(lastPhrase.end, g.endTime);
          });
        }
      }
    }

    if (!phrasesInLine.length) return;

    // Exactly 1 shot per lyric line! Spanning smoothly to next line's start
    const shotStart = line.startTime;
    const nextLine = lines[lineIndex + 1];
    const shotEnd = nextLine ? nextLine.startTime : line.endTime + 4.0;
    const lineStartTime = line.startTime;
    const lineEndTime = line.endTime;
    const gap = nextLine ? nextLine.startTime - line.endTime : 4.0;
    const textHold = Math.min(1.8, Math.max(0.45, gap * 0.4));
    const exitStart = nextLine
      ? Math.min(line.endTime + textHold, nextLine.startTime - 0.38)
      : line.endTime + 1.6;

    let hero = 0;
    phrasesInLine.forEach((p, i) => {
      if (p.glyphs.length > phrasesInLine[hero].glyphs.length) {
        hero = i;
      }
    });

    const kinds: ChromaShotKind[] = ['duo-split', 'quad-split', 'thirds-stack', 'cinema-letterbox'];
    const kind = kinds[lineIndex % kinds.length];

    const enterStyles: ChromaEnterStyle[] = ['from-above', 'from-right', 'from-left', 'from-below', 'stamp'];
    const cardAngles = [-0.012, 0.01, -0.015, 0.012, -0.008, 0.014];
    const n = phrasesInLine.length;

    const startColForLine = totalColumnCounter;

    // Classical Chinese Literature Layout:
    // RIGHT TO LEFT (右起首行，向左推进)
    // TOP TO BOTTOM (每列从上至下)
    const phrases: ChromaPhrase[] = phrasesInLine.map((p, i) => {
      const globalColIndex = totalColumnCounter++;
      const isHero = i === hero;
      const role: 'hero' | 'support' | 'accent' = isHero ? 'hero' : 'support';

      let relX = 0.5;
      let relY = 0.5;
      let fontScale = 1.0;
      const enterStyle: ChromaEnterStyle = enterStyles[(i + lineIndex) % enterStyles.length];
      let tone: ChromaTone = 'contrast';
      const cardAngle = cardAngles[(lineIndex * 2 + i) % cardAngles.length];

      if (n === 1) {
        // Single continuous phrase: sits proudly in the center-right to unfold columns
        relX = 0.58;
        relY = 0.50;
        fontScale = 1.25;
        tone = 'accent';
      } else if (n === 2) {
        // First phrase on the RIGHT, second phrase to its LEFT!
        relX = i === 0 ? 0.68 : 0.42;
        relY = 0.50;
        fontScale = isHero ? 1.22 : 1.05;
        tone = isHero ? 'accent' : 'contrast';
      } else {
        // Multi-phrase: strictly Right to Left (0.74 -> 0.51 -> 0.28)
        const startX = 0.74;
        const endX = 0.28;
        relX = startX - (i / (n - 1)) * (startX - endX);
        relY = 0.50;
        fontScale = isHero ? 1.22 : 1.02;
        tone = isHero ? 'accent' : 'tint';
      }

      const paperSeed = (lineIndex * 137 + i * 89 + p.text.length * 17) % 9999 + 1;
      const paperRoughness = 1.8 + ((lineIndex + i) % 3) * 0.4;
      const mineralSpec = MINERAL_SPECS[(lineIndex + i) % MINERAL_SPECS.length];

      const hasTape = (i + lineIndex) % 2 === 0;
      const washiTape: ChromaWashiTape | undefined = hasTape
        ? {
            relX: 0,
            relY: -0.48,
            angle: (i % 2 === 0 ? -0.06 : 0.06) + cardAngle * 0.5,
            width: 36,
            height: 12,
          }
        : undefined;

      const hasSeal = isHero || i === n - 1;
      const sealChar = SEAL_CHARS[(lineIndex + i * 3) % SEAL_CHARS.length];
      const seal: ChromaSeal | undefined = hasSeal
        ? {
            text: sealChar,
            relX: 0,
            relY: 0.46,
            size: 22,
            shape: (lineIndex + i) % 2 === 0 ? 'square' : 'circle',
          }
        : undefined;

      return {
        text: p.text,
        glyphs: p.glyphs,
        start: p.start,
        end: p.end,
        role,
        relX,
        relY,
        fontScale,
        enterStyle,
        tone,
        cardAngle,
        paperSeed,
        paperRoughness,
        mineralType: mineralSpec.type,
        seal,
        washiTape,
        zOrder: isHero ? 10 : 5 + i,
        layoutDirection: 'vertical',
        globalColIndex,
      };
    });

    const endColForLine = Math.max(startColForLine, totalColumnCounter - 1);

    const flowAngle = 0.008 * (lineIndex % 2 === 0 ? 1 : -1);

    // Camera gently pans from right to left, following the writing brush as it unrolls the scroll!
    const camera: ChromaCameraKey = { x: 0.035, y: -0.01, zoom: 0.99, rotation: flowAngle * 0.4 };
    const cameraEnd: ChromaCameraKey = { x: -0.035, y: 0.015, zoom: 1.045, rotation: -flowAngle * 0.5 };

    // Mineral pigment swatch chips on the scroll border
    const chip1Spec = MINERAL_SPECS[lineIndex % MINERAL_SPECS.length];
    const chip2Spec = MINERAL_SPECS[(lineIndex + 2) % MINERAL_SPECS.length];
    const backdropChips: ChromaBackdropChip[] = [
      {
        relX: 0.14,
        relY: 0.22,
        width: 64,
        height: 44,
        angle: -0.03,
        mineral: chip1Spec.type,
        chineseName: chip1Spec.chinese,
        latinName: chip1Spec.latin,
      },
      {
        relX: 0.86,
        relY: 0.78,
        width: 68,
        height: 48,
        angle: 0.025,
        mineral: chip2Spec.type,
        chineseName: chip2Spec.chinese,
        latinName: chip2Spec.latin,
      },
    ];

    // Authentic Seal Trilogy (引首章、落款钤印、压角章)
    const openingText = OPENING_SEALS[lineIndex % OPENING_SEALS.length];
    const openingSeal: ChromaSeal = {
      text: openingText,
      relX: 0.88,
      relY: 0.16,
      size: 26,
      shape: 'circle',
    };

    const cornerText = CORNER_SEALS[lineIndex % CORNER_SEALS.length];
    const cornerSeal: ChromaSeal = {
      text: cornerText,
      relX: 0.12,
      relY: 0.84,
      size: 30,
      shape: 'square',
    };

    const sealChar = SEAL_CHARS[(lineIndex * 4) % SEAL_CHARS.length];
    const sealStamp: ChromaSeal = {
      text: sealChar,
      relX: 0.88,
      relY: 0.26,
      size: 26,
      shape: lineIndex % 2 === 0 ? 'square' : 'circle',
    };

    const editionPlate = `FOLIA CHROMA // 宣纸手卷 · 岁次乙巳卷 ${String(lineIndex + 1).padStart(2, '0')}`;

    // Monumental Hero Landmark Character
    let monumentalGlyph: ChromaMonumentalGlyph | undefined;
    const heroPhrase = phrasesInLine[hero];
    if (heroPhrase && heroPhrase.glyphs.length > 0) {
      const glyphIdx = Math.floor(heroPhrase.glyphs.length / 2);
      const chosenGlyph = heroPhrase.glyphs[glyphIdx] || heroPhrase.glyphs[0];
      const charMineral = MINERAL_SPECS[(lineIndex + hero) % MINERAL_SPECS.length].type;
      monumentalGlyph = {
        char: chosenGlyph.char,
        relX: 0.22,
        relY: 0.50,
        scale: 1.0,
        angle: -0.02 + flowAngle,
        startTime: chosenGlyph.startTime,
        endTime: chosenGlyph.endTime,
        mineral: charMineral,
      };
    }

    shots.push({
      id: `chroma-shot-${shots.length}`,
      lineIndex,
      start: shotStart,
      end: shotEnd,
      lineStartTime,
      lineEndTime,
      exitStart,
      kind,
      phrases,
      hero,
      flowAngle,
      camera,
      cameraEnd,
      backdropChips,
      sealStamp,
      openingSeal,
      cornerSeal,
      editionPlate,
      monumentalGlyph,
      globalStartCol: startColForLine,
      globalEndCol: endColForLine,
    });
  });

  return shots;
}
