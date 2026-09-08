import type { Project } from '../domain/model';
import type { TimingToken } from './timing';

// A synchronous recovery copy protects the last tap while IndexedDB is saving.
const key = 'usesuno-mv-timing-draft';
const identity = (p: Project) => JSON.stringify([p.audioName, p.duration, p.lines.map(l => [l.id, l.text])]);
const signature = (p: Project) => JSON.stringify(p.lines.map(l => [l.start, l.end, l.words]));
export function writeTimingDraft(base: Project, next: Project, tokens: TimingToken[], cursor: number, segments: Record<string, string>) {
  localStorage.setItem(key, JSON.stringify({ identity: identity(base), offset: base.offset, before: signature(base), after: signature(next), tokens, cursor, segments }));
}
export function readTimingDraft(project: Project, expected: TimingToken[]): { tokens: TimingToken[]; cursor: number; segments: Record<string, string> } | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (!d || d.identity !== identity(project) || ![d.before, d.after].includes(signature(project))) return null;
    if (d.offset !== undefined && d.offset !== project.offset) return null;
    if (!Array.isArray(d.tokens) || d.tokens.length !== expected.length || d.tokens.some((token: TimingToken, i: number) => token.id !== expected[i].id || token.text !== expected[i].text || token.lineIndex !== expected[i].lineIndex || (token.time !== null && (!Number.isFinite(token.time) || token.time < 0 || (token.time !== expected[i].time && (token.time + project.offset < 0 || token.time + project.offset >= project.duration)))))) return null;
    if (!Number.isInteger(d.cursor) || d.cursor < 0 || d.cursor > expected.length) return null;
    const segments = Object.fromEntries(project.lines.flatMap(line => typeof d.segments?.[line.id] === 'string' ? [[line.id, d.segments[line.id]]] : []));
    return { tokens: d.tokens, cursor: d.cursor, segments };
  } catch { return null; }
}
