import type { LyricLine, Word } from '../domain/model';

export interface TimingToken { id: string; lineIndex: number; text: string; time: number | null }

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
    const units = tokenizeLine(line.text);
    const existing = line.words.length === units.length ? line.words : [];
    return units.map((text, index) => ({ id: `${line.id}:${index}`, lineIndex, text, time: existing[index]?.start ?? null }));
  });
}

export function applyTokenTimes(lines: LyricLine[], tokens: TimingToken[], duration: number): LyricLine[] {
  return lines.map((line, lineIndex) => {
    const lineTokens = tokens.filter(token => token.lineIndex === lineIndex);
    const own = lineTokens.filter(token => token.time !== null);
    if (!lineTokens.length || own.length !== lineTokens.length) return { ...line, start: null, end: null, words: [], precision: 'untimed' };
    const next = tokens.find(token => token.lineIndex > lineIndex && token.time !== null)?.time ?? duration;
    const end = Math.max(own[own.length - 1].time! + 0.08, next);
    const words: Word[] = own.map((token, index) => ({ text: token.text, start: token.time!, end: own[index + 1]?.time ?? end }));
    return { ...line, start: own[0].time!, end, words, precision: 'manual' };
  });
}
