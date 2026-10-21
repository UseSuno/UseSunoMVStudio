import { useEffect, useMemo, useRef } from 'react';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import VisualizerShell from '../vendor/folia/components/visualizer/VisualizerShell';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../vendor/folia/utils/fontStacks';
import {
  compileSyzygyDirectorShots,
  clamp01,
  easeInOutCubic,
  easeExpoOut,
  resolveSyzygyCameraFrame,
  type SyzygyDirectorShot,
  type SyzygyPhrase,
} from './director';
import {
  easeTemperaInOut,
} from '../vendor/folia/components/visualizer/tempera/temperaMotionEasing';

interface ResolvedGlyphLayout {
  char: string;
  startTime: number;
  endTime: number;
  indexInPhrase: number;
  localX: number;
  localY: number;
  fontSize: number;
  rotation?: number;
  isHero: boolean;
}

interface ResolvedPhraseLayout {
  fontSize: number;
  cardW: number;
  cardH: number;
  glyphs: ResolvedGlyphLayout[];
  mode: 'horizontal' | 'vertical' | 'multiline';
}

function syzygyHash01(seed: number, index: number, salt: number = 0): number {
  const n = Math.sin(seed * 12.9898 + index * 78.233 + salt * 43.1415) * 43758.5453;
  return n - Math.floor(n);
}

interface NormalizedPoint {
  dx: number;
  dy: number;
}

const glyphStrokePointsCache = new Map<string, NormalizedPoint[]>();

