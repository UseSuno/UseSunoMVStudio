import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline, type GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';

export type KyotoShotKind =
  | 'duo-split'
  | 'apex-monolith'
  | 'cinema-scope'
  | 'quad-matrix'
  | 'thrust-slash'
  | 'aperture-reticle'
  | 'tri-column'
  | 'corner-wedge'
  | 'kinetic-orbit'
  | 'vector-grid'
  | 'sonic-pulse'
  | 'speed-slash'
  | 'prism-capsule'
  | 'dynamic-matrix';

export type KyotoEnterDirection = 'from-top' | 'from-bottom' | 'from-left' | 'from-right' | 'stamp';

export interface KyotoGlyph extends GraphemeTiming {
  char: string;
  startTime: number;
  endTime: number;
  indexInPhrase: number;
}

export interface KyotoPhrase {
  text: string;
  glyphs: KyotoGlyph[];
  start: number;
  end: number;
  role: 'hero' | 'support' | 'accent';
  orientation: 'vertical' | 'horizontal';
  relX: number;
  relY: number;
  fontScale: number;
  enterDirection: KyotoEnterDirection;
  align?: 'left' | 'center' | 'right';
  tilt?: number;
}

export interface KyotoCameraKey {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface KyotoSeal {
  text: string;
  shape: 'square' | 'circle';
  style: 'zhuwen' | 'baiwen';
  relX: number;
  relY: number;
  size: number;
}

export interface KyotoColorPlate {
  relX: number;
  relY: number;
  relW: number;
  relH: number;
  style: 'accent' | 'contrast' | 'tint';
  angle: number;
}

export interface KyotoMgReticle {
  relX: number;
  relY: number;
  radius: number;
  speed: number;
  arms: number;
}

export interface KyotoGeometricMass {
  id: string;
  type: 'rect' | 'polygon' | 'annular';
  // Rel coordinates [0..1]
  x: number;
  y: number;
  w: number;
  h: number;
  // For polygon: relative vertices [[x1, y1], [x2, y2], ...]
  points?: [number, number][];
  // For annular: inner & outer radius, start & end angle
  innerR?: number;
  outerR?: number;
  startAngle?: number;
  endAngle?: number;
  enterDX: number;
  enterDY: number;
  delay: number;
  span: number;
  colorRole: 'contrast' | 'accent' | 'tint' | 'primary';
  alpha: number;
  edgeBorder?: boolean;
}

export interface KyotoSurveyTick {
  relX: number;
  relY: number;
  length: number;
  horizontal: boolean;
}

export interface KyotoShot {
  id: string;
  lineIndex: number;
  start: number;
  end: number;
  lineStartTime: number;
  lineEndTime: number;
  exitStart: number;
  kind: KyotoShotKind;
  phrases: KyotoPhrase[];
  hero: number;
  flowAngle: number;
  camera: KyotoCameraKey;
  cameraEnd: KyotoCameraKey;
  seal?: KyotoSeal;
  posterSerial: string;
  chapterBadge: string;
  heroGrapheme?: string;
  colorPlate?: KyotoColorPlate;
  mgReticles: KyotoMgReticle[];
  geometricMasses: KyotoGeometricMass[];
  surveyTicks: KyotoSurveyTick[];
  watermarkChar: string;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const easeExpoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeSoftBack = (t: number) => {
  const c1 = 1.45;
  const c3 = c1 + 1;
  const p = clamp01(t);
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export const easeInOutCubic = (t: number) => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

/**
 * Single-shot intra-frame camera motion.
 */
export const resolveKyotoCameraFrame = (shot: KyotoShot, time: number): KyotoCameraKey => {
  const duration = Math.max(shot.end - shot.start, 0.001);
  const rawProgress = (time - shot.start) / duration;
  const clamped = clamp01(rawProgress);
  const eased = clamped * 0.50 + easeInOutCubic(clamped) * 0.50;
  const overshoot = Math.max(0, rawProgress - 1) * 0.10;
  const t = eased + overshoot;

  return {
    x: shot.camera.x + (shot.cameraEnd.x - shot.camera.x) * t,
    y: shot.camera.y + (shot.cameraEnd.y - shot.camera.y) * t,
    zoom: shot.camera.zoom + (shot.cameraEnd.zoom - shot.camera.zoom) * t,
    rotation: shot.camera.rotation + (shot.cameraEnd.rotation - shot.camera.rotation) * t,
  };
};

/**
 * True Continuous Panoramic Camera Cruise across all shots in the song.
 */
export const resolveContinuousKyotoCamera = (shots: KyotoShot[], time: number): KyotoCameraKey => {
  if (!shots.length) return { x: 0, y: 0, zoom: 1, rotation: 0 };
  if (shots.length === 1) return resolveKyotoCameraFrame(shots[0], time);

  let shotIdx = 0;
  for (let i = shots.length - 1; i >= 0; i--) {
    if (time >= shots[i].start) {
      shotIdx = i;
      break;
    }
  }

  const current = shots[shotIdx];
  const next = shots[shotIdx + 1];

  if (next && time >= current.exitStart) {
    const transSpan = Math.max(0.24, next.start - current.exitStart + 0.35);
    const t = clamp01((time - current.exitStart) / transSpan);
    const eased = easeInOutCubic(t);
    return {
      x: current.cameraEnd.x + (next.camera.x - current.cameraEnd.x) * eased,
      y: current.cameraEnd.y + (next.camera.y - current.cameraEnd.y) * eased,
      zoom: current.cameraEnd.zoom + (next.camera.zoom - current.cameraEnd.zoom) * eased,
      rotation: current.cameraEnd.rotation + (next.camera.rotation - current.cameraEnd.rotation) * eased,
    };
  }

  return resolveKyotoCameraFrame(current, time);
};

/**
 * Checks whether text contains CJK characters.
 */
export function isCjkText(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

export interface KyotoWord {
  text: string;
  startTime: number;
  endTime: number;
  glyphs: KyotoGlyph[];
}

/**
 * Groups raw character-level glyphs into cohesive whole-word tokens with timings for Western/Latin text.
 */
export function groupKyotoGlyphsIntoWords(glyphs: KyotoGlyph[]): KyotoWord[] {
  const words: KyotoWord[] = [];
  let curGlyphs: KyotoGlyph[] = [];
  let curText = '';

  for (const g of glyphs) {
    if (/^\s+$/.test(g.char)) {
      if (curGlyphs.length > 0) {
        words.push({
          text: curText,
          startTime: curGlyphs[0].startTime,
          endTime: curGlyphs[curGlyphs.length - 1].endTime,
          glyphs: curGlyphs,
        });
        curGlyphs = [];
        curText = '';
      }
    } else {
      curGlyphs.push(g);
      curText += g.char;
    }
  }

  if (curGlyphs.length > 0) {
    words.push({
      text: curText,
      startTime: curGlyphs[0].startTime,
      endTime: curGlyphs[curGlyphs.length - 1].endTime,
      glyphs: curGlyphs,
    });
  }

  return words;
}

/**
 * Determines whether line.wordSegments should be used to split a line into separate visual phrases.
 */
export function shouldSplitBySegments(segments: string[] | undefined, isCjk: boolean): boolean {
  if (!segments || segments.length <= 1) return false;
  const cleanSegments = segments.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
  if (cleanSegments.length <= 1) return false;

  if (!isCjk) {
    return cleanSegments.some(s => s.includes(' '));
  } else {
    const totalChars = cleanSegments.reduce((sum, s) => sum + s.replace(/\s+/g, '').length, 0);
    const avgLen = totalChars / cleanSegments.length;
    const allSubstantial = cleanSegments.every(s => s.replace(/\s+/g, '').length >= 2);
    return avgLen >= 3.0 && allSubstantial;
  }
}

const SEAL_CHARS = ['速', '律', '力', '光', '翼', '弦', '动', '极', '波', '潮', '拍', '响'];
const CHAPTER_BADGES = [
  'MG ARCHETYPE // 01 · DUO SPLIT',
  'MG ARCHETYPE // 02 · MONOLITH SLAB',
  'MG ARCHETYPE // 03 · CINEMA SCOPE',
  'MG ARCHETYPE // 04 · QUAD MATRIX',
  'MG ARCHETYPE // 05 · THRUST SLASH',
  'MG ARCHETYPE // 06 · APERTURE RETICLE',
  'MG ARCHETYPE // 07 · TRI COLUMN',
  'MG ARCHETYPE // 08 · CORNER WEDGE',
];

export function extractHeroGrapheme(phrase: KyotoPhrase, isCjk: boolean): string {
  if (!isCjk) {
    const words = phrase.text.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const sorted = [...words].sort((a, b) => b.length - a.length);
    return sorted[0].toUpperCase();
  }

  const particles = new Set(['的', '了', '在', '之', '着', '与', '于', '从', '向', '中', '个', '被', '让', '给', '得', '地', '呢', '吧', '啊', '吗', '呀', 'は', 'の', 'を', 'に', 'へ', 'と', 'が', 'で']);
  const candidates = phrase.glyphs.filter(g => !particles.has(g.char) && !/^\s+$/.test(g.char) && !/[，。！？、…—]/.test(g.char));
  if (candidates.length > 0) {
    let best = candidates[0];
    let maxDur = best.endTime - best.startTime;
    for (const c of candidates) {
      const dur = c.endTime - c.startTime;
      if (dur > maxDur) {
        maxDur = dur;
        best = c;
      }
    }
    return best.char;
  }
  return phrase.glyphs[0]?.char || '';
}

/**
 * Builds geometric composition masses, survey ticks, and positioning for each archetype.
 */
function buildArchetypeComposition(
  kind: KyotoShotKind,
  phrasesInLine: { text: string; glyphs: KyotoGlyph[]; start: number; end: number }[],
  heroIdx: number,
  _lineIndex: number
): {
  phrases: KyotoPhrase[];
  geometricMasses: KyotoGeometricMass[];
  surveyTicks: KyotoSurveyTick[];
  mgReticles: KyotoMgReticle[];
} {
  const n = phrasesInLine.length;
  const masses: KyotoGeometricMass[] = [];
  const ticks: KyotoSurveyTick[] = [];
  const reticles: KyotoMgReticle[] = [];

  // Build distinct, dynamic phrase positioning based on archetype
  const phrases: KyotoPhrase[] = phrasesInLine.map((p, i) => {
    const isHero = i === heroIdx;
    const role: 'hero' | 'support' | 'accent' = isHero ? 'hero' : 'support';
    const orientation: 'vertical' | 'horizontal' = 'horizontal';
    let relX = 0.50;
    let relY = 0.50;
    let fontScale = isHero ? 1.35 : 1.0;
    let align: 'left' | 'center' | 'right' = 'center';
    let tilt = 0;
    let enterDirection: KyotoEnterDirection = 'from-bottom';

    switch (kind) {
      case 'apex-monolith': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.48 : 0.52;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-left' : 'from-right';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.025 : 0.025);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-left';
        }
        break;
      }

      case 'cinema-scope': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.34;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.48 : 0.52;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-top' : 'from-bottom';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.025 : 0.025);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-bottom';
        }
        break;
      }

      case 'thrust-slash': {
        tilt = -0.015;
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-right';
        } else if (n === 2) {
          relX = i === 0 ? 0.48 : 0.52;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-left' : 'from-right';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.025 : 0.025);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-right';
        }
        break;
      }

      case 'corner-wedge': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.48 : 0.52;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-left' : 'from-right';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.025 : 0.025);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-left';
        }
        break;
      }

