/** Wait without advancing the export timeline; cancellation still works while hidden. */
export function waitUntilVisible(signal?: AbortSignal, scope: Window = window): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (!scope.document.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => { scope.document.removeEventListener('visibilitychange', visible); signal?.removeEventListener('abort', abort); };
    const visible = () => { if (!scope.document.hidden) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(signal?.reason); };
    scope.document.addEventListener('visibilitychange', visible);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** A timeout budget counts only time in a visible page, using the native clock. */
export function visibleTimeout(callback: () => void, milliseconds: number, scope: Window = window, now = () => performance.now()): () => void {
  let remaining = milliseconds, started = 0, timer: number | undefined;
  const stop = () => {
    if (timer !== undefined) { scope.clearTimeout(timer); timer = undefined; remaining = Math.max(0, remaining - (now() - started)); }
  };
  const dispose = () => { stop(); scope.document.removeEventListener('visibilitychange', update); };
  const update = () => {
    stop();
    if (!scope.document.hidden) {
      started = now();
      timer = scope.setTimeout(() => {
        if (scope.document.hidden) { stop(); return; }
        dispose(); callback();
      }, remaining);
    }
  };
  scope.document.addEventListener('visibilitychange', update); update();
  return dispose;
}
