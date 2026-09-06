import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline } from '../vendor/folia/utils/lyrics/graphemeTiming';
import { buildLineRenderHints } from '../vendor/folia/utils/lyrics/renderHints';
// Feed original Diorama one grapheme per waypoint; its Three.js scene and camera remain unchanged.
export function glyphWaypoints(lines: Line[]): Line[] {
  return lines.flatMap((line, lineIndex) => buildLineGraphemeTimeline(line).filter(g => g.char.trim()).map((g, index) => {
    const glyph: Line = { ...line, id: `${line.id ?? lineIndex}:glyph:${index}`, fullText: g.char,
      startTime: g.startTime, endTime: Math.max(g.startTime + 0.01, g.endTime),
      words: [{ text: g.char, startTime: g.startTime, endTime: Math.max(g.startTime + 0.01, g.endTime) }] };
    glyph.renderHints = buildLineRenderHints(glyph);
    return glyph;
  }));
}
