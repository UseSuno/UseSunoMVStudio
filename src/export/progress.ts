export interface FrameProgress { fps: number; remainingSeconds: number }
export type ExportProgress = (progress: number, text: string, frames?: FrameProgress) => void;

/** Measure actual rendering throughput, excluding time paused in a hidden tab. */
export function frameProgress(totalFrames: number, scope: Window = window, now = () => performance.now()) {
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
      const fps = completed / seconds;
      return { fps, remainingSeconds: Math.max(0, totalFrames - completed) / fps };
    },
    dispose() { scope.document.removeEventListener('visibilitychange', visibility); },
  };
}
