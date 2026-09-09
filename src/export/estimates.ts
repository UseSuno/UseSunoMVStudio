import type { Project } from '../domain/model';
import type { ExportOptions } from './video';
const storageKey = 'verse-export-throughput-v1';
type RecordEntry = { fps: number; date: number };
const keyFor = (project: Project, options: ExportOptions) => JSON.stringify([project.template, project.background, project.ratio, options.height, options.fps, options.format, options.captureMethod ?? 'standard', options.captureMethod === 'layered' && options.textCache ? 'text-cache-masks-v3' : false, project.lines.some(line => line.start !== null && line.end !== null && line.start + project.offset < options.end && line.end + project.offset > options.start), project.font, project.fontScale, project.intensity, project.audioReactivity, project.audioReactivityAmount]);
function read(): Record<string, RecordEntry> {
  try { const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function rememberThroughput(project: Project, options: ExportOptions, fps: number) {
  if (!Number.isFinite(fps) || fps <= 0) return;
  try {
    const records = read(); records[keyFor(project, options)] = { fps, date: Date.now() };
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(records).filter(([, value]) => Number.isFinite(value?.date)).sort((a, b) => b[1].date - a[1].date).slice(0, 40))));
  } catch { /* Export remains available when local storage is full or disabled. */ }
}
export function estimatedSeconds(project: Project, options: ExportOptions) {
  const entry = read()[keyFor(project, options)];
  if (!entry || !Number.isFinite(entry.fps) || entry.fps <= 0 || Date.now() - entry.date > 30 * 86400000) return undefined;
  return Math.ceil((options.end - options.start) * options.fps / entry.fps);
}
