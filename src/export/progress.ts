export interface FrameProgress { fps: number; averageFps?: number; remainingSeconds: number }
export type ExportProgress = (progress: number, text: string, frames?: FrameProgress) => void;

/** Measure actual rendering throughput, excluding time paused in a hidden tab. */
export function frameProgress(totalFrames: number, scope: Window = window, now = () => performance.now()) {
  const samples: { seconds: number; completed: number }[] = [{ seconds: 0, completed: 0 }];
  let elapsed = 0, started = now(), visible = !scope.document.hidden;
  const visibility = () => {
    const stamp = now(); if (visible) elapsed += stamp - started;
    started = stamp; visible = !scope.document.hidden;
  };
  scope.document.addEventListener('visibilitychange', visibility);
  return {
    sample(completed: number): FrameProgress | undefined {
      const seconds = (elapsed + (visible ? now() - started : 0)) / 1000;
      if (seconds <= 0 || completed <= 0) return undefined;
      samples.push({ seconds, completed });
      while (samples.length > 2 && samples[1].seconds <= seconds - 5) samples.shift();
      const first = samples[0];
      const fps = (completed - first.completed) / (seconds - first.seconds);
      if (!Number.isFinite(fps) || fps <= 0) return undefined;
      return { fps, averageFps: completed / seconds, remainingSeconds: Math.max(0, totalFrames - completed) / fps };
    },
    dispose() { scope.document.removeEventListener('visibilitychange', visibility); },
  };
}
