import type { Project } from '../domain/model';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Times are media times, including the user's lyric offset. Never retime lyrics. */
export function introEnd(project: Project): number {
  if (project.autoIntro === false) return 0;
  if (project.template === 'folia-monet' || project.template === 'folia-cappella') return 0;
  if (!project.title.trim() && !project.artist.trim()) return 0;
  const starts = project.lines.filter(line => line.text.trim() && line.start !== null && line.end !== null && Number.isFinite(line.start) && Number.isFinite(line.end)).map(line => line.start! + project.offset);
  const end = Math.max(0, Math.min(project.duration, starts.length ? Math.min(...starts) : project.duration));
  return end >= 3 ? end : 0;
}

export function introFrame(mediaTime: number, end: number) {
  const active = Number.isFinite(mediaTime) && end >= 3 && mediaTime >= 0 && mediaTime < end;
  return {
    active,
    opacity: active ? smooth((end - mediaTime) / .7) : 0,
    // Long instrumental openings settle into a quiet lower-left credit.
    compact: end > 10 ? smooth((mediaTime - 5) / 1.5) : 0,
    entrance: smooth(mediaTime / .8),
  };
}

/** Unicode-safe wrapping, including CJK and titles without spaces. */
export function wrapIntroText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.trim()), item => item.segment);
  const lines: string[] = [];
  let line = '';
  for (const segment of segments) {
    if (line && measure(line + segment) > maxWidth) { lines.push(line.trimEnd()); line = ''; }
    line += segment;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
