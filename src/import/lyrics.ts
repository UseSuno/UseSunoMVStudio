import type { LyricLine, Word } from '../domain/model';
// Parse source timestamps without inventing word-level accuracy.
const timestamp = /\[(\d+):(\d{2}(?:[.:]\d{1,3})?)\]/g;
const seconds = (m: string, s: string) => Number(m) * 60 + Number(s.replace(/:(\d+)$/, '.$1'));
export function parseLyrics(source: string, duration: number): { lines: LyricLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const lines: LyricLine[] = [];
  for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const row = raw.trim();
    if (!row || /^\[(ar|ti|al|by|offset|length|re|ve):/i.test(row)) continue;
    const stamps = [...row.matchAll(timestamp)];
    const text = row.replace(timestamp, '').replace(/<\d+:\d{2}(?:\.\d{1,3})?>/g, '').trim();
    if (!text) continue;
    if (!stamps.length) { lines.push({ id: `line-${lines.length}`, text, start: null, end: null, precision: 'untimed', words: [] }); continue; }
    const wordTags = [...row.matchAll(/<(\d+):(\d{2}(?:\.\d{1,3})?)>([^<]*)/g)];
    for (const stamp of stamps) {
      const start = Math.max(0, seconds(stamp[1], stamp[2]) + offset);
      const shift = seconds(stamp[1], stamp[2]) - seconds(stamps[0][1], stamps[0][2]);
      const words: Word[] = wordTags.map((w, i) => ({ text: w[3], start: Math.max(0, seconds(w[1], w[2]) + offset + shift), end: wordTags[i + 1] ? Math.max(0, seconds(wordTags[i + 1][1], wordTags[i + 1][2]) + offset + shift) : -1 })).filter(w => w.text.length > 0);
      lines.push({ id: `line-${lines.length}`, text, start, end: null, precision: 'imported', words });
    }
  }
  lines.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; if (l.start === null) continue;
    const next = lines.slice(i + 1).find(x => x.start !== null && x.start > l.start!);
    l.end = Math.max(l.start + 0.1, Math.min(next?.start ?? duration, l.start + 8));
    l.words = l.words.map(w => ({ ...w, end: w.end < 0 ? l.end! : w.end }));
    if (l.start >= duration) warnings.push(`「${l.text.slice(0, 12)}」超出音频时长，请校时。`);
  }
  if (lines.some(l => l.start === null)) warnings.push('无时间轴的歌词需要逐行打点，或先生成估算时间。');
  if (lines.some(l => l.start !== null && !l.words.length)) warnings.push('句末时间由下一句推算，最长保留 8 秒；可在编辑器调整。');
  return { lines, warnings };
}
export function estimateTiming(lines: LyricLine[], duration: number): LyricLine[] {
  const step = duration / Math.max(lines.length, 1);
  return lines.map((l, i) => ({ ...l, start: i * step, end: (i + 1) * step, precision: 'estimated', words: [] }));
}
export function toLrc(lines: LyricLine[], offset = 0) {
  return lines.map(l => { if (l.start === null) return l.text; const t = Math.max(0, l.start + offset); return `[${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}]${l.text}`; }).join('\n');
}