      case 'quad-matrix': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.47 : 0.53;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-top' : 'from-bottom';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.028 : 0.028);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-bottom';
        }
        break;
      }

      case 'tri-column': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.47 : 0.53;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = 'from-bottom';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.028 : 0.028);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-bottom';
        }
        break;
      }

      case 'aperture-reticle': {
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-right';
        } else if (n === 2) {
          relX = i === 0 ? 0.48 : 0.52;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = 'from-right';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.025 : 0.025);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-right';
        }
        break;
      }

      case 'duo-split':
      default: {
        // Classic bold split
        if (n === 1) {
          relX = 0.50;
          relY = 0.50;
          align = 'center';
          fontScale = 1.35;
          enterDirection = 'from-bottom';
        } else if (n === 2) {
          relX = i === 0 ? 0.47 : 0.53;
          relY = i === 0 ? 0.44 : 0.56;
          align = 'center';
          fontScale = 1.18;
          enterDirection = i === 0 ? 'from-left' : 'from-right';
        } else {
          const stepY = Math.min(0.14, 0.42 / Math.max(1, n));
          relX = 0.50 + (i % 2 === 0 ? -0.028 : 0.028);
          relY = 0.50 + (i - (n - 1) / 2) * stepY;
          align = 'center';
          fontScale = 1.05;
          enterDirection = 'from-bottom';
        }
        break;
      }
    }

    return {
      text: p.text,
      glyphs: p.glyphs,
      start: p.start,
      end: p.end,
      role,
      orientation,
      relX,
      relY,
      fontScale,
      enterDirection,
      align,
      tilt,
    };
  });

  // Assemble Architectural Masses & Technical Linework per Archetype
  switch (kind) {
    case 'apex-monolith': {
      // 1. Towering monolithic slab on left
      masses.push({
        id: 'monolith-slab',
        type: 'rect',
        x: -0.05,
        y: 0.10,
        w: 0.50,
        h: 0.80,
        enterDX: -0.25,
        enterDY: 0,
        delay: 0.02,
        span: 0.45,
        colorRole: 'contrast',
        alpha: 0.92,
        edgeBorder: true,
      });
      // 2. Secondary accent horizontal runner
      masses.push({
        id: 'monolith-accent-runner',
        type: 'rect',
        x: 0.42,
        y: 0.48,
        w: 0.60,
        h: 0.05,
        enterDX: 0.30,
        enterDY: 0,
        delay: 0.12,
        span: 0.40,
        colorRole: 'accent',
        alpha: 0.88,
      });
      // Metric ticks along monolith seam
      for (let t = 0; t < 12; t++) {
        ticks.push({
          relX: 0.45,
          relY: 0.15 + t * 0.06,
          length: t % 3 === 0 ? 14 : 7,
          horizontal: true,
        });
      }
      reticles.push({
        relX: 0.82,
        relY: 0.28,
        radius: 28,
        speed: 1.4,
        arms: 4,
      });
      break;
    }

    case 'cinema-scope': {
      // Top Letterbox Mass
      masses.push({
        id: 'letterbox-top',
        type: 'rect',
        x: -0.05,
        y: -0.05,
        w: 1.10,
        h: 0.20,
        enterDX: 0,
        enterDY: -0.15,
        delay: 0.0,
        span: 0.40,
        colorRole: 'contrast',
        alpha: 0.94,
        edgeBorder: true,
      });
      // Bottom Letterbox Mass
      masses.push({
        id: 'letterbox-bottom',
        type: 'rect',
        x: -0.05,
        y: 0.85,
        w: 1.10,
        h: 0.20,
        enterDX: 0,
        enterDY: 0.15,
        delay: 0.05,
        span: 0.40,
        colorRole: 'contrast',
        alpha: 0.94,
        edgeBorder: true,
      });
      // Center Velocity Guide Rail Accent
      masses.push({
        id: 'rail-accent',
        type: 'rect',
        x: 0.10,
        y: 0.65,
        w: 0.80,
        h: 0.008,
        enterDX: 0.20,
        enterDY: 0,
        delay: 0.10,
        span: 0.45,
        colorRole: 'accent',
        alpha: 0.90,
      });
      for (let t = 0; t < 16; t++) {
        ticks.push({
          relX: 0.12 + t * 0.05,
          relY: 0.15,
          length: t % 4 === 0 ? 12 : 6,
          horizontal: false,
        });
      }
      reticles.push({
        relX: 0.15,
        relY: 0.50,
        radius: 22,
        speed: -1.2,
        arms: 3,
      });
      break;
    }

    case 'thrust-slash': {
      // Dramatic angled polygon cutting diagonally
      masses.push({
        id: 'slash-polygon',
        type: 'polygon',
        x: 0.20,
        y: -0.10,
        w: 0.65,
        h: 1.20,
        points: [
          [0.35, -0.10],
          [0.85, -0.10],
          [0.65, 1.10],
          [0.15, 1.10],
        ],
        enterDX: 0.25,
        enterDY: -0.25,
        delay: 0.02,
        span: 0.42,
        colorRole: 'contrast',
        alpha: 0.90,
        edgeBorder: true,
      });
      // Accent slice blade
      masses.push({
        id: 'slash-accent-blade',
        type: 'polygon',
        x: 0.15,
        y: -0.10,
        w: 0.05,
        h: 1.20,
        points: [
          [0.32, -0.10],
          [0.36, -0.10],
          [0.16, 1.10],
          [0.12, 1.10],
        ],
        enterDX: -0.20,
        enterDY: 0.20,
        delay: 0.08,
        span: 0.45,
        colorRole: 'accent',
        alpha: 0.95,
      });
      reticles.push({
        relX: 0.82,
        relY: 0.72,
        radius: 24,
        speed: 1.8,
        arms: 4,
      });
      break;
    }

    case 'quad-matrix': {
      // 4 Quadrants with alternating contrast
      masses.push({
        id: 'quad-top-left',
        type: 'rect',
        x: -0.05,
        y: -0.05,
        w: 0.55,
        h: 0.55,
        enterDX: -0.15,
        enterDY: -0.15,
        delay: 0.02,
        span: 0.40,
        colorRole: 'contrast',
        alpha: 0.92,
      });
      masses.push({
        id: 'quad-bottom-right',
        type: 'rect',
        x: 0.50,
        y: 0.50,
        w: 0.55,
        h: 0.55,
        enterDX: 0.15,
        enterDY: 0.15,
        delay: 0.06,
        span: 0.40,
        colorRole: 'contrast',
        alpha: 0.92,
      });
      masses.push({
        id: 'quad-center-accent',
        type: 'rect',
        x: 0.48,
        y: 0.48,
        w: 0.04,
        h: 0.04,
        enterDX: 0,
        enterDY: 0,
        delay: 0.15,
        span: 0.35,
        colorRole: 'accent',
        alpha: 1.0,
      });
      reticles.push({
        relX: 0.50,
        relY: 0.50,
        radius: 34,
        speed: 1.0,
        arms: 4,
      });
      break;
    }

    case 'tri-column': {
      // 3 Architectural Columns rising
      const colWidths = [0.18, 0.28, 0.22];
      const colStarts = [0.10, 0.36, 0.70];
      const colHeights = [0.65, 0.85, 0.72];
      const roles: ('contrast' | 'accent' | 'tint')[] = ['contrast', 'contrast', 'tint'];

      for (let c = 0; c < 3; c++) {
        masses.push({
          id: `column-${c}`,
          type: 'rect',
          x: colStarts[c],
          y: 1.0 - colHeights[c],
          w: colWidths[c],
          h: colHeights[c] + 0.1,
          enterDX: 0,
          enterDY: 0.25,
          delay: 0.03 + c * 0.05,
          span: 0.45,
          colorRole: roles[c],
          alpha: c === 1 ? 0.95 : 0.80,
          edgeBorder: true,
        });
      }
      reticles.push({
        relX: 0.85,
        relY: 0.25,
        radius: 20,
        speed: -1.5,
        arms: 3,
      });
      break;
    }

    case 'corner-wedge': {
      // Massive wedge cutting in from corner
      masses.push({
        id: 'corner-wedge-mass',
        type: 'polygon',
        x: 0.40,
        y: -0.10,
        w: 0.70,
        h: 0.75,
        points: [
          [1.10, -0.10],
          [0.35, -0.10],
          [1.10, 0.75],
        ],
        enterDX: 0.25,
        enterDY: -0.25,
        delay: 0.02,
        span: 0.45,
        colorRole: 'contrast',
        alpha: 0.94,
        edgeBorder: true,
      });
      masses.push({
        id: 'corner-accent-strap',
        type: 'rect',
        x: 0.05,
        y: 0.75,
        w: 0.45,
        h: 0.035,
        enterDX: -0.20,
        enterDY: 0,
        delay: 0.10,
        span: 0.40,
        colorRole: 'accent',
        alpha: 0.90,
      });
      reticles.push({
        relX: 0.22,
        relY: 0.35,
        radius: 26,
        speed: 1.3,
        arms: 4,
      });
      break;
    }

    case 'aperture-reticle': {
      // Annular Sector Ring Mass
      masses.push({
        id: 'aperture-ring-mass',
        type: 'annular',
        x: 0.28,
        y: 0.50,
        w: 0.50,
        h: 0.50,
        innerR: 0.12,
        outerR: 0.26,
        startAngle: 0,
        endAngle: Math.PI * 2,
        enterDX: -0.15,
        enterDY: 0,
        delay: 0.02,
        span: 0.48,
        colorRole: 'contrast',
        alpha: 0.90,
        edgeBorder: true,
      });
      masses.push({
        id: 'aperture-cross-bar',
        type: 'rect',
        x: 0.05,
        y: 0.495,
        w: 0.90,
        h: 0.01,
        enterDX: 0.30,
        enterDY: 0,
        delay: 0.08,
        span: 0.42,
        colorRole: 'accent',
        alpha: 0.85,
      });
      reticles.push({
        relX: 0.28,
        relY: 0.50,
        radius: 46,
        speed: 0.8,
        arms: 6,
      });
      break;
    }

    case 'duo-split':
    default: {
      // Upper / Left Mass
      masses.push({
        id: 'duo-mass-primary',
        type: 'rect',
        x: -0.05,
        y: -0.05,
        w: 1.10,
        h: 0.55,
        enterDX: -0.20,
        enterDY: 0,
        delay: 0.02,
        span: 0.42,
        colorRole: 'contrast',
        alpha: 0.94,
        edgeBorder: true,
      });
      // Lower accent divider seam
      masses.push({
        id: 'duo-seam-accent',
        type: 'rect',
        x: -0.05,
        y: 0.495,
        w: 1.10,
        h: 0.015,
        enterDX: 0.35,
        enterDY: 0,
        delay: 0.08,
        span: 0.40,
        colorRole: 'accent',
        alpha: 0.95,
      });
      // Survey Ticks along the seam
      for (let t = 0; t < 20; t++) {
        ticks.push({
          relX: 0.05 + t * 0.048,
          relY: 0.50,
          length: t % 5 === 0 ? 14 : 7,
          horizontal: false,
        });
      }
      reticles.push({
        relX: 0.84,
        relY: 0.24,
        radius: 25,
        speed: 1.2,
        arms: 4,
      });
      reticles.push({
        relX: 0.16,
        relY: 0.76,
        radius: 18,
        speed: -1.6,
        arms: 3,
      });
      break;
    }
  }

  return { phrases, geometricMasses: masses, surveyTicks: ticks, mgReticles: reticles };
}

