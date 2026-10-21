import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline, type GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';

export type SyzygyDirectorShotKind = 'totality-corona' | 'orbital-duo' | 'astrometric-grid' | 'zenith-transit';
export type SyzygyEnterStyle = 'totality-stamp' | 'gravitational-pull' | 'from-left' | 'from-right' | 'from-above' | 'from-below';
export type SyzygyTone = 'corona-gold' | 'void-slate' | 'penumbra-tint' | 'stardust';

export interface SyzygyGlyph extends GraphemeTiming {
  char: string;
  startTime: number;
  endTime: number;
  indexInPhrase: number;
}

export type SyzygyAlignStyle = 'stagger-stairs' | 'flush-left' | 'flush-right' | 'monument-center';

export type SyzygyPvArchetype =
  | 'diagonal-stagger'   // 极向对角交错排版 (2 chars top-left, 2 chars bottom-right, diagonal beam)
  | 'staircase-cascade'  // 阶梯瀑布流错落排版 (Descending dynamic stair steps with step guidelines)
  | 'zenith-pillar'      // 天顶神谕纵向立柱 (Vertical Japanese column, off-center, telemetry ruler)
  | 'aperture-mask'      // 日全食暗晕几何蒙版 (Massive characters across lunar corona aperture)
  | 'orbital-arc'        // 引力弯曲星轨弧形 (Gravitational parabolic/circular arc trajectory)
  | 'monolith-banner'    // 破晓单字巨碑 (Massive 130px+ horizontal monumental banner)
  | 'orbital-cross';     // 星轨十字准星 (Cardinal targeting reticles & rotating astrolabe)

export interface SyzygyPhrase {
  text: string;
  glyphs: SyzygyGlyph[];
  start: number;
  end: number;
  role: 'hero' | 'support' | 'accent';
  relX: number;
  relY: number;
  fontScale: number;
  enterStyle: SyzygyEnterStyle;
  tone: SyzygyTone;
  cardAngle: number;
  layoutDirection: 'horizontal' | 'vertical' | 'multiline';
  alignStyle: SyzygyAlignStyle;
  pvArchetype: SyzygyPvArchetype;
}