function getGlyphStrokePoints(
  char: string,
  fontFamily: string,
  fontWeight: string | number,
): NormalizedPoint[] {
  const cacheKey = `${char}:${fontFamily}:${fontWeight}`;
  const cached = glyphStrokePointsCache.get(cacheKey);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const fallback: NormalizedPoint[] = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      fallback.push({ dx: Math.cos(a) * 0.32, dy: Math.sin(a) * 0.32 });
    }
    glyphStrokePointsCache.set(cacheKey, fallback);
    return fallback;
  }

  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const fallback: NormalizedPoint[] = [];
    glyphStrokePointsCache.set(cacheKey, fallback);
    return fallback;
  }

  ctx.clearRect(0, 0, size, size);
  ctx.font = `${fontWeight} 44px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(char, size / 2, size / 2);

  let data: Uint8ClampedArray | null = null;
  try {
    const imgData = ctx.getImageData(0, 0, size, size);
    data = imgData.data;
  } catch {
    data = null;
  }

  const rawPoints: NormalizedPoint[] = [];
  if (data) {
    const step = 2;
    for (let y = 4; y < size - 4; y += step) {
      for (let x = 4; x < size - 4; x += step) {
        const alphaIndex = (y * size + x) * 4 + 3;
        if (data[alphaIndex] > 90) {
          rawPoints.push({
            dx: (x - size / 2) / 44,
            dy: (y - size / 2) / 44,
          });
        }
      }
    }
  }

  // Uniformly subsample to exactly 38 points per glyph for consistent density and 60fps performance
  const targetCount = 38;
  let finalPoints: NormalizedPoint[] = [];
  if (rawPoints.length > targetCount) {
    const stride = rawPoints.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      finalPoints.push(rawPoints[Math.floor(i * stride)]);
    }
  } else if (rawPoints.length > 0) {
    finalPoints = rawPoints;
  } else {
    // Fallback if whitespace, punctuation, or canvas read issue
    for (let i = 0; i < targetCount; i++) {
      const a = (i / targetCount) * Math.PI * 2;
      const r = 0.28 + (i % 2 === 0 ? 0.06 : -0.06);
      finalPoints.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
    }
  }

  glyphStrokePointsCache.set(cacheKey, finalPoints);
  return finalPoints;
}

function computeHorizontalLayout(
  phrase: SyzygyPhrase,
  maxCardW: number,
  targetBaseH: number,
  lyricsFontScale: number,
  baseFontWeight: number | string,
  baseFontFamily: string,
  ctx: CanvasRenderingContext2D,
  seed = 101,
): ResolvedPhraseLayout {
  const totalChars = Math.max(1, phrase.glyphs.length);
  const heroCharIdx = Math.floor(syzygyHash01(seed, 1, 19) * totalChars) % totalChars;

  let baseFontSize = Math.min(
    maxCardW / (totalChars * 1.15),
    targetBaseH * 1.25,
    135,
  ) * phrase.fontScale * lyricsFontScale;
  baseFontSize = Math.max(20, baseFontSize);

  let tracking = Math.max(4, Math.round(baseFontSize * (phrase.pvArchetype === 'monolith-banner' ? 0.18 : 0.10)));
  ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;
  let charWidths = phrase.glyphs.map(g => ctx.measureText(g.char).width);
  let phraseW = charWidths.reduce((a, b) => a + b, 0) + Math.max(0, phrase.glyphs.length - 1) * tracking;
  let padX = baseFontSize * 0.40;
  let padY = baseFontSize * 0.35;
  let cardW = phraseW + padX * 2;
  let cardH = baseFontSize + padY * 2;

  if (cardW > maxCardW) {
    const fit = maxCardW / cardW;
    baseFontSize = Math.max(16, Math.floor(baseFontSize * fit));
    tracking = Math.max(3, Math.round(baseFontSize * (phrase.pvArchetype === 'monolith-banner' ? 0.16 : 0.09)));
    ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;
    charWidths = phrase.glyphs.map(g => ctx.measureText(g.char).width);
    phraseW = charWidths.reduce((a, b) => a + b, 0) + Math.max(0, phrase.glyphs.length - 1) * tracking;
    cardW = maxCardW;
  }

  const glyphs: ResolvedGlyphLayout[] = [];
  ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;
  let curX = -phraseW / 2;

  phrase.glyphs.forEach((g, idx) => {
    const gw = charWidths[idx];
    glyphs.push({
      char: g.char,
      startTime: g.startTime,
      endTime: g.endTime,
      indexInPhrase: g.indexInPhrase,
      localX: curX + gw / 2,
      localY: 0,
      fontSize: baseFontSize,
      rotation: 0,
      isHero: idx === heroCharIdx || phrase.role === 'hero',
    });
    curX += gw + tracking;
  });

  return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'horizontal' };
}

function computeSyzygyPhraseLayout(
  phrase: SyzygyPhrase,
  safeW: number,
  safeH: number,
  targetBaseH: number,
  lyricsFontScale: number,
  baseFontWeight: number | string,
  baseFontFamily: string,
  ctx: CanvasRenderingContext2D,
  seed = 101,
): ResolvedPhraseLayout {
  const mode = phrase.layoutDirection || 'horizontal';
  const totalChars = Math.max(1, phrase.glyphs.length);
  const maxCardW = safeW * 0.92;
  const heroCharIdx = Math.floor(syzygyHash01(seed, 1, 19) * totalChars) % totalChars;

  // -------------------------------------------------------------
  // 1. Staircase Cascade (阶梯瀑布流错落排版 - 保证各阶字间零重叠)
  // -------------------------------------------------------------
  if (phrase.pvArchetype === 'staircase-cascade') {
    const dir = syzygyHash01(seed, 2, 23) > 0.5 ? 1 : -1;
    const maxStairW = maxCardW * 0.88;
    const maxStairH = safeH * 0.78;
    let baseFontSize = Math.min(
      maxStairW / Math.max(1, (totalChars - 1) * 1.15 + 1.2),
      maxStairH / Math.max(1, (totalChars - 1) * 0.60 + 1.2),
      85,
    ) * phrase.fontScale * lyricsFontScale;
    baseFontSize = Math.max(18, Math.floor(baseFontSize));

    const stepX = dir * Math.round(baseFontSize * 1.15);
    const stepY = Math.round(baseFontSize * 0.60);

    const glyphs: ResolvedGlyphLayout[] = [];
    const midIdx = (totalChars - 1) / 2;

    phrase.glyphs.forEach((g, idx) => {
      glyphs.push({
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: (idx - midIdx) * stepX,
        localY: (idx - midIdx) * stepY,
        fontSize: baseFontSize,
        rotation: 0,
        isHero: idx === heroCharIdx || phrase.role === 'hero',
      });
    });

    const cardW = Math.abs(stepX) * (totalChars - 1) + baseFontSize * 1.4;
    const cardH = stepY * (totalChars - 1) + baseFontSize * 1.4;

    return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'multiline' };
  }

  // -------------------------------------------------------------
  // 2. Orbital Gravitational Arc (引力弯曲星轨弧形 - 弧线等距严防堆叠)
  // -------------------------------------------------------------
  if (phrase.pvArchetype === 'orbital-arc') {
    const arcRadius = Math.max(safeW * 0.35, safeH * 0.44);
    const maxArcLen = arcRadius * (Math.PI * 0.55);
    let baseFontSize = Math.min(
      safeW * 0.14,
      safeH * 0.20,
      maxArcLen / Math.max(1, (totalChars - 1) * 1.20 + 1.0),
      90,
    ) * phrase.fontScale * lyricsFontScale;
    baseFontSize = Math.max(18, Math.floor(baseFontSize));

    const arcSpan = Math.min(
      Math.PI * 0.55,
      Math.max(0.28, (Math.max(1, totalChars - 1) * (baseFontSize * 1.20)) / arcRadius)
    );
    const arcInvert = syzygyHash01(seed, 3, 29) > 0.5;

    const glyphs: ResolvedGlyphLayout[] = [];

    phrase.glyphs.forEach((g, idx) => {
      const a = totalChars === 1 ? 0 : -arcSpan / 2 + (idx / (totalChars - 1)) * arcSpan;
      const arcY = (arcInvert ? -1 : 1) * (arcRadius * (1 - Math.cos(a)) * 0.70 - baseFontSize * 0.35);

      glyphs.push({
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: arcRadius * Math.sin(a),
        localY: arcY,
        fontSize: baseFontSize,
        rotation: a * (arcInvert ? 0.75 : -0.75),
        isHero: idx === heroCharIdx || phrase.role === 'hero',
      });
    });

    const cardW = Math.sin(arcSpan / 2) * arcRadius * 2 + baseFontSize * 1.6;
    const cardH = baseFontSize * 2.4;

    return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'horizontal' };
  }

  // -------------------------------------------------------------
  // 3. Diagonal Stagger (极向对角交错排版 - 充足纵向落差零重叠)
  // -------------------------------------------------------------
  if (phrase.pvArchetype === 'diagonal-stagger' || phrase.alignStyle === 'stagger-stairs') {
    const split = Math.max(1, Math.ceil(totalChars / 2));
    const cluster1 = phrase.glyphs.slice(0, split);
    const cluster2 = phrase.glyphs.slice(split);

    let baseFontSize = Math.min(
      safeW * 0.15,
      safeH * 0.22,
      105,
    ) * phrase.fontScale * lyricsFontScale;
    baseFontSize = Math.max(20, Math.floor(baseFontSize));

    const tracking = Math.max(4, Math.round(baseFontSize * 0.10));
    ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;

    const staggerDir = syzygyHash01(seed, 4, 31) > 0.5 ? 1 : -1;
    const staggerX = Math.round(baseFontSize * 0.38);
    const staggerY = Math.round(baseFontSize * 0.75); // 2 * staggerY = 1.5 * fontSize，保证两簇上下完全避让

    const glyphs: ResolvedGlyphLayout[] = [];

    // Cluster 1 (Top / Offset 1)
    let charWidths1 = cluster1.map(g => ctx.measureText(g.char).width);
    let w1 = charWidths1.reduce((a, b) => a + b, 0) + Math.max(0, cluster1.length - 1) * tracking;
    let curX1 = -w1 / 2 - staggerDir * staggerX;

    cluster1.forEach((g, idx) => {
      const gw = charWidths1[idx];
      glyphs.push({
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: curX1 + gw / 2,
        localY: -staggerY,
        fontSize: baseFontSize,
        rotation: 0,
        isHero: idx === heroCharIdx || phrase.role === 'hero',
      });
      curX1 += gw + tracking;
    });

    // Cluster 2 (Bottom / Offset 2)
    if (cluster2.length > 0) {
      let charWidths2 = cluster2.map(g => ctx.measureText(g.char).width);
      let w2 = charWidths2.reduce((a, b) => a + b, 0) + Math.max(0, cluster2.length - 1) * tracking;
      let curX2 = -w2 / 2 + staggerDir * staggerX;

      cluster2.forEach((g, idx) => {
        const gw = charWidths2[idx];
        const actualIdx = split + idx;
        glyphs.push({
          char: g.char,
          startTime: g.startTime,
          endTime: g.endTime,
          indexInPhrase: g.indexInPhrase,
          localX: curX2 + gw / 2,
          localY: staggerY,
          fontSize: baseFontSize,
          rotation: 0,
          isHero: actualIdx === heroCharIdx || phrase.role === 'hero',
        });
        curX2 += gw + tracking;
      });
    }

    const cardW = baseFontSize * totalChars * 0.85 + staggerX * 2 + 48;
    const cardH = staggerY * 2 + baseFontSize * 1.3 + 32;

    return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'multiline' };
  }

  // -------------------------------------------------------------
  // 4. Vertical Monumental Column (天顶凌日纵向立柱 - 严密垂直行距)
  // -------------------------------------------------------------
  if (mode === 'vertical' || phrase.pvArchetype === 'zenith-pillar') {
    let baseFontSize = Math.min(
      (safeH * 0.72) / (totalChars * 1.22),
      targetBaseH * 1.20,
      maxCardW * 0.20,
      105,
    ) * phrase.fontScale * lyricsFontScale;
    baseFontSize = Math.max(20, Math.floor(baseFontSize));

    const colPitch = Math.round(baseFontSize * 1.22);
    const colH = (totalChars - 1) * colPitch + baseFontSize;
    const cardW = baseFontSize * 2.2;
    const cardH = colH + baseFontSize * 0.8;

    const glyphs: ResolvedGlyphLayout[] = phrase.glyphs.map((g, idx) => {
      return {
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: 0,
        localY: (idx - (totalChars - 1) / 2) * colPitch,
        fontSize: baseFontSize,
        rotation: 0,
        isHero: idx === heroCharIdx || phrase.role === 'hero',
      };
    });

    return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'vertical' };
  }

  // -------------------------------------------------------------
  // 5. Multi-line for long sentences (>5 chars - 严整行距与字间距)
  // -------------------------------------------------------------
  if (mode === 'multiline') {
    const split = Math.max(2, Math.floor(totalChars * 0.5));
    const rowsOfGlyphs = [
      phrase.glyphs.slice(0, split),
      phrase.glyphs.slice(split),
    ];

    let baseFontSize = Math.min(
      maxCardW / (Math.max(rowsOfGlyphs[0].length, rowsOfGlyphs[1].length) * 1.25),
      targetBaseH * 0.72,
      95,
    ) * phrase.fontScale * lyricsFontScale;
    baseFontSize = Math.max(18, Math.floor(baseFontSize));

    let tracking = Math.max(4, Math.round(baseFontSize * 0.10));
    ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;

    let charWidths0 = rowsOfGlyphs[0].map(g => ctx.measureText(g.char).width);
    let w0 = charWidths0.reduce((a, b) => a + b, 0) + Math.max(0, rowsOfGlyphs[0].length - 1) * tracking;

    let charWidths1 = rowsOfGlyphs[1].map(g => ctx.measureText(g.char).width);
    let w1 = charWidths1.reduce((a, b) => a + b, 0) + Math.max(0, rowsOfGlyphs[1].length - 1) * tracking;

    const maxRowW = Math.max(w0, w1);
    if (maxRowW > maxCardW) {
      const fit = maxCardW / maxRowW;
      baseFontSize = Math.max(16, Math.floor(baseFontSize * fit));
      tracking = Math.max(3, Math.round(baseFontSize * 0.09));
      ctx.font = `${baseFontWeight} ${baseFontSize}px ${baseFontFamily}`;
      charWidths0 = rowsOfGlyphs[0].map(g => ctx.measureText(g.char).width);
      w0 = charWidths0.reduce((a, b) => a + b, 0) + Math.max(0, rowsOfGlyphs[0].length - 1) * tracking;
      charWidths1 = rowsOfGlyphs[1].map(g => ctx.measureText(g.char).width);
      w1 = charWidths1.reduce((a, b) => a + b, 0) + Math.max(0, rowsOfGlyphs[1].length - 1) * tracking;
    }

    const rowDist = Math.round(baseFontSize * 1.45);
    const glyphs: ResolvedGlyphLayout[] = [];

    let curX0 = -w0 / 2;
    rowsOfGlyphs[0].forEach((g, idx) => {
      const gw = charWidths0[idx];
      glyphs.push({
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: curX0 + gw / 2,
        localY: -rowDist / 2,
        fontSize: baseFontSize,
        rotation: 0,
        isHero: idx === heroCharIdx || phrase.role === 'hero',
      });
      curX0 += gw + tracking;
    });

    let curX1 = -w1 / 2;
    rowsOfGlyphs[1].forEach((g, idx) => {
      const gw = charWidths1[idx];
      const actualIdx = split + idx;
      glyphs.push({
        char: g.char,
        startTime: g.startTime,
        endTime: g.endTime,
        indexInPhrase: g.indexInPhrase,
        localX: curX1 + gw / 2,
        localY: rowDist / 2,
        fontSize: baseFontSize,
        rotation: 0,
        isHero: actualIdx === heroCharIdx || phrase.role === 'hero',
      });
      curX1 += gw + tracking;
    });

    const cardW = Math.max(w0, w1) + 48;
    const cardH = rowDist + baseFontSize * 1.3 + 36;

    return { fontSize: baseFontSize, cardW, cardH, glyphs, mode: 'multiline' };
  }

  // -------------------------------------------------------------
  // 6. Monolith / Aperture / Orbital-Cross / Horizontal
  // -------------------------------------------------------------
  return computeHorizontalLayout(phrase, maxCardW, targetBaseH, lyricsFontScale, baseFontWeight, baseFontFamily, ctx, seed);
}

// Global bounded layout memoization cache: eliminates repeated measureText and object allocations per frame
const phraseLayoutCache = new Map<string, ResolvedPhraseLayout>();

function getCachedPhraseLayout(
  phrase: SyzygyPhrase,
  safeW: number,
  safeH: number,
  targetBaseH: number,
  lyricsFontScale: number,
  baseFontWeight: number | string,
  baseFontFamily: string,
  ctx: CanvasRenderingContext2D,
  seed = 101,
): ResolvedPhraseLayout {
  const cacheKey = `${phrase.text}:${phrase.layoutDirection || 'h'}:${Math.round(safeW)}:${Math.round(safeH)}:${Math.round(targetBaseH)}:${lyricsFontScale}:${baseFontFamily}:${baseFontWeight}:${seed}`;
  const cached = phraseLayoutCache.get(cacheKey);
  if (cached) return cached;
  const layout = computeSyzygyPhraseLayout(
    phrase,
    safeW,
    safeH,
    targetBaseH,
    lyricsFontScale,
    baseFontWeight,
    baseFontFamily,
    ctx,
    seed,
  );
  if (phraseLayoutCache.size > 256) {
    phraseLayoutCache.clear();
  }
  phraseLayoutCache.set(cacheKey, layout);
  return layout;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

export function resolveSyzygyIsDaylight(theme?: { backgroundColor?: string }, propIsDaylight?: boolean): boolean {
  if (typeof propIsDaylight === 'boolean') return propIsDaylight;
  const bg = (theme?.backgroundColor || '').toLowerCase();
  if (bg === '#ece7db' || bg === '#f6f3eb' || bg === '#e9e4d9') return true;
  const [r, g, b] = parseHexRgb(bg);
  const luma = r * 0.299 + g * 0.587 + b * 0.114;
  return luma > 0.42;
}

export default function VisualizerSyzygy(props: VisualizerSharedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shots = useMemo(() => compileSyzygyDirectorShots(props.lines), [props.lines]);

  const {
    currentTime,
    theme,
    audioPower,
    audioBands,
    showText = true,
    lyricsFontScale = 1,
    staticMode = false,
    songTitle,
    songArtist,
    isDaylight: propIsDaylight,
  } = props;

  const isDaylight = resolveSyzygyIsDaylight(theme, propIsDaylight);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;
    let disposed = false;

    const render = () => {
      if (disposed || !canvas || !ctx) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!shots.length) return;

      const time = currentTime.get();
      const currentPower = audioPower ? audioPower.get() : 0;
      const bassEnergy = audioBands ? (audioBands.bass.get() / 255) : (currentPower / 255);
      const intensity = staticMode ? 0 : 1;
      const baseFontFamily = resolveThemeFontStack(theme);
      const baseFontWeight = resolveThemeFontWeight(theme, 700);

      // 1. Continuous shot lookup
      let shotIndex = 0;
      for (let i = shots.length - 1; i >= 0; i--) {
        if (time >= shots[i].start) {
          shotIndex = i;
          break;
        }
      }
      const activeShot: SyzygyDirectorShot = shots[shotIndex];

      // 2. Cinematic Cruising Camera with Sequential Tracking Glide & Libration Breathing
      const camFrame = resolveSyzygyCameraFrame(activeShot, time);

      // Cinematic Cruising Camera: smooth continuous cruise with gentle breathing, zero jerks
      const tau = time * Math.PI * 2;
      const breathX = (Math.sin(tau * 0.12) * 0.65 + Math.sin(tau * 0.28) * 0.35) * (width * 0.005) * intensity;
      const breathY = (Math.cos(tau * 0.10) * 0.65 + Math.sin(tau * 0.26) * 0.35) * (height * 0.005) * intensity;
      const breathRot = Math.sin(tau * 0.06) * 0.0015 * intensity;

      const camX = camFrame.x * width * intensity + breathX;
      const camY = camFrame.y * height * intensity + breathY;

      ctx.save();
      ctx.translate(width / 2 + camX, height / 2 + camY);
      ctx.scale(camFrame.zoom, camFrame.zoom);
      ctx.rotate((camFrame.rotation + breathRot) * intensity);
      ctx.translate(-width / 2, -height / 2);

      // Lifecycle transitions
      const isAfterExit = time >= activeShot.exitStart;
      const exitDuration = Math.max(0.18, activeShot.end - activeShot.exitStart);
      const exitProgress = isAfterExit ? clamp01((time - activeShot.exitStart) / exitDuration) : 0;
      const textAlpha = 1 - easeInOutCubic(exitProgress);

      // =========================================================================
      // CELESTIAL LYRICS TYPOGRAPHY (纯净通透矢量动效，零背景色块，零遮挡)
      // =========================================================================
      if (showText && textAlpha > 0.001 && activeShot.phrases.length) {
        // Safe frame margins calculated so typography never overflows the screen
        const safeMarginX = width * 0.11;
        const safeMarginY = height * 0.11;
        const safeW = width - safeMarginX * 2;
        const safeH = height - safeMarginY * 2;

        const targetBaseH = safeH * 0.22;

        const phraseLayouts = activeShot.phrases.map((phrase, pIdx) => {
          const shotSeed = activeShot.lineIndex * 43 + pIdx * 19 + 101;
          const layout = getCachedPhraseLayout(
            phrase,
            safeW,
            safeH,
            targetBaseH,
            lyricsFontScale,
            baseFontWeight,
            baseFontFamily,
            ctx,
            shotSeed,
          );

          const minPx = safeMarginX + layout.cardW / 2;
          const maxPx = width - safeMarginX - layout.cardW / 2;
          const px = minPx >= maxPx ? width / 2 : Math.max(minPx, Math.min(maxPx, phrase.relX * width));

          const minPy = safeMarginY + layout.cardH / 2;
          const maxPy = height - safeMarginY - layout.cardH / 2;
          const py = minPy >= maxPy ? height / 2 : Math.max(minPy, Math.min(maxPy, phrase.relY * height));

          return { phrase, layout, px, py };
        });

        // =========================================================================
        // PREPARE ACTIVE PHRASE & GLYPH DATA FOR THE 5 ASTRONOMICAL LAYERS
        // =========================================================================
        interface ResolvedActiveGlyph {
          g: ResolvedGlyphLayout;
          glyphFontSize: number;
          gx: number;
          gy: number;
          finalScale: number;
          glyphRot: number;
          travel: number;
          enterOffX: number;
          enterOffY: number;
          echoAlpha: number;
          glyphAlpha: number;
          isSinging: boolean;
          hasSung: boolean;
          singProgress: number;
          ingressProgress: number;
          sungRelease: number;
          glyphDissolve: number;
          isAssembling: boolean;
          glyphAppearTime: number;
        }

        interface ActivePhraseRenderData {
          phrase: SyzygyPhrase;
          layout: ResolvedPhraseLayout;
          px: number;
          py: number;
          fontSize: number;
          cardOffX: number;
          cardOffY: number;
          cardScale: number;
          cardRotOffset: number;
          phraseAlpha: number;
          phraseTravel: number;
          phraseDissolve: number;
          activeGlyphs: ResolvedActiveGlyph[];
        }

        const activePhrases: ActivePhraseRenderData[] = [];

        phraseLayouts.forEach(({ phrase, layout, px, py }, phraseIdx) => {
          // 借鉴凝彩 (Tempera) 与镜台 (Diorama) 的舞台聚焦原则：
          // 短语依次登场演唱，逐字随唱随散，绝不全屏堆砌导致重叠遮挡
          const firstGlyphStart = layout.glyphs[0]?.startTime ?? phrase.start;
          const phraseLeadIn = Math.min(0.55, Math.max(0.48, phrase.start - activeShot.start));
          const phraseExitDuration = 0.42;
          const phraseNaturalEnd = phrase.end + phraseExitDuration;

          // 1. 若当前时间已过该乐句自然溶散终点，绝对不再绘制（杜绝全句闪回）
          if (time >= phraseNaturalEnd) return;
          // 2. 若当前时间早于首字粒子汇聚起飞点，尚未登场
          if (time < firstGlyphStart - phraseLeadIn) return;

          // 3. 乐句整体退出溶蚀（与换镜过渡 exitProgress 协同）
          const naturalDissolve = time > phrase.end
            ? clamp01((time - phrase.end) / phraseExitDuration)
            : 0;
          const phraseDissolve = Math.max(naturalDissolve, exitProgress);
          if (phraseDissolve >= 1.0) return;

          const { fontSize } = layout;
          const phraseLinear = clamp01((time - (phrase.start - phraseLeadIn)) / phraseLeadIn);
          const phraseSettle = easeExpoOut(phraseLinear);
          const phraseTravel = 1 - phraseSettle;
          const phraseAlpha = (1 - phraseDissolve);

          // 纯粹锚定坐标系：文字位置沉稳扎实，微粒向固定笔画汇聚，彻底杜绝整体位移跳动
          const cardOffX = 0;
          const cardOffY = 0;
          const cardScale = 1;
          const cardRotOffset = 0;

          const totalGlyphsInPhrase = Math.max(1, layout.glyphs.length);
          const phraseDuration = Math.max(0.1, phrase.end - phrase.start);

          const activeGlyphs: ResolvedActiveGlyph[] = layout.glyphs.map((g) => {
            const glyphFontSize = g.fontSize || fontSize;

            // 绘光级优美曲线飞行与波前传播时延 (Lumiere-inspired curved Bézier flight with wavefront propagation):
            // 字符按词内顺序以波前平滑时延依次起飞 (stagger)，整句犹如一缕流动的星座星带
            const stagger = (g.indexInPhrase / totalGlyphsInPhrase) * Math.min(0.24, phraseDuration * 0.28);
            const glyphIngressDuration = 0.62;
            const glyphAppearTime = g.startTime;
            const glyphIngressStart = glyphAppearTime - glyphIngressDuration + stagger;

            // 尚未到该字符启程时刻，完全不渲染
            if (time < glyphIngressStart) return null;

            const ingressProgress = clamp01((time - glyphIngressStart) / glyphIngressDuration);
            const isAssembling = time < glyphAppearTime;

            // 1. 发射矢量：从深空引力场沿着短语几何与天文姿态发射
            const baseMagnitude = glyphFontSize * (1.10 + syzygyHash01(phraseIdx, g.indexInPhrase, 151) * 0.35);
            let baseAngle = -Math.PI * 0.5; // 默认自然上滑 (slide from below)
            if (phrase.enterStyle === 'from-left') baseAngle = 0;
            else if (phrase.enterStyle === 'from-right') baseAngle = Math.PI;
            else if (phrase.enterStyle === 'from-above') baseAngle = Math.PI * 0.5;
            else if (phrase.enterStyle === 'from-below') baseAngle = -Math.PI * 0.5;
            else if (phrase.layoutDirection === 'vertical') baseAngle = -Math.PI * 0.5;

            // 同一短语内统一的弧线弯曲极性 (保持整句向同侧优雅拱起，杜绝字与字互撞)
            const phraseArcSign = phraseIdx % 2 === 0 ? 1 : -1;
            const spread = (syzygyHash01(phraseIdx, g.indexInPhrase, 149) - 0.5) * 0.18;
            const launchAngle = baseAngle + spread;

            const p0x = Math.cos(launchAngle) * baseMagnitude;
            const p0y = Math.sin(launchAngle) * baseMagnitude;
            const p1x = 0;
            const p1y = 0;

            // 2. 绘光数学核心：三次贝塞尔空间曲线控制点 (Cubic Bézier Control Points C1 & C2):
            // C1 将字沿天体切线方向抛向外侧轨道；C2 沿回程切线柔和引向排版锚点
            const dist = Math.hypot(p0x, p0y) || 1;
            const chordAngle = Math.atan2(-p0y, -p0x);
            const normalAngle = chordAngle + Math.PI * 0.5 * phraseArcSign;
            const arcCurvature = dist * 0.38;

            const c1x = p0x + Math.cos(chordAngle) * (dist * 0.38) + Math.cos(normalAngle) * arcCurvature;
            const c1y = p0y + Math.sin(chordAngle) * (dist * 0.38) + Math.sin(normalAngle) * arcCurvature;

            const c2x = p1x - Math.cos(chordAngle) * (dist * 0.32) + Math.cos(normalAngle) * (arcCurvature * 0.35);
            const c2y = p1y - Math.sin(chordAngle) * (dist * 0.32) + Math.sin(normalAngle) * (arcCurvature * 0.35);

            // 3. 绘光速度曲线：三次对称 S 型缓动 (easeInOutCubic / Hermite Spline)
            // 两端一阶导数严格为 0，初速度柔和启动，中程极速掠过弧顶，终点优雅减速落定
            const s = isAssembling ? easeInOutCubic(ingressProgress) : 1.0;
            const u = 1 - s;

            // 三次伯恩斯坦多项式求值 (Cubic Bernstein basis evaluation):
            const bezierX = u * u * u * p0x + 3 * u * u * s * c1x + 3 * u * s * s * c2x + s * s * s * p1x;
            const bezierY = u * u * u * p0y + 3 * u * u * s * c1y + 3 * u * s * s * c2y + s * s * s * p1y;

            const enterOffX = isAssembling ? bezierX : 0;
            const enterOffY = isAssembling ? bezierY : 0;

            // 4. 气动倾角与飞行升力包络 (Aerodynamic Banking & Flight Lift Envelope):
            // 沿曲线飞行中产生如同航天器侧滑倾斜的 banking 角与微观景深浮动
            const flightLift = isAssembling ? Math.sin(s * Math.PI) : 0;
            const bankingAngle = phraseArcSign * 0.10 * flightLift;
            const initialRot = (syzygyHash01(phraseIdx, g.indexInPhrase, 157) - 0.5) * 0.20;
            const enterRot = isAssembling ? initialRot * (1 - s) + bankingAngle : 0;
            const glyphRot = (g.rotation || 0) + enterRot;
            const enterScaleResolved = isAssembling ? (0.84 + s * 0.16 + flightLift * 0.05) : 1.0;

            // 5. 准周期利萨如简谐漂移 (Quasi-Periodic Lissajous Harmonic Drift):
            // 落定后文字永不僵死，非互质频率在二维平面描绘开放环形呼吸，极具生命感
            const tau = time * Math.PI * 2;
            const glyphPhase = phraseIdx * 1.618 + g.indexInPhrase * 0.382;
            const driftAmp = Math.min(2.0, glyphFontSize * 0.035);
            const lissajousX = (Math.sin(tau * 0.18 + glyphPhase) * 0.65 + Math.sin(tau * 0.42 + glyphPhase * 1.7) * 0.35) * driftAmp;
            const lissajousY = (Math.cos(tau * 0.14 + glyphPhase * 1.3) * 0.65 + Math.sin(tau * 0.36 + glyphPhase * 0.9) * 0.35) * driftAmp;
            const lissajousRot = Math.sin(tau * 0.10 + glyphPhase * 2.1) * 0.003;

            // 发声与已唱状态判定
            const isSinging = time >= g.startTime && time < g.endTime;
            const hasSung = time >= g.endTime;

            // 逐字随唱随散 (Per-glyph dissolution):
            // 唱毕的字立即化作微风星沙飘散（右上方向 -45°~-35°），0.42s 内随风消散！
            const glyphDissolveDuration = 0.42;
            const glyphDissolve = hasSung
              ? clamp01((time - g.endTime) / glyphDissolveDuration)
              : 0;
            // 若该字符已完全随风化为星沙消散完毕，生命周期结束
            if (glyphDissolve >= 1.0) return null;

            // 发声时的轻微呼吸微缩放 (0 ~ +5%)
            const singProgress = isSinging
              ? clamp01((time - g.startTime) / Math.max(0.06, g.endTime - g.startTime))
              : 0;
            const singPop = isSinging
              ? Math.sin(singProgress * Math.PI) * 0.05
              : 0;

            // 凝彩级平滑渐进透明度：在前半程 (0~42%) 平缓显形，在滑行中完全可见并减速定格
            let glyphAlpha = 0;
            if (isAssembling) {
              const reveal = clamp01(ingressProgress * 2.2);
              glyphAlpha = easeTemperaInOut(reveal) * phraseAlpha;
            } else {
              glyphAlpha = phraseAlpha;
            }

            // 唱毕随风溶散时，实体字在溶散前 30% (约 130ms) 迅速淡出，视觉完全交接给星尘流沙彗尾
            if (glyphDissolve > 0) {
              const fontFade = clamp01(1 - glyphDissolve * 3.2);
              glyphAlpha *= fontFade;
            }

            // 实时坐标：入场时沿三次贝塞尔优美曲线飞行，定格后叠加微量利萨如星河漂移
            const gx = g.localX + enterOffX + (isAssembling ? 0 : lissajousX);
            const gy = g.localY + enterOffY + (isAssembling ? 0 : lissajousY);
            const finalScale = enterScaleResolved * (1 + singPop);
            const finalRot = glyphRot + (isAssembling ? 0 : lissajousRot);

            // 动态飞行残影强度 (Flight Echo Alpha from curved velocity):
            const echoAlpha = isAssembling ? flightLift * 0.45 : 0;
            const travel = isAssembling ? (1 - s) : 0;

            return {
              g,
              glyphFontSize,
              gx,
              gy,
              finalScale,
              glyphRot: finalRot,
              travel,
              enterOffX,
              enterOffY,
              echoAlpha,
              glyphAlpha,
              isSinging,
              hasSung,
              singProgress,
              ingressProgress,
              sungRelease: glyphDissolve,
              glyphDissolve,
              isAssembling,
              glyphAppearTime,
            };
          }).filter(Boolean) as ResolvedActiveGlyph[];

          if (activeGlyphs.length > 0) {
            activePhrases.push({
              phrase,
              layout,
              px,
              py,
              fontSize,
              cardOffX,
              cardOffY,
              cardScale,
              cardRotOffset,
              phraseAlpha,
              phraseTravel,
              phraseDissolve,
              activeGlyphs,
            });
          }
        });

        // =========================================================================
        // 图层 1 (zDepth = -0.25): 画廊构图标尺与排版参考系 (Architectural Framing & Datum Guide Layer)
        // 极简四角取景裁切线(Crop Marks)、静雅歌曲元数据、短语排版基准导轨与音节刻度，通透发丝线规范
        // =========================================================================
        const margin = Math.min(width, height) * 0.055;
        const cropSize = 12;

        ctx.save();
        ctx.strokeStyle = theme.secondaryColor || (isDaylight ? theme.primaryColor : 'rgba(255, 255, 255, 0.4)');
        ctx.lineWidth = 1;
        ctx.globalAlpha = (isDaylight ? 0.38 : 0.22) * textAlpha;

        // Viewport Gallery Corner Marks
        ctx.beginPath();
        // Top-left
        ctx.moveTo(margin, margin + cropSize);
        ctx.lineTo(margin, margin);
        ctx.lineTo(margin + cropSize, margin);
        // Top-right
        ctx.moveTo(width - margin - cropSize, margin);
        ctx.lineTo(width - margin, margin);
        ctx.lineTo(width - margin, margin + cropSize);
        // Bottom-left
        ctx.moveTo(margin, height - margin - cropSize);
        ctx.lineTo(margin, height - margin);
        ctx.lineTo(margin + cropSize, height - margin);
        // Bottom-right
        ctx.moveTo(width - margin - cropSize, height - margin);
        ctx.lineTo(width - margin, height - margin);
        ctx.lineTo(width - margin, height - margin - cropSize);
        ctx.stroke();

        // Quiet Song Title & Artist Metadata (深色模式纯白微光 / 日光暖纸深墨排印)
        if (songTitle) {
          ctx.font = `600 11px ${baseFontFamily}`;
          ctx.fillStyle = isDaylight ? theme.primaryColor : '#ffffff';
          ctx.globalAlpha = (isDaylight ? 0.65 : 0.35) * textAlpha;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(songTitle, margin + 6, margin + 2);
          if (songArtist) {
            ctx.font = `400 9px ${baseFontFamily}`;
            ctx.fillStyle = isDaylight ? theme.primaryColor : '#ffffff';
            ctx.globalAlpha = (isDaylight ? 0.45 : 0.22) * textAlpha;
            ctx.fillText(songArtist, margin + 6, margin + 18);
          }
        }
        ctx.restore();

        // Per-Phrase Datum Hairline & Syllable Graduation Ticks
        activePhrases.forEach((pData) => {
          const zDepth = -0.25;
          const layerCamX = camX * zDepth * 0.7;
          const layerCamY = camY * zDepth * 0.7;
          const layerScale = pData.cardScale * (1 + zDepth * 0.04);

          ctx.save();
          ctx.translate(pData.px + pData.cardOffX + layerCamX, pData.py + pData.cardOffY + layerCamY);
          ctx.rotate(pData.phrase.cardAngle + pData.cardRotOffset);
          ctx.scale(layerScale, layerScale);

          const glyphs = pData.layout.glyphs;
          if (glyphs.length > 0) {
            const isVertical = pData.layout.mode === 'vertical';
            const firstG = glyphs[0];
            const lastG = glyphs[glyphs.length - 1];

            // Hairline Datum Axis
            ctx.save();
            ctx.strokeStyle = theme.secondaryColor || (isDaylight ? theme.primaryColor : 'rgba(255, 255, 255, 0.35)');
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = (isDaylight ? 0.32 : 0.18) * pData.phraseAlpha * textAlpha;

            ctx.beginPath();
            if (isVertical) {
              const meridianX = pData.fontSize * 0.48;
              ctx.moveTo(firstG.localX + meridianX, firstG.localY - pData.fontSize * 0.5);
              ctx.lineTo(lastG.localX + meridianX, lastG.localY + pData.fontSize * 0.5);
            } else if (pData.layout.mode === 'multiline') {
              ctx.moveTo(firstG.localX, firstG.localY + firstG.fontSize * 0.42);
              for (let i = 1; i < glyphs.length; i++) {
                ctx.lineTo(glyphs[i].localX, glyphs[i].localY + glyphs[i].fontSize * 0.42);
              }
            } else {
              const baselineY = pData.fontSize * 0.42;
              ctx.moveTo(firstG.localX - pData.fontSize * 0.5, baselineY);
              ctx.lineTo(lastG.localX + pData.fontSize * 0.5, baselineY);
            }
            ctx.stroke();

            // Syllable Graduation Marks
            glyphs.forEach((g) => {
              const tickX = isVertical ? g.localX + pData.fontSize * 0.48 : g.localX;
              const tickY = isVertical ? g.localY : (g.localY || 0) + (pData.layout.mode === 'multiline' ? g.fontSize * 0.42 : pData.fontSize * 0.42);
              const tickLen = 4;
              ctx.beginPath();
              if (isVertical) {
                ctx.moveTo(tickX - tickLen / 2, tickY);
                ctx.lineTo(tickX + tickLen / 2, tickY);
              } else {
                ctx.moveTo(tickX, tickY - tickLen / 2);
                ctx.lineTo(tickX, tickY + tickLen / 2);
              }
              ctx.stroke();
            });

            // Synchronized Playhead Cursor along the Datum Line
            if (time >= pData.phrase.start && time <= pData.phrase.end) {
              const phraseProgress = clamp01((time - pData.phrase.start) / Math.max(0.1, pData.phrase.end - pData.phrase.start));
              const cursorX = firstG.localX + (lastG.localX - firstG.localX) * phraseProgress;
              const cursorY = isVertical
                ? firstG.localY + (lastG.localY - firstG.localY) * phraseProgress
                : (firstG.localY + (lastG.localY - firstG.localY) * phraseProgress) + (pData.layout.mode === 'multiline' ? pData.fontSize * 0.42 : pData.fontSize * 0.42);

              ctx.fillStyle = theme.accentColor;
              ctx.globalAlpha = 0.85 * textAlpha;
              ctx.beginPath();
              ctx.arc(isVertical ? cursorX + pData.fontSize * 0.48 : cursorX, cursorY, 2.2, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }

          ctx.restore();
        });

        // =========================================================================
        // 图层 2 (zDepth = -0.10): 景深微透投影与入场动能拖尾 (Kinetic Depth Shadow & Motion Trail Layer)
        // 软性微透 3D 景深分层，进场采用主题强调色动能残影，无任何黑色实心文字
        // 当文字在粒子汇聚中或处于粒子溶蚀散开时，不绘制实体阴影
        // =========================================================================
        activePhrases.forEach((pData) => {
          if (pData.phraseDissolve > 0.05) return;

          const zDepth = -0.10;
          const layerCamX = camX * zDepth * 0.7;
          const layerCamY = camY * zDepth * 0.7;
          const layerScale = pData.cardScale * (1 + zDepth * 0.04);

          ctx.save();
          ctx.translate(pData.px + pData.cardOffX + layerCamX, pData.py + pData.cardOffY + layerCamY);
          ctx.rotate(pData.phrase.cardAngle + pData.cardRotOffset);
          ctx.scale(layerScale, layerScale);

          pData.activeGlyphs.forEach(({ g, glyphFontSize, gx, gy, finalScale, glyphRot, glyphAlpha, enterOffX, enterOffY, echoAlpha, isAssembling }) => {
            if (glyphAlpha <= 0.01) return;

            if (echoAlpha > 0.005) {
              // 凝彩同款动态多重残影 (Kinetic Motion Echoes from Tempera):
              // 沿入场运动矢量向后递进拖尾，饱满主题强调色微透残影
              for (let echoIdx = 0; echoIdx < 2; echoIdx++) {
                const depth = 1 + echoIdx * 0.85;
                const echoA = (echoAlpha / (echoIdx + 1.4)) * pData.phraseAlpha * textAlpha;
                if (echoA > 0.008) {
                  ctx.save();
                  ctx.translate(g.localX + enterOffX * depth, g.localY + enterOffY * depth);
                  ctx.scale(finalScale, finalScale);
                  if (glyphRot !== 0) ctx.rotate(glyphRot);
                  ctx.font = `${g.isHero ? '900' : baseFontWeight} ${glyphFontSize}px ${baseFontFamily}`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = theme.accentColor;
                  ctx.globalAlpha = echoA * 0.65;
                  ctx.fillText(g.char, 0, 0);
                  ctx.restore();
                }
              }
            } else if (!isAssembling) {
              // Subtle 3D Depth Shadow: Soft translucent shadow for floating optical separation
              const shadowOffX = glyphFontSize * 0.035;
              const shadowOffY = glyphFontSize * 0.045;
              ctx.save();
              ctx.translate(gx + shadowOffX, gy + shadowOffY);
              ctx.scale(finalScale, finalScale);
              if (glyphRot !== 0) ctx.rotate(glyphRot);
              ctx.font = `${g.isHero ? '900' : baseFontWeight} ${glyphFontSize}px ${baseFontFamily}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isDaylight ? 'rgba(30, 24, 18, 0.28)' : 'rgba(0, 0, 0, 0.35)';
              ctx.globalAlpha = (isDaylight ? 0.16 : 0.12) * glyphAlpha * textAlpha;
              ctx.fillText(g.char, 0, 0);
              ctx.restore();
            }
          });

          ctx.restore();
        });

        // =========================================================================
        // 图层 3 (zDepth = +0.06): 字形量子笔画聚合与粒子溶蚀散开层 (Glyph Particle Assembly & Dissolution Layer)
        // 彻底告别背景底色块！纯光学粒子物理场与高阶笔画采样星尘系统：
        // 1. 入场聚合 (isAssembling): 52 颗量子微粒以引力旋臂向字符真实笔画位置极速汇聚成字 (Particle-to-Stroke Assembly)
        // 2. 汇聚锁定微星芒 (glyphAppearTime时刻): 四向发丝十字光芒与纯白微菱核瞬间爆闪，清脆完成字符实体化
        // 3. 击中发声爆闪 (g.startTime起唱时刻): 饱满主题色光芒与高光微星钻击发
        // 4. 发声能量光晕与轨道浮尘 (isSinging): 柔和辐射能量光晕 + 5 颗发丝轨道微光点 + 节拍声波律动环
        // 5. 离场粒子溶蚀 (phraseDissolve > 0): 字符真实笔画碎裂解构为 52 颗星尘粒子，向深空惯性漂散消失 (Text-to-Particle Dissolution)
        // =========================================================================
        activePhrases.forEach((pData, phraseIdx) => {
          ctx.save();
          ctx.translate(pData.px + pData.cardOffX, pData.py + pData.cardOffY);
          ctx.rotate(pData.phrase.cardAngle + pData.cardRotOffset);
          ctx.scale(pData.cardScale, pData.cardScale);

          pData.activeGlyphs.forEach(({
            g,
            glyphFontSize,
            gx,
            gy,
            finalScale,
            glyphRot,
            glyphAlpha,
            isSinging,
            ingressProgress,
            glyphAppearTime,
            glyphDissolve,
          }) => {
            const gIdx = g.indexInPhrase;

            // -------------------------------------------------------------
            // 1. 出现时：粒子向字符笔画汇聚聚合为文字 (Particle-to-Text Assembly with Comet Trails)
            // -------------------------------------------------------------
            if (ingressProgress > 0.01 && ingressProgress < 1.0) {
              const strokePts = getGlyphStrokePoints(g.char, baseFontFamily, g.isHero ? '900' : baseFontWeight);
              const pull = Math.pow(ingressProgress, 2.2);
              const swirl = (1 - ingressProgress) * 0.35;
              // 璀璨晶莹的高透发光度：在飞行途中保持 100% 鲜明可见，在最后 15% (0.85~1.0) 平滑淡出交接给凝实文字
              const pAlpha = clamp01(Math.min(1, ingressProgress * 2.8) * (1 - Math.max(0, ingressProgress - 0.85) * 6.5));
              const tailFactor = (1 - ingressProgress) * glyphFontSize * (0.16 + bassEnergy * 0.10);

              if (pAlpha > 0.01) {
                // Comet Trails: Batch 1 (White hairlines in dark / Mineral charcoal in daylight)
                if (ingressProgress < 0.90) {
                  ctx.strokeStyle = isDaylight ? theme.primaryColor : '#ffffff';
                  ctx.lineWidth = 1.0;
                  ctx.globalAlpha = pAlpha * (isDaylight ? 0.55 : 0.70);
                  ctx.beginPath();
                  for (let i = 0; i < strokePts.length; i++) {
                    if (i % 3 !== 0) {
                      const pt = strokePts[i];
                      const targetX = gx + pt.dx * glyphFontSize;
                      const targetY = gy + pt.dy * glyphFontSize;
                      const seedA = syzygyHash01(phraseIdx, gIdx, i * 17 + 1);
                      const seedR = syzygyHash01(phraseIdx, gIdx, i * 29 + 5);
                      const startAngle = (i / strokePts.length) * Math.PI * 2 + seedA * 1.8;
                      const startDist = glyphFontSize * (1.1 + seedR * 1.8);
                      const originX = gx + Math.cos(startAngle) * startDist;
                      const originY = gy + Math.sin(startAngle) * startDist;
                      const swirlX = -Math.sin(startAngle) * startDist * swirl * (1 - pull);
                      const swirlY = Math.cos(startAngle) * startDist * swirl * (1 - pull);
                      const px = originX + (targetX - originX) * pull + swirlX;
                      const py = originY + (targetY - originY) * pull + swirlY;
                      const toTargetX = targetX - px;
                      const toTargetY = targetY - py;
                      const toDist = Math.hypot(toTargetX, toTargetY) || 1;
                      const tLen = Math.min(tailFactor, toDist * 0.7);
                      ctx.moveTo(px - (toTargetX / toDist) * tLen, py - (toTargetY / toDist) * tLen);
                      ctx.lineTo(px, py);
                    }
                  }
                  ctx.stroke();

                  // Comet Trails: Batch 2 (Accent hairlines)
                  ctx.strokeStyle = theme.accentColor;
                  ctx.globalAlpha = pAlpha * 0.75;
                  ctx.beginPath();
                  for (let i = 0; i < strokePts.length; i++) {
                    if (i % 3 === 0) {
                      const pt = strokePts[i];
                      const targetX = gx + pt.dx * glyphFontSize;
                      const targetY = gy + pt.dy * glyphFontSize;
                      const seedA = syzygyHash01(phraseIdx, gIdx, i * 17 + 1);
                      const seedR = syzygyHash01(phraseIdx, gIdx, i * 29 + 5);
                      const startAngle = (i / strokePts.length) * Math.PI * 2 + seedA * 1.8;
                      const startDist = glyphFontSize * (1.1 + seedR * 1.8);
                      const originX = gx + Math.cos(startAngle) * startDist;
                      const originY = gy + Math.sin(startAngle) * startDist;
                      const swirlX = -Math.sin(startAngle) * startDist * swirl * (1 - pull);
                      const swirlY = Math.cos(startAngle) * startDist * swirl * (1 - pull);
                      const px = originX + (targetX - originX) * pull + swirlX;
                      const py = originY + (targetY - originY) * pull + swirlY;
                      const toTargetX = targetX - px;
                      const toTargetY = targetY - py;
                      const toDist = Math.hypot(toTargetX, toTargetY) || 1;
                      const tLen = Math.min(tailFactor, toDist * 0.7);
                      ctx.moveTo(px - (toTargetX / toDist) * tLen, py - (toTargetY / toDist) * tLen);
                      ctx.lineTo(px, py);
                    }
                  }
                  ctx.stroke();
                }

                // Stardust Heads: Batch 1 (White points in dark / Mineral charcoal in daylight)
                ctx.fillStyle = isDaylight ? theme.primaryColor : '#ffffff';
                ctx.globalAlpha = pAlpha * (isDaylight ? 0.85 : 1.0);
                ctx.beginPath();
                for (let i = 0; i < strokePts.length; i++) {
                  if (i % 3 !== 0) {
                    const pt = strokePts[i];
                    const targetX = gx + pt.dx * glyphFontSize;
                    const targetY = gy + pt.dy * glyphFontSize;
                    const seedA = syzygyHash01(phraseIdx, gIdx, i * 17 + 1);
                    const seedR = syzygyHash01(phraseIdx, gIdx, i * 29 + 5);
                    const startAngle = (i / strokePts.length) * Math.PI * 2 + seedA * 1.8;
                    const startDist = glyphFontSize * (1.1 + seedR * 1.8);
                    const originX = gx + Math.cos(startAngle) * startDist;
                    const originY = gy + Math.sin(startAngle) * startDist;
                    const swirlX = -Math.sin(startAngle) * startDist * swirl * (1 - pull);
                    const swirlY = Math.cos(startAngle) * startDist * swirl * (1 - pull);
                    const px = originX + (targetX - originX) * pull + swirlX;
                    const py = originY + (targetY - originY) * pull + swirlY;
                    const pSize = Math.max(0.9, (1.8 - ingressProgress * 0.7) * (0.85 + seedA * 0.35));
                    ctx.moveTo(px + pSize, py);
                    ctx.arc(px, py, pSize, 0, Math.PI * 2);
                  }
                }
                ctx.fill();

                // Stardust Heads: Batch 2 (Accent points)
                ctx.fillStyle = theme.accentColor;
                ctx.globalAlpha = pAlpha;
                ctx.beginPath();
                for (let i = 0; i < strokePts.length; i++) {
                  if (i % 3 === 0) {
                    const pt = strokePts[i];
                    const targetX = gx + pt.dx * glyphFontSize;
                    const targetY = gy + pt.dy * glyphFontSize;
                    const seedA = syzygyHash01(phraseIdx, gIdx, i * 17 + 1);
                    const seedR = syzygyHash01(phraseIdx, gIdx, i * 29 + 5);
                    const startAngle = (i / strokePts.length) * Math.PI * 2 + seedA * 1.8;
                    const startDist = glyphFontSize * (1.1 + seedR * 1.8);
                    const originX = gx + Math.cos(startAngle) * startDist;
                    const originY = gy + Math.sin(startAngle) * startDist;
                    const swirlX = -Math.sin(startAngle) * startDist * swirl * (1 - pull);
                    const swirlY = Math.cos(startAngle) * startDist * swirl * (1 - pull);
                    const px = originX + (targetX - originX) * pull + swirlX;
                    const py = originY + (targetY - originY) * pull + swirlY;
                    const pSize = Math.max(0.9, (1.8 - ingressProgress * 0.7) * (0.85 + seedA * 0.35));
                    ctx.moveTo(px + pSize, py);
                    ctx.arc(px, py, pSize, 0, Math.PI * 2);
                  }
                }
                ctx.fill();
              }
            }

            // -------------------------------------------------------------
            // 2. 汇聚锁定瞬间高光微星芒 (Lock Snap on stroke convergence completion)
            // -------------------------------------------------------------
            if (time >= glyphAppearTime && time < glyphAppearTime + 0.12) {
              const snapT = clamp01((time - glyphAppearTime) / 0.12);
              const flashAlpha = 1 - snapT;
              const glintArm = glyphFontSize * (0.42 * flashAlpha);

              ctx.save();
              ctx.translate(gx, gy);
              ctx.strokeStyle = isDaylight ? theme.primaryColor : '#ffffff';
              ctx.lineWidth = 0.8;
              ctx.globalAlpha = flashAlpha * (isDaylight ? 0.75 : 0.92) * textAlpha;

              ctx.beginPath();
              ctx.moveTo(-glintArm, 0);
              ctx.lineTo(glintArm, 0);
              ctx.moveTo(0, -glintArm);
              ctx.lineTo(0, glintArm);
              ctx.stroke();

              const coreSize = 2.2 * flashAlpha;
              ctx.fillStyle = theme.accentColor;
              ctx.beginPath();
              ctx.moveTo(0, -coreSize);
              ctx.lineTo(coreSize, 0);
              ctx.lineTo(0, coreSize);
              ctx.lineTo(-coreSize, 0);
              ctx.closePath();
              ctx.fill();

              ctx.restore();
            }

            // -------------------------------------------------------------
            // 3. 起唱瞬间光芒微星钻闪烁 (Optical Cross Glint Snap on vocal strike)
            // -------------------------------------------------------------
            if (time >= g.startTime && time < g.startTime + 0.14) {
              const snapT = clamp01((time - g.startTime) / 0.14);
              const flashAlpha = 1 - snapT;
              const glintArm = glyphFontSize * (0.48 * flashAlpha);

              ctx.save();
              ctx.translate(gx, gy);
              ctx.strokeStyle = isDaylight ? theme.primaryColor : '#ffffff';
              ctx.lineWidth = 0.8;
              ctx.globalAlpha = flashAlpha * (isDaylight ? 0.75 : 0.90) * textAlpha;

              ctx.beginPath();
              ctx.moveTo(-glintArm, 0);
              ctx.lineTo(glintArm, 0);
              ctx.moveTo(0, -glintArm);
              ctx.lineTo(0, glintArm);
              ctx.stroke();

              const coreSize = 2.0 * flashAlpha;
              ctx.fillStyle = theme.accentColor;
              ctx.beginPath();
              ctx.moveTo(0, -coreSize);
              ctx.lineTo(coreSize, 0);
              ctx.lineTo(0, coreSize);
              ctx.lineTo(-coreSize, 0);
              ctx.closePath();
              ctx.fill();

              ctx.restore();
            }

            // -------------------------------------------------------------
            // 4. 发声阶段能量光晕场与轨道微光浮尘 (Active Singing Halo & Orbital Embers)
            // -------------------------------------------------------------
            if (isSinging && pData.phraseDissolve <= 0.05) {
              ctx.save();
              ctx.translate(gx, gy);
              ctx.scale(finalScale, finalScale);
              if (glyphRot !== 0) ctx.rotate(glyphRot);

              // 字符辐射能量光晕 (Radiant Accent Halo Aura, 纯光学光晕无实心块)
              ctx.font = `${g.isHero ? '900' : baseFontWeight} ${glyphFontSize}px ${baseFontFamily}`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.shadowColor = theme.accentColor;
              ctx.shadowBlur = Math.max(16, glyphFontSize * 0.4) * (1 + bassEnergy * 0.40);
              ctx.fillStyle = theme.accentColor;
              ctx.globalAlpha = (isDaylight ? (0.28 + bassEnergy * 0.12) : (0.38 + bassEnergy * 0.15)) * glyphAlpha * textAlpha;
              ctx.fillText(g.char, 0, 0);
              ctx.shadowBlur = 0;

              // 轨道微光浮尘 (Orbital Embers, 5 颗发丝呼吸光点)
              for (let i = 0; i < 5; i++) {
                const orbAngle = time * 2.8 + i * (Math.PI * 2 / 5);
                const orbDist = glyphFontSize * (0.44 + 0.08 * Math.sin(time * 4.5 + i)) * (1 + bassEnergy * 0.25);
                const ox = Math.cos(orbAngle) * orbDist;
                const oy = Math.sin(orbAngle) * orbDist;
                ctx.fillStyle = i % 2 === 0 ? (isDaylight ? theme.primaryColor : '#ffffff') : theme.accentColor;
                ctx.globalAlpha = (0.45 + 0.35 * Math.sin(time * 6 + i)) * pData.phraseAlpha * textAlpha;
                ctx.beginPath();
                ctx.arc(ox, oy, 1.1 + bassEnergy * 0.4, 0, Math.PI * 2);
                ctx.fill();
              }

              // 节拍声波微律动光环 (Sonic Pulse Wave Ring)
              if (bassEnergy > 0.25) {
                const pulseR = glyphFontSize * (0.50 + bassEnergy * 0.35);
                ctx.shadowBlur = 0;
                ctx.strokeStyle = theme.accentColor;
                ctx.lineWidth = 0.8;
                ctx.globalAlpha = 0.40 * bassEnergy * textAlpha;
                ctx.beginPath();
                ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
                ctx.stroke();
              }

              ctx.restore();
            }

            // -------------------------------------------------------------
            // 5. 逐字随唱随散：文字笔画解构化作微风星沙顺风飘散 (Wind-Blown Star-Sand Dissolution)
            // -------------------------------------------------------------
            const effDissolve = Math.max(glyphDissolve, pData.phraseDissolve);
            if (effDissolve > 0.005 && effDissolve < 1.0) {
              const strokePts = getGlyphStrokePoints(g.char, baseFontFamily, g.isHero ? '900' : baseFontWeight);
              const dissolveProgress = effDissolve;
              const dissolveAlpha = clamp01(Math.sin(dissolveProgress * Math.PI * 0.95) * 1.15) * (1 - dissolveProgress * 0.25);
              const pSize = Math.max(0.7, 1.6 - dissolveProgress * 0.8);
              const disTailLen = glyphFontSize * (0.12 + (1 - dissolveProgress) * 0.16) * (1 + bassEnergy * 0.40);

              // 顺风微向量：右上 -45° 顺风微风 (微风星沙轨迹)
              const baseWindAngle = -Math.PI * 0.25;

              // Dissolution Comet Trails: Batch 1 (White hairlines in dark / Mineral charcoal in daylight)
              ctx.strokeStyle = isDaylight ? theme.primaryColor : '#ffffff';
              ctx.lineWidth = 1.0;
              ctx.globalAlpha = dissolveAlpha * (isDaylight ? 0.55 : 0.70);
              ctx.beginPath();
              for (let i = 0; i < strokePts.length; i++) {
                if (i % 2 !== 0) {
                  const pt = strokePts[i];
                  const sourceX = gx + pt.dx * glyphFontSize;
                  const sourceY = gy + pt.dy * glyphFontSize;
                  const seedA = syzygyHash01(phraseIdx, gIdx, i * 23 + 3);
                  const seedSpeed = glyphFontSize * (0.9 + syzygyHash01(phraseIdx, gIdx, i * 37 + 7) * 1.3);
                  const windAngle = baseWindAngle + (seedA - 0.5) * 0.55;
                  const explodeDist = Math.pow(dissolveProgress, 1.25) * seedSpeed;
                  const px = sourceX + Math.cos(windAngle) * explodeDist;
                  const py = sourceY + Math.sin(windAngle) * explodeDist;
                  const tLen = Math.min(disTailLen, explodeDist * 0.85);
                  ctx.moveTo(px - Math.cos(windAngle) * tLen, py - Math.sin(windAngle) * tLen);
                  ctx.lineTo(px, py);
                }
              }
              ctx.stroke();

              // Dissolution Comet Trails: Batch 2 (Accent hairlines)
              ctx.strokeStyle = theme.accentColor;
              ctx.globalAlpha = dissolveAlpha * 0.75;
              ctx.beginPath();
              for (let i = 0; i < strokePts.length; i++) {
                if (i % 2 === 0) {
                  const pt = strokePts[i];
                  const sourceX = gx + pt.dx * glyphFontSize;
                  const sourceY = gy + pt.dy * glyphFontSize;
                  const seedA = syzygyHash01(phraseIdx, gIdx, i * 23 + 3);
                  const seedSpeed = glyphFontSize * (0.9 + syzygyHash01(phraseIdx, gIdx, i * 37 + 7) * 1.3);
                  const windAngle = baseWindAngle + (seedA - 0.5) * 0.55;
                  const explodeDist = Math.pow(dissolveProgress, 1.25) * seedSpeed;
                  const px = sourceX + Math.cos(windAngle) * explodeDist;
                  const py = sourceY + Math.sin(windAngle) * explodeDist;
                  const tLen = Math.min(disTailLen, explodeDist * 0.85);
                  ctx.moveTo(px - Math.cos(windAngle) * tLen, py - Math.sin(windAngle) * tLen);
                  ctx.lineTo(px, py);
                }
              }
              ctx.stroke();

              // Batch 1: Stardust heads (White in dark / Mineral charcoal in daylight)
              ctx.fillStyle = isDaylight ? theme.primaryColor : '#ffffff';
              ctx.globalAlpha = dissolveAlpha * (isDaylight ? 0.85 : 1.0);
              ctx.beginPath();
              for (let i = 0; i < strokePts.length; i++) {
                if (i % 2 !== 0) {
                  const pt = strokePts[i];
                  const sourceX = gx + pt.dx * glyphFontSize;
                  const sourceY = gy + pt.dy * glyphFontSize;
                  const seedA = syzygyHash01(phraseIdx, gIdx, i * 23 + 3);
                  const seedSpeed = glyphFontSize * (0.9 + syzygyHash01(phraseIdx, gIdx, i * 37 + 7) * 1.3);
                  const windAngle = baseWindAngle + (seedA - 0.5) * 0.55;
                  const explodeDist = Math.pow(dissolveProgress, 1.25) * seedSpeed;
                  const px = sourceX + Math.cos(windAngle) * explodeDist;
                  const py = sourceY + Math.sin(windAngle) * explodeDist;
                  ctx.moveTo(px + pSize, py);
                  ctx.arc(px, py, pSize, 0, Math.PI * 2);
                }
              }
              ctx.fill();

              // Batch 2: Accent dissolving stardust heads
              ctx.fillStyle = theme.accentColor;
              ctx.beginPath();
              for (let i = 0; i < strokePts.length; i++) {
                if (i % 2 === 0) {
                  const pt = strokePts[i];
                  const sourceX = gx + pt.dx * glyphFontSize;
                  const sourceY = gy + pt.dy * glyphFontSize;
                  const seedA = syzygyHash01(phraseIdx, gIdx, i * 23 + 3);
                  const seedSpeed = glyphFontSize * (0.9 + syzygyHash01(phraseIdx, gIdx, i * 37 + 7) * 1.3);
                  const windAngle = baseWindAngle + (seedA - 0.5) * 0.55;
                  const explodeDist = Math.pow(dissolveProgress, 1.25) * seedSpeed;
                  const px = sourceX + Math.cos(windAngle) * explodeDist;
                  const py = sourceY + Math.sin(windAngle) * explodeDist;
                  ctx.moveTo(px + pSize, py);
                  ctx.arc(px, py, pSize, 0, Math.PI * 2);
                }
              }
              ctx.fill();
            }
          });

          ctx.restore();
        });

        // =========================================================================
        // 图层 4 (zDepth = 0.00): 核心活字碑文母排版层 (Core Typography Master Layer)
        // 商业 PV 级通透排版，绝对无黑色字。发声字晶莹纯白核(#ffffff)+主题色光晕，已唱字饱满主题色，待唱字通透银白
        // 粒子聚合阶段无缝渐变凝聚，粒子溶蚀阶段平滑淡出，彻底杜绝闪烁与突兀
        // =========================================================================
        activePhrases.forEach((pData) => {
          ctx.save();
          ctx.translate(pData.px + pData.cardOffX, pData.py + pData.cardOffY);
          ctx.rotate(pData.phrase.cardAngle + pData.cardRotOffset);
          ctx.scale(pData.cardScale, pData.cardScale);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          pData.activeGlyphs.forEach(({ g, glyphFontSize, gx, gy, finalScale, glyphRot, glyphAlpha, isSinging, hasSung }) => {
            // 1. 在粒子凝聚完成前 (glyphAlpha <= 0.001)，不绘制实体字
            if (glyphAlpha <= 0.001) return;

            // 2. 粒子溶蚀散开阶段，实体字平滑快速淡出，将视觉优雅交接给向外飞散的星尘微粒！
            let fontAlpha = glyphAlpha;
            if (pData.phraseDissolve > 0) {
              const fontDissolveFade = clamp01(1 - pData.phraseDissolve * 2.8);
              if (fontDissolveFade <= 0.001) return;
              fontAlpha *= fontDissolveFade;
            }
            if (fontAlpha <= 0.001) return;

            ctx.save();
            ctx.translate(gx, gy);
            ctx.scale(finalScale, finalScale);
            if (glyphRot !== 0) ctx.rotate(glyphRot);
            ctx.font = `${g.isHero ? '900' : baseFontWeight} ${glyphFontSize}px ${baseFontFamily}`;

            if (isSinging) {
              if (isDaylight) {
                // 暖纸日光模式：饱满赤陶强调色 (theme.accentColor)，温润矿物光晕与细致炭墨描边，字迹鲜亮温润
                ctx.shadowColor = theme.accentColor;
                ctx.shadowBlur = 10;
                ctx.fillStyle = theme.accentColor;
                ctx.globalAlpha = 1.0 * fontAlpha;
                ctx.fillText(g.char, 0, 0);

                // 细致墨色描边加固边缘对比与版画感
                ctx.shadowBlur = 0;
                ctx.strokeStyle = theme.primaryColor;
                ctx.lineWidth = 0.8;
                ctx.globalAlpha = 0.38 * fontAlpha;
                ctx.strokeText(g.char, 0, 0);
              } else {
                // 暗夜深空模式：纯白晶莹高光核 (#ffffff) + 主题强调色光晕 (theme.accentColor glow)
                ctx.shadowColor = theme.accentColor;
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 1.0 * fontAlpha;
                ctx.fillText(g.char, 0, 0);

                // 细致高亮描边加固对比
                ctx.shadowBlur = 0;
                ctx.strokeStyle = theme.accentColor;
                ctx.lineWidth = 0.8;
                ctx.globalAlpha = 0.45 * fontAlpha;
                ctx.strokeText(g.char, 0, 0);
              }
            } else if (hasSung) {
              // 2. 已唱字符：饱满鲜亮的主题强调色 (theme.accentColor)，沉稳扎实
              ctx.fillStyle = theme.accentColor;
              ctx.globalAlpha = fontAlpha * 0.95;
              ctx.fillText(g.char, 0, 0);
            } else {
              // 3. 待唱/凝聚中字符：
              if (isDaylight) {
                // 暖纸日光模式：深邃炭墨色 (theme.primaryColor)，保持 52% 透明度，与暖白纸张形成温润雅致的排印对比
                ctx.fillStyle = theme.primaryColor;
                ctx.globalAlpha = fontAlpha * 0.52;
                ctx.fillText(g.char, 0, 0);
              } else {
                // 暗夜深空模式：通透白银微光 (#ffffff)
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = fontAlpha * 0.85;
                ctx.fillText(g.char, 0, 0);
              }
            }

            ctx.restore();
          });

          ctx.restore();
        });

        // =========================================================================
        // 图层 5 (zDepth = +0.22): 前景微视差焦点引导与浮动括弧 (Foreground Micro-Parallax Layer)
        // 真正 3D 前景正向视差（镜头巡航移速更快）。发声高光微标、核心词四角浮动括弧与节拍微律动
        // =========================================================================
        activePhrases.forEach((pData) => {
          const zDepth = 0.22;
          const layerCamX = camX * zDepth * 0.7;
          const layerCamY = camY * zDepth * 0.7;
          const layerScale = pData.cardScale * (1 + zDepth * 0.04);

          ctx.save();
          ctx.translate(pData.px + pData.cardOffX + layerCamX, pData.py + pData.cardOffY + layerCamY);
          ctx.rotate(pData.phrase.cardAngle + pData.cardRotOffset);
          ctx.scale(layerScale, layerScale);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 1. Floating Micro-Playhead Accent on singing glyphs
          pData.activeGlyphs.forEach(({ glyphFontSize, gx, gy, isSinging, isAssembling }) => {
            if (isSinging && !isAssembling && pData.phraseDissolve < 0.2) {
              ctx.save();
              const cursorDist = glyphFontSize * 0.65;
              ctx.fillStyle = theme.accentColor;
              ctx.globalAlpha = 0.90 * textAlpha;

              // Small 3px diamond indicator floating directly above character
              ctx.beginPath();
              ctx.moveTo(gx, gy - cursorDist - 3);
              ctx.lineTo(gx + 3, gy - cursorDist);
              ctx.lineTo(gx, gy - cursorDist + 3);
              ctx.lineTo(gx - 3, gy - cursorDist);
              ctx.closePath();
              ctx.fill();

              ctx.restore();
            }
          });

          // 2. Foreground Floating Framing Brackets on Hero Phrases (纯描边括弧，无任何填充底色)
          if (pData.phrase.role === 'hero' && pData.phraseAlpha > 0.2) {
            const padX = pData.layout.cardW / 2 + 8;
            const padY = pData.layout.cardH / 2 + 6;
            const bracketSize = 6;

            ctx.save();
            ctx.strokeStyle = theme.accentColor;
            ctx.lineWidth = 1.0;
            ctx.globalAlpha = 0.35 * pData.phraseAlpha * textAlpha;

            // Top-left bracket
            ctx.beginPath();
            ctx.moveTo(-padX + bracketSize, -padY);
            ctx.lineTo(-padX, -padY);
            ctx.lineTo(-padX, -padY + bracketSize);
            ctx.stroke();

            // Bottom-right bracket
            ctx.beginPath();
            ctx.moveTo(padX - bracketSize, padY);
            ctx.lineTo(padX, padY);
            ctx.lineTo(padX, padY - bracketSize);
            ctx.stroke();

            ctx.restore();
          }

          // 3. Subtle Bass Echo on beat drop (100% theme accent color)
          if (bassEnergy > 0.4 && pData.phraseDissolve < 0.2) {
            pData.activeGlyphs.forEach(({ g, glyphFontSize, gx, gy, finalScale, glyphRot, isSinging, isAssembling }) => {
              if (isSinging && !isAssembling) {
                const echoOff = 1.5 + bassEnergy * 2.0;
                ctx.save();
                ctx.translate(gx + echoOff, gy - echoOff * 0.5);
                ctx.scale(finalScale, finalScale);
                if (glyphRot !== 0) ctx.rotate(glyphRot);
                ctx.font = `${g.isHero ? '900' : baseFontWeight} ${glyphFontSize}px ${baseFontFamily}`;
                ctx.fillStyle = theme.accentColor;
                ctx.globalAlpha = 0.25 * bassEnergy * textAlpha;
                ctx.fillText(g.char, 0, 0);
                ctx.restore();
              }
            });
          }

          ctx.restore();
        });
      }

      ctx.restore();
    };

    const loop = () => {
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    const offTime = currentTime.on('change', () => {
      render();
    });

    const handleBeforeCapture = () => render();
    window.addEventListener('verse:before-capture', handleBeforeCapture);

    const observer = new ResizeObserver(() => render());
    observer.observe(canvas);

    return () => {
      disposed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      window.removeEventListener('verse:before-capture', handleBeforeCapture);
      observer.disconnect();
      offTime();
    };
  }, [currentTime, theme, audioPower, audioBands, showText, lyricsFontScale, staticMode, shots, songTitle, songArtist, isDaylight]);

  return (
    <VisualizerShell
      theme={theme}
      audioPower={audioPower}
      audioBands={audioBands}
      sharedProps={props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          data-capture-ready="true"
        />
      </div>
    </VisualizerShell>
  );
}
