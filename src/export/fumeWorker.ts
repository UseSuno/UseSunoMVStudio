import type { LayeredFrame } from '../folia/layeredCapture';
import { visibleTimeout } from './visibility';
import type { FumeWorkerFrame } from '../folia/workerCapture';

export interface WorkerFont { family: string; source: string; descriptors: FontFaceDescriptors }
export function workerFonts(document: Document): WorkerFont[] {
  const fonts: WorkerFont[] = [];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (rule.type !== 5) continue;
      const style = (rule as CSSFontFaceRule).style;
      fonts.push({ family: style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, ''), source: style.getPropertyValue('src'),
        descriptors: { weight: style.getPropertyValue('font-weight') || 'normal', style: style.getPropertyValue('font-style') || 'normal', unicodeRange: style.getPropertyValue('unicode-range') || 'U+0-10FFFF' } });
    }
  }
  return fonts;
}
export class FumeExportWorker {
  private worker = new Worker(new URL('./fumeRender.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 0;
  private pending = new Set<(error: Error) => void>();
  constructor(private signal: AbortSignal) {}
  request<T = void>(type: string, payload: Record<string, unknown> = {}, transfers: Transferable[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) { reject(this.signal.reason); return; }
      const id = ++this.nextId;
      const finish = (error?: unknown, value?: T) => {
        this.pending.delete(finish);
        stop(); this.signal.removeEventListener('abort', abort);
        this.worker.removeEventListener('message', message); this.worker.removeEventListener('error', failure);
        if (error) reject(error); else resolve(value as T);
      };
      const message = (event: MessageEvent) => { if (event.data.id === id) finish(event.data.error ? new Error(event.data.error) : undefined, event.data.result); };
      const failure = (event: ErrorEvent) => finish(new Error(`${event.message || 'Worker failed.'} (${event.filename}:${event.lineno})`));
      const abort = () => finish(this.signal.reason ?? new Error('Export canceled.'));
      const stop = visibleTimeout(() => finish(new Error('Worker did not respond.')), 30000);
      this.pending.add(finish);
      this.worker.addEventListener('message', message); this.worker.addEventListener('error', failure);
      this.signal.addEventListener('abort', abort, { once: true });
      try { this.worker.postMessage({ id, type, ...payload }, transfers); } catch (error) { finish(error); }
    });
  }
  add(frame: FumeWorkerFrame, timestamp: number, duration: number, audioData: Float32Array, sampleRate: number, channels: number) {
    return this.request('frame', { frame, timestamp, duration, audioData, sampleRate, channels }, [...frame.layers.flatMap(layer => layer.source ? [layer.source] : []), audioData.buffer]).catch(error => { frame.layers.forEach(layer => layer.source?.close()); throw error; });
  }
  addLayers(frame: LayeredFrame, timestamp: number, duration: number, audioData: Float32Array, sampleRate: number, channels: number) {
    return this.request('layers', { frame, timestamp, duration, audioData, sampleRate, channels }, [...frame.layers.flatMap(layer => layer.source ? [layer.source] : []), audioData.buffer]).catch(error => { frame.layers.forEach(layer => layer.source?.close()); throw error; });
  }
  addBitmap(bitmap: ImageBitmap, timestamp: number, duration: number, audioData: Float32Array, sampleRate: number, channels: number) {
    return this.request('bitmap', { bitmap, timestamp, duration, audioData, sampleRate, channels }, [bitmap, audioData.buffer]).catch(error => { bitmap.close(); throw error; });
  }
  dispose() { for (const finish of this.pending) finish(new Error('Export worker disposed.')); this.worker.terminate(); }
}