export interface SyzygyCameraKey {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface SyzygyDirectorShot {
  id: string;
  lineIndex: number;
  start: number;
  end: number;
  lineStartTime: number;
  lineEndTime: number;
  exitStart: number;
  kind: SyzygyDirectorShotKind;
  phrases: SyzygyPhrase[];
  hero: number;
  orbitAngle: number;
  camera: SyzygyCameraKey;
  cameraEnd: SyzygyCameraKey;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const easeSoftBack = (t: number) => {
  const c1 = 1.35;
  const c3 = c1 + 1;
  const p = clamp01(t);
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export const easeExpoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeInOutCubic = (t: number) => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

export const resolveSyzygyCameraFrame = (shot: SyzygyDirectorShot, time: number): SyzygyCameraKey => {
  const duration = Math.max(shot.end - shot.start, 0.001);
  const rawProgress = (time - shot.start) / duration;
  const clamped = clamp01(rawProgress);
  const eased = clamped * 0.55 + easeInOutCubic(clamped) * 0.45;
  const overshoot = Math.max(0, rawProgress - 1) * 0.22;
  const t = eased + overshoot;

  return {
    x: shot.camera.x + (shot.cameraEnd.x - shot.camera.x) * t,
    y: shot.camera.y + (shot.cameraEnd.y - shot.camera.y) * t,
    zoom: shot.camera.zoom + (shot.cameraEnd.zoom - shot.camera.zoom) * t,
    rotation: shot.camera.rotation + (shot.cameraEnd.rotation - shot.camera.rotation) * t,
  };
};

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

export function compileSyzygyDirectorShots(lines: Line[]): SyzygyDirectorShot[] {
  const shots: SyzygyDirectorShot[] = [];

  lines.forEach((line, lineIndex) => {
    const allGlyphs = buildLineGraphemeTimeline(line);
    if (!allGlyphs.length) return;

    // Filter out slashes: slashes are purely phrase delimiters and do NOT count toward character count
    const cleanGlyphs = allGlyphs.filter(g => g.char !== '/');
    if (!cleanGlyphs.length) return;

    const text = line.fullText;
    const cleanText = text.replace(/\//g, '').trim();
    const isCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(cleanText);
    let groups: string[] = [];

    if (text.includes('/')) {
      groups = text.split('/').map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else if (shouldSplitBySegments(line.wordSegments, isCjk)) {
      groups = line.wordSegments!.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else {
      // Natural PV segmentation for CJK and Western lyrics (2~5 characters per chunk!):
      const chars = Array.from(cleanText);

      if (isCjk && chars.length > 5) {
        if (chars.length <= 10) {
          // 2 punchy chunks (e.g. 4+4, 4+5, 5+5)
          const mid = Math.ceil(chars.length / 2);
          groups = [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
        } else {
          // 3 punchy chunks (e.g. 4+4+5)
          const s1 = Math.floor(chars.length / 3);
          const s2 = Math.floor((chars.length * 2) / 3);
          groups = [
            chars.slice(0, s1).join(''),
            chars.slice(s1, s2).join(''),
            chars.slice(s2).join(''),
          ];
        }
      } else if (!isCjk && cleanText.includes(' ') && chars.length > 18) {
        const words = cleanText.split(/\s+/).filter(Boolean);
        if (words.length >= 4) {
          const mid = Math.ceil(words.length / 2);
          groups = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
        } else {
          groups = [cleanText];
        }
      } else {
        groups = [cleanText];
      }
    }

    // Character-level cursor matching that cleanly handles spaces, punctuation, and ensures zero character loss
    let cursor = 0;
    const phrasesInLine: { text: string; glyphs: SyzygyGlyph[]; start: number; end: number }[] = [];

    for (const group of groups) {
      const cleanGroup = group.replace(/\//g, '').trim();
      const groupChars = Array.from(cleanGroup);
      const timed: SyzygyGlyph[] = [];
      let charIdx = 0;

      while (cursor < cleanGlyphs.length && charIdx < groupChars.length) {
        const g = cleanGlyphs[cursor++];
        if (g.char === groupChars[charIdx]) {
          timed.push({
            char: g.char,
            startTime: g.startTime,
            endTime: g.endTime,
            indexInPhrase: timed.length,
          });
          charIdx++;
        } else if (/^\s+$/.test(g.char) && groupChars[charIdx] !== ' ') {
          // Skip whitespace between phrases so indexing never lags
          continue;
        } else {
          timed.push({
            char: g.char,
            startTime: g.startTime,
            endTime: g.endTime,
            indexInPhrase: timed.length,
          });
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

    // Safety guarantee: If any trailing non-whitespace characters remain in cleanGlyphs, append to the last phrase!
    if (cursor < cleanGlyphs.length) {
      const remaining = cleanGlyphs.slice(cursor).filter(g => !/^\s+$/.test(g.char));
      if (remaining.length > 0) {
        const lastPhrase = phrasesInLine[phrasesInLine.length - 1];
        if (lastPhrase) {
          remaining.forEach(g => {
            lastPhrase.glyphs.push({
              char: g.char,
              startTime: g.startTime,
              endTime: g.endTime,
              indexInPhrase: lastPhrase.glyphs.length,
            });
          });
          lastPhrase.text += remaining.map(g => g.char).join('');
          lastPhrase.end = lastPhrase.glyphs[lastPhrase.glyphs.length - 1].endTime;
        }
      }
    }

    if (!phrasesInLine.length) return;

    const isChorus = line.isChorus ?? false;

    // Determine shot kind deterministically
    const kindPool: SyzygyDirectorShotKind[] = isChorus
      ? ['totality-corona', 'orbital-duo', 'totality-corona', 'zenith-transit']
      : ['orbital-duo', 'astrometric-grid', 'zenith-transit', 'totality-corona'];
    const kind = kindPool[lineIndex % kindPool.length];

    // Identify hero phrase (strictly 1 hero per shot)
    let hero = 0;
    if (isChorus) {
      hero = 0;
    } else {
      phrasesInLine.forEach((p, i) => {
        if (p.glyphs.length > phrasesInLine[hero].glyphs.length) {
          hero = i;
        }
      });
    }

    const pvPool: SyzygyPvArchetype[] = [
      'diagonal-stagger',
      'staircase-cascade',
      'zenith-pillar',
      'aperture-mask',
      'orbital-arc',
      'monolith-banner',
      'orbital-cross',
    ];

    const nTotal = phrasesInLine.length;

    const phrases: SyzygyPhrase[] = phrasesInLine.map((p, gIdx) => {
      const isHero = gIdx === hero;
      const role: 'hero' | 'support' | 'accent' = isHero ? 'hero' : 'support';
      const fontScale = isHero ? 1.15 : 0.90;

      let relX = 0.50;
      let relY = 0.48;
      if (nTotal === 2) {
        relX = gIdx === 0 ? 0.44 : 0.56;
        relY = gIdx === 0 ? 0.46 : 0.54;
      } else if (nTotal === 3) {
        if (gIdx === 0) { relX = 0.42; relY = 0.45; }
        else if (gIdx === 1) { relX = 0.50; relY = 0.50; }
        else { relX = 0.58; relY = 0.55; }
      } else if (nTotal > 3) {
        const stepY = Math.min(0.14, 0.48 / Math.max(1, nTotal));
        relX = 0.50 + (gIdx % 2 === 0 ? -0.04 : 0.04);
        relY = 0.50 + (gIdx - (nTotal - 1) / 2) * stepY;
      }

      const isCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(p.text);
      let pvArchetype = pvPool[(lineIndex * 3 + gIdx) % pvPool.length];
      if (!isCjk && pvArchetype === 'zenith-pillar') {
        pvArchetype = 'staircase-cascade';
      }

      let enterStyle: SyzygyEnterStyle = 'gravitational-pull';
      let tone: SyzygyTone = isHero ? 'corona-gold' : 'void-slate';
      const angleSeed = (lineIndex * 7 + gIdx * 11) % 9;
      let cardAngle = (angleSeed - 4) * 0.005;

      let layoutDirection: 'horizontal' | 'vertical' | 'multiline' = 'horizontal';
      let alignStyle: SyzygyAlignStyle = 'monument-center';

      if (pvArchetype === 'zenith-pillar' && isCjk) {
        layoutDirection = 'vertical';
        alignStyle = 'monument-center';
        if (nTotal === 1) {
          relX = 0.45;
          relY = 0.50;
        }
        cardAngle = 0;
        enterStyle = 'from-above';
        tone = 'corona-gold';
      } else if (pvArchetype === 'diagonal-stagger') {
        layoutDirection = 'multiline';
        alignStyle = 'stagger-stairs';
        cardAngle = -0.022;
        enterStyle = 'from-left';
        tone = 'corona-gold';
      } else if (pvArchetype === 'staircase-cascade') {
        layoutDirection = 'multiline';
        alignStyle = 'stagger-stairs';
        cardAngle = 0.015;
        enterStyle = 'from-above';
        tone = 'corona-gold';
      } else if (pvArchetype === 'orbital-arc') {
        layoutDirection = 'horizontal';
        alignStyle = 'monument-center';
        cardAngle = -0.012;
        enterStyle = 'gravitational-pull';
        tone = 'corona-gold';
      } else if (pvArchetype === 'aperture-mask') {
        layoutDirection = p.glyphs.length >= 6 ? 'multiline' : 'horizontal';
        alignStyle = 'monument-center';
        cardAngle = 0;
        enterStyle = 'totality-stamp';
        tone = 'corona-gold';
      } else if (pvArchetype === 'monolith-banner') {
        layoutDirection = p.glyphs.length >= 7 ? 'multiline' : 'horizontal';
        alignStyle = 'flush-left';
        cardAngle = 0.012;
        enterStyle = 'from-left';
        tone = 'corona-gold';
      } else {
        // orbital-cross
        layoutDirection = p.glyphs.length >= 6 ? 'multiline' : 'horizontal';
        alignStyle = 'flush-right';
        cardAngle = -0.018;
        enterStyle = 'from-right';
        tone = isHero ? 'corona-gold' : 'stardust';
      }

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
        layoutDirection,
        alignStyle,
        pvArchetype,
      };
    });

    // Shot timing: ensure generous lead-in for particle assembly and continuous shot tiling
    const nextLine = lines[lineIndex + 1];
    const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : null;
    const idealLeadIn = 0.48;

    let shotStart: number;
    if (lineIndex === 0) {
      shotStart = Math.max(0, line.startTime - idealLeadIn);
    } else {
      const prevEnd = prevLine ? prevLine.endTime : 0;
      const gap = line.startTime - prevEnd;
      if (gap >= idealLeadIn + 0.10) {
        // Comfortable gap: allocate full idealLeadIn to the new shot
        shotStart = line.startTime - idealLeadIn;
      } else if (gap > 0.05) {
        // Tight gap: allocate up to 70% of the gap to lead-in so new shot has particle entrance,
        // while the previous line has already dissolved per-glyph into star-sand
        const leadIn = Math.min(idealLeadIn, Math.max(0.12, gap * 0.70));
        shotStart = line.startTime - leadIn;
      } else {
        // Continuous or overlapping lines: start slightly before line.startTime
        shotStart = line.startTime - 0.08;
      }
      if (shots.length > 0) {
        const prevShot = shots[shots.length - 1];
        prevShot.end = shotStart;
        prevShot.exitStart = Math.min(prevShot.exitStart, shotStart - 0.15);
        if (prevShot.exitStart < prevShot.lineEndTime) {
          prevShot.exitStart = Math.max(prevShot.lineEndTime, shotStart - 0.20);
        }
      }
    }

    const shotEnd = nextLine
      ? Math.max(line.endTime + 0.35, nextLine.startTime - idealLeadIn)
      : line.endTime + 2.5;
    const lineStartTime = line.startTime;
    const lineEndTime = line.endTime;
    const exitStart = Math.max(line.endTime + 0.05, shotEnd - 0.35);

    // Camera keyframes
    const heroIdx = phrases.findIndex(p => p.role === 'hero');
    const heroPhrase = phrases[heroIdx >= 0 ? heroIdx : 0];

    const camXStart = (heroPhrase.relX - 0.5) * -0.08;
    const camYStart = (heroPhrase.relY - 0.5) * -0.06;
    const camXEnd = camXStart + (lineIndex % 2 === 0 ? 0.03 : -0.03);
    const camYEnd = camYStart + (isChorus ? -0.02 : 0.02);

    const zoomStart = isChorus ? 1.08 : 0.98;
    const zoomEnd = isChorus ? 1.15 : 1.04;
    const rotStart = (lineIndex % 2 === 0 ? -1 : 1) * 0.008;
    const rotEnd = (lineIndex % 2 === 0 ? 1 : -1) * 0.006;

    shots.push({
      id: `syzygy-shot-${lineIndex}`,
      lineIndex,
      start: shotStart,
      end: shotEnd,
      lineStartTime,
      lineEndTime,
      exitStart,
      kind,
      phrases,
      hero: heroIdx >= 0 ? heroIdx : 0,
      orbitAngle: ((lineIndex * 73) % 360) * (Math.PI / 180),
      camera: { x: camXStart, y: camYStart, zoom: zoomStart, rotation: rotStart },
      cameraEnd: { x: camXEnd, y: camYEnd, zoom: zoomEnd, rotation: rotEnd },
    });
  });

  return shots;
}
