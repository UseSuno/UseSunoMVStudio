import type { LyricLine, Word } from '../domain/model';

export interface TimingToken { id: string; lineIndex: number; text: string; time: number | null }

// Tokens keep the project's lyric clock; every visible timestamp uses the audio clock.
export const toMediaTime = (lyricTime: number, offset: number) => lyricTime + offset;
export const toLyricTime = (mediaTime: number, offset: number) => mediaTime - offset;
export function timingTimeError(mediaTime: number, duration: number, offset: number): 'invalidTime' | 'beforeOffset' | null {
  if (!Number.isFinite(mediaTime) || mediaTime < 0 || mediaTime >= duration) return 'invalidTime';
  // Project files cannot represent negative lyric times. Never silently move a tap.
  return toLyricTime(mediaTime, offset) < 0 ? 'beforeOffset' : null;
}

export function tokenizeLine(text: string) {
  const tokens: string[] = []; let word = '';
  const flush = () => { if (word) tokens.push(word); word = ''; };
  for (const char of Array.from(text)) {
    if (/\s/u.test(char)) { flush(); continue; }
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) { flush(); tokens.push(char); }
    else word += char;
  }
  flush(); return tokens;
}

export function tokensFromLines(lines: LyricLine[]): TimingToken[] {
  return lines.flatMap((line, lineIndex) => {
    const normalize = (text: string) => text.replace(/\s/gu, '');
    const existing = line.words.length && normalize(line.words.map(word => word.text).join('')) === normalize(line.text) ? line.words : [];
    const units = existing.length ? existing.map(word => word.text) : tokenizeLine(line.text);
    return units.map((text, index) => ({ id: `${line.id}:${index}`, lineIndex, text, time: existing[index]?.start ?? (index === 0 ? line.start : null) }));
  });
}

export function applyTokenTimes(lines: LyricLine[], tokens: TimingToken[], duration: number, offset = 0): LyricLine[] {
  const lyricEnd = toLyricTime(duration, offset);
  return lines.map((line, lineIndex) => {
    const lineTokens = tokens.filter(token => token.lineIndex === lineIndex);
    const own = lineTokens.filter(token => token.time !== null);
    // Partial drafts stay in the timing workspace; never erase an imported line.
    if (!lineTokens.length || own.length !== lineTokens.length) return line;
    if (own.some((token, index) => timingTimeError(toMediaTime(token.time!, offset), duration, offset) || (index > 0 && token.time! < own[index - 1].time!))) return line;
    if (line.words.length === own.length && own.every((token, index) => token.text === line.words[index].text && token.time === line.words[index].start)) return line;
    const next = tokens.find(token => token.lineIndex > lineIndex && token.time !== null)?.time ?? lyricEnd;
    const last = own[own.length - 1].time!;
    if (next < last) return line;
    const end = Math.min(lyricEnd, line.end !== null && line.end > last && line.end <= next ? line.end : Math.max(last + 0.08, next));
    const words: Word[] = own.map((token, index) => ({ text: token.text, start: token.time!, end: own[index + 1]?.time ?? end }));
    return { ...line, start: own[0].time!, end, words, precision: 'manual' };
  });
}

/** Interpolate only within a line with an anchor, preserving untimed drafts. */
export function previewTimes(lines: LyricLine[], tokens: TimingToken[], duration: number, offset = 0): (number | null)[] {
  const times = tokens.map(token => token.time === null ? null : toMediaTime(token.time, offset));
  lines.forEach((line, lineIndex) => {
    const indices = tokens.flatMap((token, index) => token.lineIndex === lineIndex ? [index] : []);
    if (!indices.length) return;
    const first = indices[0];
    if (times[first] === null) times[first] = line.start === null ? null : toMediaTime(line.start, offset);
    if (times[first] === null) return;
    const nextStart = tokens.find(token => token.lineIndex > lineIndex && token.time !== null)?.time;
    const nextLine = nextStart == null ? duration : toMediaTime(nextStart, offset);
    const end = line.end === null ? nextLine : toMediaTime(line.end, offset);
    for (let i = 1; i < indices.length; i++) {
      if (times[indices[i]] !== null) continue;
      const previous = i - 1;
      let next = i;
      while (next < indices.length && times[indices[next]] === null) next++;
      const startTime = times[indices[previous]]!;
      const endTime = next < indices.length ? times[indices[next]]! : end;
      for (; i < next; i++) times[indices[i]] = startTime + Math.max(0, endTime - startTime) * (i - previous) / (next - previous);
      i--;
    }
  });
  return times;
}

export function parseTimingInput(value: string): number | null {
  const source = value.trim().replace(',', '.');
  if (!source) return null;
  if (!/^(?:\d+:)?\d+(?:\.\d{1,3})?$/.test(source)) return NaN;
  const parts = source.split(':').map(Number);
  if (parts.length > 1 && parts[1] >= 60) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}
