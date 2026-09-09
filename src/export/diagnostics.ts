import type { Project } from '../domain/model';
import type { ExportOptions } from './video';
import type { TextCaptureStats } from '../folia/layerPackets';

const storageKey = 'verse-export-diagnostics-v1';
export interface ExportDiagnostics {
  version: 3; createdAt: string; status: 'complete' | 'canceled' | 'failed';
  settings: { template: string; background: string; ratio: string; height: number; fps: number; format: string; start: number; end: number; captureMethod: string; textCache: boolean };
  totalMs: number; initializationMs: number; processingMs: number; finalizationMs: number; cleanupMs: number;
  completedFrames: number; capturedFrames: number; hiddenMs: number;
  phases: Record<string, { frames: number; arrivalIntervalMs: number }>;
  text: { rebuilt: number; reused: number; rasterTaskMs: number; prepareMs: number; peakCacheBytes: number; rebuildReasons: Record<string, number> };
  ranges: { firstFrame: number; lastFrame: number; backend: string; textMode: string; reason: string }[];
  cleanupRequested: boolean;
  animationClock?: { mappedStarts: number; maximumClockGapMs: number };
  stageTimings: Record<string, { samples: number; total: number; max: number }>;
  timelineStages: Record<string, Record<string, { samples: number; total: number; max: number }>>;
  textFieldChanges?: Record<string, number>;
  textResourceEngine?: string;
  textAdapterRevision?: string;
  timingNote: string;
}
/** Only rendering metadata is retained: no song title, lyrics, audio, filenames or font URLs. */
export function exportDiagnostics(project: Project, options: ExportOptions) {
  const now = () => performance.now();
  const started = now();
  let framesStarted = false;
  let processingStarted = started, processingEnded = started, cleanupStarted = started, previousArrival = started;
  let hiddenAt: number | undefined = document.hidden ? started : undefined;
  const result: ExportDiagnostics = {
    textFieldChanges: {},
    textResourceEngine: 'shared-text-resources-v1',
    textAdapterRevision: project.template === 'folia-tilt' && options.textCache ? 'tilt-text-resources-v1' : undefined,
    version: 3, createdAt: new Date().toISOString(), status: 'failed',
    settings: { template: project.template, background: project.background, ratio: project.ratio, height: options.height, fps: options.fps, format: options.format, start: options.start, end: options.end, captureMethod: options.captureMethod ?? 'standard', textCache: !!options.textCache },
    totalMs: 0, initializationMs: 0, processingMs: 0, finalizationMs: 0, cleanupMs: 0,
    completedFrames: 0, capturedFrames: 0, hiddenMs: 0, phases: {},
    text: { rebuilt: 0, reused: 0, rasterTaskMs: 0, prepareMs: 0, peakCacheBytes: 0, rebuildReasons: {} },
    stageTimings: {}, timelineStages: {},
    ranges: [], cleanupRequested: false,
    timingNote: 'Stage names ending in Ms are milliseconds; snapshotRebuilt/snapshotReused are counts; serializedCharacters is a character count. Stage timers overlap and must not be added together. captureReadyWallMs contains DOM preparation, SVG loading, raster drawing and bitmap readiness. svgLoadMs includes browser scheduling/loading, not pure CPU; videoAddWallMs/audioAddWallMs include encoder backpressure, not pure codec time. canvasRetainSubmitMs measures submission only, not asynchronous bitmap completion. timelineStages groups frames by 10 seconds of source media time. Wall times include visibility pauses. Phase arrival intervals include overlapping rendering/encoding work; they are not isolated stage CPU costs. rasterTaskMs is cumulative resource preparation wall time, including browser scheduling, not raster CPU time. Raster task times may overlap. GPU execution time is unknown. Frame ranges are zero-based. Cache bytes exclude encoder, group surfaces and browser allocations. Cleanup is requested, not a measurement of garbage collection.',
  };
  const visibility = () => {
    if (document.hidden) hiddenAt ??= now();
    else if (hiddenAt !== undefined) { result.hiddenMs += now() - hiddenAt; hiddenAt = undefined; }
  };
  document.addEventListener('visibilitychange', visibility);
  const firstLyric = project.lines.reduce((first, line) => line.start === null ? first : Math.min(first, line.start + project.offset), Infinity);
  return {
    stages(frame: number, values?: Record<string, number>) {
      if (!values) return;
      const bucket = String(Math.floor((options.start + frame / options.fps) / 10) * 10);
      const timeline = result.timelineStages[bucket] ??= {};
      for (const [name, value] of Object.entries(values)) {
        if (!Number.isFinite(value) || value < 0) continue;
        for (const target of [result.stageTimings, timeline]) {
          const entry = target[name] ??= { samples: 0, total: 0, max: 0 };
          entry.samples++; entry.total += value; entry.max = Math.max(entry.max, value);
        }
      }
    },
    beginFrames() { framesStarted = true; processingStarted = previousArrival = now(); result.initializationMs = processingStarted - started; },
    frame(frame: number, backend: string, stats?: TextCaptureStats) {
      const arrival = now(), time = options.start + frame / options.fps;
      const phase = time < firstLyric ? 'intro' : 'lyrics-and-outro';
      const item = result.phases[phase] ??= { frames: 0, arrivalIntervalMs: 0 };
      item.frames++; item.arrivalIntervalMs += arrival - previousArrival; previousArrival = arrival;
      result.capturedFrames++;
      if (stats) {
        for (const [key, value] of Object.entries(stats.fieldChanges ?? {})) result.textFieldChanges![key] = (result.textFieldChanges![key] ?? 0) + value;
        result.text.rebuilt += stats.rebuilt; result.text.reused += stats.reused;
        result.text.rasterTaskMs += stats.rasterMs; result.text.prepareMs += stats.prepareMs;
        result.text.peakCacheBytes = Math.max(result.text.peakCacheBytes, stats.cacheBytes);
        for (const [key, value] of Object.entries(stats.rebuildReasons)) result.text.rebuildReasons[key] = (result.text.rebuildReasons[key] ?? 0) + value;
      }
      const textMode = stats?.mode ?? 'baseline';
      const reason = stats?.reason ?? (stats && stats.mode !== 'baseline' ? '' : backend !== options.captureMethod ? 'capture-backend-fallback' : options.textCache ? 'text-cache-not-used' : 'text-cache-disabled');
      const last = result.ranges.at(-1);
      if (last && last.backend === backend && last.textMode === textMode && last.reason === reason && last.lastFrame + 1 === frame) last.lastFrame = frame;
      else result.ranges.push({ firstFrame: frame, lastFrame: frame, backend, textMode, reason });
    },
    animationClock(value: ExportDiagnostics['animationClock']) { result.animationClock = value; },
    completed() { result.completedFrames++; },
    endFrames() { processingEnded = now(); if (framesStarted) result.processingMs = processingEnded - processingStarted; else result.initializationMs = processingEnded - started; },
    beginCleanup() { cleanupStarted = now(); result.finalizationMs = cleanupStarted - processingEnded; },
    finish(status: ExportDiagnostics['status']) {
      const ended = now();
      document.removeEventListener('visibilitychange', visibility);
      if (hiddenAt !== undefined) result.hiddenMs += ended - hiddenAt;
      result.status = status; result.totalMs = ended - started; result.cleanupMs = ended - cleanupStarted; result.cleanupRequested = true;
      try {
        const old = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
        localStorage.setItem(storageKey, JSON.stringify([result, ...(Array.isArray(old) ? old : [])].slice(0, 4)));
      } catch { /* Diagnostics must never interrupt export. */ }
      console.info('[MV Studio export diagnostics]', result);
      return result;
    },
  };
}
