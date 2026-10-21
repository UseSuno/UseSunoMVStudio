import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline, type GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';

export type AstralShotKind = 'celestial-ellipse' | 'constellation-stream' | 'cosmic-cross' | 'supernova-core';
export type AstralEnterStyle = 'crystallize' | 'orbit-glide' | 'gravity-float';

export interface AstralGlyph extends GraphemeTiming {
  indexInPhrase: number;
}

export interface AstralPhrase {
  text: string;
  glyphs: AstralGlyph[];
  start: number;
  end: number;
  role: 'hero' | 'support';
  enterStyle: AstralEnterStyle;
  relX: number;
  relY: number;
  fontScale: number;
  orbitAngle: number;
}

export interface AstralCameraKey {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface AstralShot {
  id: string;
  lineIndex: number;
  start: number;
  end: number;
  lineStartTime: number;
  lineEndTime: number;
  exitStart: number;
  kind: AstralShotKind;
  phrases: AstralPhrase[];
  hero: number;
  orbitRadius: number;
  orbitTilt: number;
  chapter: number;
  camera: AstralCameraKey;
  cameraEnd: AstralCameraKey;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOutExpo = (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export const easeSoftBack = (x: number): number => {
  const c = 0.5;
  const t = clamp01(x);
  return t === 1 ? 1 : Math.pow(t, 2) * ((c + 1) * t - c) * 0.4 + (1 - Math.pow(1 - t, 3)) * 0.6;
};

// Continuous camera evaluation along 3D orbital curve
export const resolveAstralCameraFrame = (shot: AstralShot, progress: number): AstralCameraKey => {
  const p = clamp01(progress);
  const t = p * 0.5 + easeInOutCubic(p) * 0.5 + Math.max(0, progress - 1) * 0.2;
  return {
    x: shot.camera.x + (shot.cameraEnd.x - shot.camera.x) * t,
    y: shot.camera.y + (shot.cameraEnd.y - shot.camera.y) * t,
    zoom: shot.camera.zoom + (shot.cameraEnd.zoom - shot.camera.zoom) * t,
    rotation: shot.camera.rotation + (shot.cameraEnd.rotation - shot.camera.rotation) * t,
  };
};

export function compileAstralShots(lines: Line[]): AstralShot[] {
  const shots: AstralShot[] = [];
  let chapter = 0;

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0 && line.startTime - lines[lineIndex - 1].endTime > 1.7) {
      chapter++;
    }

    const allGlyphs = buildLineGraphemeTimeline(line);
    if (!allGlyphs.length) return;

    // Filter out slashes from glyphs - slashes are purely phrase delimiters and do not count toward characters
    const cleanGlyphs = allGlyphs.filter(g => g.char !== '/');
    if (!cleanGlyphs.length) return;

    const text = line.fullText;
    let groups: string[] = [];

    if (line.wordSegments && line.wordSegments.length > 0) {
      groups = line.wordSegments.map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else if (text.includes('/')) {
      groups = text.split('/').map(s => s.replace(/\//g, '').trim()).filter(Boolean);
    } else {
      // Single continuous sentence without splitting into arbitrary overlapping fragments
      groups = [text.replace(/\//g, '').trim()].filter(Boolean);
      if (!groups.length) groups = [text];
    }

    let cursor = 0;
    const phrasesInLine: { text: string; glyphs: AstralGlyph[]; start: number; end: number }[] = [];
    for (const group of groups) {
      const cleanGroup = group.replace(/\//g, '');
      const groupChars = Array.from(cleanGroup);
      const timed: AstralGlyph[] = [];
      let charIdx = 0;

      while (cursor < cleanGlyphs.length && charIdx < groupChars.length) {
        const g = cleanGlyphs[cursor++];
        if (g.char === groupChars[charIdx]) {
          timed.push({ ...g, indexInPhrase: timed.length });
          charIdx++;
        } else if (/^\s+$/.test(g.char) && groupChars[charIdx] !== ' ') {
          // Skip stray whitespace between slash-delimited phrases
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
          start: timed[0]?.startTime ?? line.startTime,
          end: timed.at(-1)?.endTime ?? line.endTime,
        });
      }
    }

    if (cursor < cleanGlyphs.length) {
      const remaining = cleanGlyphs.slice(cursor).filter(g => !/^\s+$/.test(g.char));
      if (remaining.length > 0) {
        const last = phrasesInLine[phrasesInLine.length - 1];
        if (last) {
          remaining.forEach(g => {
            last.glyphs.push({ ...g, indexInPhrase: last.glyphs.length });
            last.text += g.char;
            last.end = Math.max(last.end, g.endTime);
          });
        }
      }
    }

    if (!phrasesInLine.length) return;

    // Exactly 1 shot per lyric line! The camera cruises smoothly across the entire line duration
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

    let hero = Math.floor(phrasesInLine.length / 2);
    phrasesInLine.forEach((p, i) => {
      const dur = p.end - p.start;
      const heroDur = phrasesInLine[hero].end - phrasesInLine[hero].start;
      if (dur > heroDur + 0.01) {
        hero = i;
      }
    });

    const kinds: AstralShotKind[] = ['celestial-ellipse', 'constellation-stream', 'cosmic-cross', 'supernova-core'];
    const kind = kinds[(lineIndex + chapter) % kinds.length];

    const orbitRadii = [0.38, 0.44, 0.35, 0.46];
    const orbitTilts = [0.35, -0.40, 0.26, -0.32];
    const orbitRadius = orbitRadii[lineIndex % orbitRadii.length];
    const orbitTilt = orbitTilts[lineIndex % orbitTilts.length];

    const enterStyles: AstralEnterStyle[] = ['crystallize', 'orbit-glide', 'gravity-float'];
    const n = phrasesInLine.length;

    const phrases: AstralPhrase[] = phrasesInLine.map((p, i) => {
      const role: 'hero' | 'support' = i === hero ? 'hero' : 'support';
      const enterStyle = enterStyles[(lineIndex + i) % enterStyles.length];
      const orbitAngle = ((i - (phrasesInLine.length - 1) / 2) * 0.45);

      let relX = 0;
      let relY = 0;
      let fontScale = role === 'hero' ? 1.32 : 0.88;

      if (n === 1) {
        if (kind === 'celestial-ellipse') {
          relX = 0.00;
          relY = -0.02;
          fontScale = 1.35;
        } else if (kind === 'constellation-stream') {
          relX = -0.02;
          relY = 0.02;
          fontScale = 1.35;
        } else if (kind === 'cosmic-cross') {
          relX = 0.02;
          relY = 0.02;
          fontScale = 1.32;
        } else {
          // supernova-core
          relX = 0.00;
          relY = 0.00;
          fontScale = 1.35;
        }
      } else if (kind === 'celestial-ellipse') {
        relX = Math.sin(orbitAngle) * 0.05;
        relY = (i - (n - 1) / 2) * Math.min(0.20, 0.50 / Math.max(1, n));
        fontScale = role === 'hero' ? 1.28 : 0.90;
      } else if (kind === 'constellation-stream') {
        relX = (i % 2 === 0 ? -0.04 : 0.04);
        relY = (i - (n - 1) / 2) * Math.min(0.20, 0.50 / Math.max(1, n));
        fontScale = role === 'hero' ? 1.28 : 0.90;
      } else if (kind === 'cosmic-cross') {
        relX = (i % 2 === 0 ? -0.05 : 0.05);
        relY = (i - (n - 1) / 2) * Math.min(0.20, 0.50 / Math.max(1, n));
        fontScale = role === 'hero' ? 1.25 : 0.90;
      } else {
        // supernova-core
        relX = 0;
        relY = (i - (n - 1) / 2) * Math.min(0.20, 0.50 / Math.max(1, n));
        fontScale = role === 'hero' ? 1.30 : 0.88;
      }

      return {
        ...p,
        role,
        enterStyle,
        relX,
        relY,
        fontScale,
        orbitAngle,
      };
    });

    const camera: AstralCameraKey = {
      x: -0.02 + (lineIndex % 3) * 0.02,
      y: 0.015 - (lineIndex % 2) * 0.03,
      zoom: 0.985,
      rotation: orbitTilt * 0.25,
    };
    const cameraEnd: AstralCameraKey = {
      x: -camera.x * 0.85,
      y: -camera.y * 0.85,
      zoom: 1.025,
      rotation: orbitTilt * 0.5,
    };

    shots.push({
      id: `astral:${line.id || lineIndex}`,
      lineIndex,
      start: shotStart,
      end: Math.max(shotStart + 0.05, shotEnd),
      lineStartTime,
      lineEndTime,
      exitStart,
      kind,
      phrases,
      hero,
      orbitRadius,
      orbitTilt,
      chapter,
      camera,
      cameraEnd,
    });
  });

  return shots;
}
