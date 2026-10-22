// Preserve SYLT word events by aligning against a matching USLT text, never treating each glyph as a line.
import type { LyricLine } from '../domain/model';
interface Tag { language?: string; text?: string; timeStampFormat?: number; syncText?: { text: string; timestamp?: number }[] }
export type EmbeddedCandidateKind = 'wordSync' | 'sync' | 'syncFragment' | 'frameSync' | 'plainText';
export interface EmbeddedCandidate {
  text: string;
  label: string;
  kind?: EmbeddedCandidateKind;
  language?: string;
}

export function formatCandidateLabel(candidate: EmbeddedCandidate, t: (key: string) => string): string {
  if (!candidate.kind) return candidate.label;
  const lang = candidate.language || t('embedded.unlabeledLanguage');
  const kindLabel = t(`embedded.${candidate.kind}`);
  return `${lang} · ${kindLabel}`;
}
const normalized = (s: string) => s.replace(/\s/g, '');
const stamp = (ms: number) => { const t = Math.max(0, ms / 1000); return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`; };

const sectionHeading = /^\s*\[(?!\d{1,3}:)[^\]]+\]\s*$/u;

/**
 * Reapply a trustworthy plain-lyric line layout to an already timed lyric.
 * This repairs provider hard wraps such as "your sle" / "eve" while keeping
 * the first and last timestamps covered by each restored line.
 */
export function realignTimedLinesToPlain(lines: LyricLine[], plain: string): LyricLine[] | null {
  if (!lines.length || lines.some(line => line.start === null || line.end === null) || /\[\d{1,3}:\d{2}/u.test(plain)) return null;
  const rows = plain.split(/\r?\n/u).map(row => row.trim()).filter(row => row && !sectionHeading.test(row));
  const compact = (value: string) => value.replace(/\s/gu, '');
  if (!rows.length || compact(lines.map(line => line.text).join('')) !== compact(rows.join(''))) return null;

  let sourceCursor = 0;
  const spans = lines.map(line => {
    const start = sourceCursor;
    sourceCursor += compact(line.text).length;
    return { line, start, end: sourceCursor };
  });
  let targetCursor = 0;
  return rows.map((text, index) => {
    const start = targetCursor;
    targetCursor += compact(text).length;
    const contributors = spans.filter(span => span.end > start && span.start < targetCursor);
    const first = contributors[0]?.line;
    const last = contributors.at(-1)?.line;
    return {
      id: first?.id ?? `aligned-${index}`,
      text,
      start: first!.start,
      end: last!.end,
      precision: contributors.some(({ line }) => line.precision === 'manual') ? 'manual' : 'imported',
      words: [],
    };
  });
}

export function normalizeEmbedded(tags: Tag[]): EmbeddedCandidate[] {
  const candidates: EmbeddedCandidate[] = [];
  const add = (text: string, label: string, kind?: EmbeddedCandidateKind, language?: string) => {
    if (text.trim() && !candidates.some(c => c.text === text)) {
      candidates.push({ text, label, kind, language });
    }
  };
  for (const tag of tags) {
    const events = tag.syncText?.filter(e => typeof e.timestamp === 'number' && Number.isFinite(e.timestamp)) ?? [];
    if (events.length && tag.timeStampFormat !== 1) {
      const allText = events.map(e => e.text).join('');
      const plain = tags.find(t => t.text && normalized(t.text) === normalized(allText))?.text;
      if (plain) {
        const timedChars = events.flatMap(e => Array.from(e.text).filter(c => !/\s/.test(c)).map(char => ({ char, ms: e.timestamp! })));
        let cursor = 0;
        const rows = plain.split(/\r?\n/).filter(l => l.trim()).map(line => {
          const first = timedChars[cursor]?.ms ?? 0; let last = -1, result = `[${stamp(first)}]`;
          for (const char of Array.from(line)) { if (/\s/.test(char)) { result += char; continue; } const event = timedChars[cursor++]; if (event.ms !== last) { result += `<${stamp(event.ms)}>`; last = event.ms; } result += char; }
          return result;
        });
        add(rows.join('\n'), `${tag.language || '未标注语言'} · 逐字同步（保留原文分行）`, 'wordSync', tag.language);
      } else {
        // Explicit newlines are trustworthy boundaries. Otherwise retain the original event units.
        const hasNewlines = events.some(e => /[\r\n]/.test(e.text));
        if (hasNewlines) {
          let rows = '', needsStart = true;
          for (const event of events) {
            for (const part of event.text.split(/(\r?\n)/)) {
              if (/\n/.test(part)) { rows += '\n'; needsStart = true; }
              else if (part) {
                if (needsStart) rows += `[${stamp(event.timestamp!)}]`;
                rows += `<${stamp(event.timestamp!)}>${part}`;
                needsStart = false;
              }
            }
          }
          add(rows, `${tag.language || '未标注语言'} · 同步歌词`, 'sync', tag.language);
        } else {
          add(events.filter(e => e.text.trim()).map(e => `[${stamp(e.timestamp!)}]${e.text}`).join('\n'), `${tag.language || '未标注语言'} · 同步片段（请检查分行）`, 'syncFragment', tag.language);
        }
      }
    } else if (events.length) {
      add(events.map(e => e.text).join(''), `${tag.language || '未标注语言'} · 帧时间戳（需校时）`, 'frameSync', tag.language);
    }
    if (tag.text) {
      const isSync = /\[\d+:/.test(tag.text);
      add(tag.text, `${tag.language || '未标注语言'} · ${isSync ? '同步歌词' : '纯文本'}`, isSync ? 'sync' : 'plainText', tag.language);
    }
  }
  return candidates;
}
