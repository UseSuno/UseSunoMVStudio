import type { Project } from '../domain/model';
import type { Line, Theme } from '../vendor/folia/types';
import { buildLineRenderHints } from '../vendor/folia/utils/lyrics/renderHints';
import { fontFamily, fontStack } from '../fonts/fonts';

const CONNECTOR = /^[\-'’‐‑‒–]$/u;
const OPENING_PUNCTUATION = /^[([{“‘«‹]$/u;

/**
 * Produce timing units without charging whitespace and punctuation a full beat.
 * Intl.Segmenter deliberately returns both, which is useful for layout but made
 * English estimated lyrics hesitate at every space in the Aurora traversal.
 */
export function estimatedLyricUnits(text: string): string[] {
  const Segmenter = typeof Intl !== 'undefined' ? Intl.Segmenter : undefined;
  if (!Segmenter) return text.trim().split(/\s+/u).filter(Boolean);
  const parts = Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text));
  const units: string[] = [];
  let prefix = '';
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (/^\s+$/u.test(part.segment)) continue;
    if (part.isWordLike) {
      units.push(prefix + part.segment);
      prefix = '';
      continue;
    }
    const next = parts[index + 1];
    const previous = parts[index - 1];
    const joinsWords = CONNECTOR.test(part.segment)
      && Boolean(previous?.isWordLike && next?.isWordLike)
      && previous!.index + previous!.segment.length === part.index
      && part.index + part.segment.length === next!.index;
    if (joinsWords && units.length) {
      units[units.length - 1] += part.segment + next!.segment;
      index += 1;
    } else if (OPENING_PUNCTUATION.test(part.segment) && next?.isWordLike) {
      prefix += part.segment;
    } else if (units.length) {
      units[units.length - 1] += part.segment;
    } else {
      prefix += part.segment;
    }
  }
  if (prefix) units.push(prefix);
  return units.length ? units : [text];
}

// Studio metadata adapts to Folia's existing renderer contract, without changing its animation implementation.
export function foliaLines(project: Project): Line[] {
  return project.lines.filter(l => l.start !== null && l.end !== null).map(l => {
    const estimatedUnits = project.estimatedReveal ? estimatedLyricUnits(l.text) : [];
    const words = l.words.length ? l.words.map(w => ({ text: w.text, startTime: w.start, endTime: w.end })) : estimatedUnits.length ? estimatedUnits.map((text, i) => ({ text, startTime: l.start! + (l.end! - l.start!) * i / estimatedUnits.length, endTime: l.start! + (l.end! - l.start!) * (i + 1) / estimatedUnits.length })) : [{ text: l.text, startTime: l.start!, endTime: l.end! }];
    const line: Line = { id: l.id, fullText: l.text, startTime: l.start!, endTime: l.end!, words, wordSegments: l.wordSegments };
    line.renderHints = buildLineRenderHints(line); return line;
  }).sort((a, b) => a.startTime - b.startTime);
}
export function foliaTheme(p: Project): Theme {
  const schemes = { midnight: { backgroundColor: '#0d1424', primaryColor: '#e6e9ef', accentColor: '#e9c56b', secondaryColor: '#67b9de' }, paper: { backgroundColor: '#ece7db', primaryColor: '#292e34', accentColor: '#b75b3f', secondaryColor: '#6b8477' }, moss: { backgroundColor: '#102d2c', primaryColor: '#e5ecd6', accentColor: '#d4e595', secondaryColor: '#70b8b1' } };
  return { name: `Verse ${p.palette}`, ...schemes[p.palette], fontStyle: p.font === 'serif' || p.font === 'noto-serif-sc' || p.font === 'playfair-display' ? 'serif' : 'sans', fontFamily: fontFamily(p), fontFamilyStack: fontStack(p), animationIntensity: p.intensity < 0.7 ? 'calm' : p.intensity > 1.3 ? 'chaotic' : 'normal' };
}
