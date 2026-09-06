import type { Line } from '../vendor/folia/types';
import { buildLineGraphemeTimeline } from '../vendor/folia/utils/lyrics/graphemeTiming';
import { buildLineRenderHints } from '../vendor/folia/utils/lyrics/renderHints';

const CJK = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const CONNECTOR = /^[\-'’‐‑‒–]$/u;
const OPENING_PUNCTUATION = /^[([{“‘«‹]$/u;

interface WaypointUnit { text: string; startTime: number; endTime: number; latin: boolean }

// CJK lyrics travel one grapheme at a time. Latin-script lyrics travel by word,
// because individual letters are not meaningful visual beats in a 3D camera path.
function spatialUnits(line: Line): WaypointUnit[] {
  const timeline = buildLineGraphemeTimeline(line);
  const units: WaypointUnit[] = [];
  let activeLatin = -1;
  let prefix: typeof timeline = [];
  const append = (unit: WaypointUnit, glyph: (typeof timeline)[number]) => {
    unit.text += glyph.char;
    unit.startTime = Math.min(unit.startTime, glyph.startTime);
    unit.endTime = Math.max(unit.endTime, glyph.endTime);
  };
  const create = (glyph: (typeof timeline)[number], latin: boolean) => {
    const pending = prefix; prefix = [];
    const unit: WaypointUnit = { text: '', startTime: glyph.startTime, endTime: glyph.endTime, latin };
    pending.forEach(item => append(unit, item)); append(unit, glyph); units.push(unit);
    return units.length - 1;
  };

  for (const glyph of timeline) {
    const char = glyph.char;
    if (/^\s+$/u.test(char)) { activeLatin = -1; continue; }
    if (CJK.test(char)) { create(glyph, false); activeLatin = -1; continue; }
    if (WORD_CHAR.test(char)) {
      if (activeLatin >= 0) append(units[activeLatin], glyph);
      else activeLatin = create(glyph, true);
      continue;
    }
    if (CONNECTOR.test(char) && activeLatin >= 0) { append(units[activeLatin], glyph); continue; }
    if (OPENING_PUNCTUATION.test(char)) { prefix.push(glyph); activeLatin = -1; continue; }
    if (/^\p{P}+$/u.test(char) && units.length) { append(units[activeLatin >= 0 ? activeLatin : units.length - 1], glyph); continue; }
    create(glyph, false); activeLatin = -1;
  }
  if (prefix.length) {
    if (units.length) prefix.forEach(glyph => append(units[units.length - 1], glyph));
    else units.push({ text: prefix.map(glyph => glyph.char).join(''), startTime: prefix[0].startTime, endTime: prefix.at(-1)!.endTime, latin: false });
  }
  return units;
}

// Feed the original Diorama one language-aware spatial unit per waypoint.
export function glyphWaypoints(lines: Line[]): Line[] {
  return lines.flatMap((line, lineIndex) => spatialUnits(line).map((unit, index) => {
    const endTime = Math.max(unit.startTime + 0.01, unit.endTime);
    const waypoint: Line = { ...line, id: `${line.id ?? lineIndex}:waypoint:${index}`, fullText: unit.text,
      startTime: unit.startTime, endTime,
      words: [{ text: unit.text, startTime: unit.startTime, endTime }] };
    waypoint.renderHints = buildLineRenderHints(waypoint);
    return waypoint;
  }));
}