export function compileKyotoShots(lines: Line[]): KyotoShot[] {
  const shots: KyotoShot[] = [];

  lines.forEach((line, lineIndex) => {
    const allGlyphs = buildLineGraphemeTimeline(line);
    if (!allGlyphs.length) return;

    const cleanGlyphs = allGlyphs.filter(g => g.char !== '/');
    if (!cleanGlyphs.length) return;

    const text = line.fullText;
    const isCjk = isCjkText(text);
    let groups: string[] = [];

    if (text.includes('/')) {
      groups = text.split('/').map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else if (shouldSplitBySegments(line.wordSegments, isCjk)) {
      groups = line.wordSegments!.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else {
      groups = [text.replace(/\//g, '').trim()].filter(Boolean);
      if (!groups.length) groups = [text];
    }

    let cursor = 0;
    const phrasesInLine: { text: string; glyphs: KyotoGlyph[]; start: number; end: number }[] = [];
    for (const group of groups) {
      const cleanGroup = group.replace(/\//g, '');
      const groupChars = Array.from(cleanGroup);
      const timed: KyotoGlyph[] = [];
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

    const archetypes: KyotoShotKind[] = [
      'duo-split',
      'apex-monolith',
      'cinema-scope',
      'quad-matrix',
      'thrust-slash',
      'aperture-reticle',
      'tri-column',
      'corner-wedge',
    ];

    const chosenKind = archetypes[lineIndex % archetypes.length];

    // Build composition: phrases, masses, ticks, reticles
    const composition = buildArchetypeComposition(chosenKind, phrasesInLine, hero, lineIndex);

    const flowAngles = [-0.006, 0.005, -0.007, 0.006, -0.005, 0.007];
    const flowAngle = flowAngles[lineIndex % flowAngles.length];

    const camera: KyotoCameraKey = {
      x: (lineIndex % 2 === 0 ? -0.02 : 0.02),
      y: (lineIndex % 3 === 0 ? 0.012 : -0.012),
      zoom: 0.99,
      rotation: flowAngle * 0.4,
    };
    const cameraEnd: KyotoCameraKey = {
      x: (lineIndex % 2 === 0 ? 0.02 : -0.02),
      y: (lineIndex % 3 === 0 ? -0.012 : 0.012),
      zoom: 1.04,
      rotation: flowAngle * 0.8,
    };

    const sealChar = SEAL_CHARS[(lineIndex * 3 + hero) % SEAL_CHARS.length];
    const heroPhrase = composition.phrases[hero];
    const seal: KyotoSeal = {
      text: sealChar,
      shape: (lineIndex + hero) % 2 === 0 ? 'square' : 'circle',
      style: lineIndex % 3 === 0 ? 'baiwen' : 'zhuwen',
      relX: Math.max(0.12, (heroPhrase?.relX ?? 0.5) - 0.28),
      relY: (heroPhrase?.relY ?? 0.5),
      size: 26,
    };

    const posterSerial = `KYOTO // TYPE 019 · VOL.${String(lineIndex + 1).padStart(2, '0')}`;
    const chapterBadge = CHAPTER_BADGES[lineIndex % CHAPTER_BADGES.length];
    const heroGrapheme = extractHeroGrapheme(heroPhrase, isCjk);
    const watermarkChar = heroGrapheme || (isCjk ? '律' : 'MG');

    const colorPlate: KyotoColorPlate = {
      relX: heroPhrase.relX,
      relY: heroPhrase.relY,
      relW: 0.70,
      relH: 0.22,
      style: 'accent',
      angle: (lineIndex % 2 === 0 ? 0.012 : -0.012),
    };

    shots.push({
      id: `kyoto-shot-${shots.length}`,
      lineIndex,
      start: shotStart,
      end: shotEnd,
      lineStartTime,
      lineEndTime,
      exitStart,
      kind: chosenKind,
      phrases: composition.phrases,
      hero,
      flowAngle,
      camera,
      cameraEnd,
      seal,
      posterSerial,
      chapterBadge,
      heroGrapheme,
      colorPlate,
      mgReticles: composition.mgReticles,
      geometricMasses: composition.geometricMasses,
      surveyTicks: composition.surveyTicks,
      watermarkChar,
    });
  });

  return shots;
}
