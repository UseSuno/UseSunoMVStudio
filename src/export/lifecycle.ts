import { visibleTimeout } from './visibility';
import { exportMessage } from './messages';

export function exportAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error && signal.reason.name !== 'AbortError'
    ? signal.reason : new DOMException(exportMessage('canceled'), 'AbortError');
}

/** Only a running export asks the browser to confirm refresh/close/navigation. */
export function preventExportExit(scope: Window = window) {
  const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  scope.addEventListener('beforeunload', beforeUnload);
  return () => scope.removeEventListener('beforeunload', beforeUnload);
}

export function nextExportPaint(signal: AbortSignal, scope: Window = window) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(exportAbortReason(signal)); return; }
    const abort = () => { scope.cancelAnimationFrame(id); reject(exportAbortReason(signal)); };
    const id = scope.requestAnimationFrame(() => { signal.removeEventListener('abort', abort); resolve(); });
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** A failed export discards the isolated renderer, never the parent project. */
export function restartExportStage(iframe: HTMLIFrameElement) {
  iframe.dataset.exportReloading = 'true';
  iframe.src = iframe.src;
}

export function waitForExportStage(iframe: HTMLIFrameElement, signal: AbortSignal, scope: Window = window) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(exportAbortReason(signal)); return; }
    if (!iframe.dataset.exportReloading) { resolve(); return; }
    const finish = (error?: Error) => {
      stopTimeout(); signal.removeEventListener('abort', abort); scope.removeEventListener('message', ready);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(exportAbortReason(signal));
    const ready = (event: MessageEvent) => {
      if (event.origin !== scope.location.origin || event.source !== iframe.contentWindow || event.data?.type !== 'verse:ready') return;
      delete iframe.dataset.exportReloading; finish();
    };
    const stopTimeout = visibleTimeout(() => finish(new Error(exportMessage('stageMissing'))), 15000, scope);
    signal.addEventListener('abort', abort, { once: true }); scope.addEventListener('message', ready);
  });
}
