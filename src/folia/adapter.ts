import type { Project } from '../domain/model';
import type { Line, Theme } from '../vendor/folia/types';
import { buildLineRenderHints } from '../vendor/folia/utils/lyrics/renderHints';
import { fontFamily, fontStack } from '../fonts/fonts';
// Studio metadata adapts to Folia's existing renderer contract, without changing its animation implementation.
export function foliaLines(project: Project): Line[] {
  return project.lines.filter(l => l.start !== null && l.end !== null).map(l => {
    const words = l.words.length ? l.words.map(w => ({ text: w.text, startTime: w.start, endTime: w.end })) : project.estimatedReveal ? Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(l.text)).map((s, i, all) => ({ text: s.segment, startTime: l.start! + (l.end! - l.start!) * i / all.length, endTime: l.start! + (l.end! - l.start!) * (i + 1) / all.length })) : [{ text: l.text, startTime: l.start!, endTime: l.end! }];
    const line: Line = { id: l.id, fullText: l.text, startTime: l.start!, endTime: l.end!, words, wordSegments: l.wordSegments };
    line.renderHints = buildLineRenderHints(line); return line;
  }).sort((a, b) => a.startTime - b.startTime);
}
export function foliaTheme(p: Project): Theme {
  const schemes = { midnight: { backgroundColor: '#0d1424', primaryColor: '#e6e9ef', accentColor: '#e9c56b', secondaryColor: '#67b9de' }, paper: { backgroundColor: '#ece7db', primaryColor: '#292e34', accentColor: '#b75b3f', secondaryColor: '#6b8477' }, moss: { backgroundColor: '#102d2c', primaryColor: '#e5ecd6', accentColor: '#d4e595', secondaryColor: '#70b8b1' } };
  return { name: `Verse ${p.palette}`, ...schemes[p.palette], fontStyle: p.font === 'serif' || p.font === 'noto-serif-sc' || p.font === 'playfair-display' ? 'serif' : 'sans', fontFamily: fontFamily(p), fontFamilyStack: fontStack(p), animationIntensity: p.intensity < 0.7 ? 'calm' : p.intensity > 1.3 ? 'chaotic' : 'normal' };
}
