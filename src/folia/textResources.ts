import { CssSnapshot } from './cssSnapshot';
import { cropTextImage, type CroppedTextImage } from './textImageCrop';
import { frameClock } from './exportClock';
import type { CapturedLayer, TextCaptureStats } from './layerPackets';

export type TextResourcePaint = { kind: 'rgba' } | { kind: 'alpha-baked'; tint: string };
export interface TextResourceRequest {
  key: string; text: string; css: string; width: number; height: number;
  padding: number; scale: number; language: string; contents?: HTMLElement;
  reason?: string;
}
type Entry = { id: string; image: CroppedTextImage; sent: boolean; bytes: number };

/** Main thread owns raster canvases; a committed packet owns new bitmaps until
 * transfer. Worker then owns those bitmaps. Ordered frame release commands are
 * consumed after earlier frames have taken independent VideoFrame snapshots.
 * No background prefetch or overlapping prepare calls are supported here. */
export class TextResources {
  private entries = new Map<string, Entry>();
  private outgoing: ImageBitmap[] = [];
  private sequence = 0;
  private disposed = false;
  constructor(private snapshot: CssSnapshot, private namespace: string) {}
  get bytes() { return [...this.entries.values()].reduce((n, e) => n + e.bytes, 0); }
  image(key: string) {
    const entry = this.entries.get(key);
    if (!entry) throw new Error('missing-text-resource');
    return entry.image;
  }
  prune(live: Set<string>) {
    const released: string[] = [];
    for (const [key, entry] of this.entries) if (!live.has(key)) {
      released.push(entry.id); entry.image.canvas.width = 0; this.entries.delete(key);
    }
    return released;
  }
  async prepare(requests: TextResourceRequest[], stats: TextCaptureStats, validate?: (image: CroppedTextImage) => void) {
    if (this.disposed) throw new Error('text-cache-disposed');
    const missing = [...new Map(requests.map(r => [r.key, r])).values()].filter(r => !this.entries.has(r.key));
    let cursor = 0, failure: unknown, resident = this.bytes;
    const fill = async () => {
      while (!failure && cursor < missing.length) {
        const r = missing[cursor++]; let canvas: HTMLCanvasElement | undefined;
        try {
          const pixelWidth = Math.ceil((r.width + 2 * r.padding) * r.scale);
          const pixelHeight = Math.ceil((r.height + 2 * r.padding) * r.scale);
          if (!(pixelWidth > 0 && pixelHeight > 0 && pixelWidth <= 4096 && pixelHeight <= 4096)) throw new Error('text-resource-surface-size');
          const started = frameClock.realNow();
          canvas = await this.snapshot.rasterizeTextUnit(r.text, r.css, r.width, r.height, r.padding, r.scale, r.language, r.contents);
          // Wall-clock preparation including browser scheduling, NOT CPU time.
          stats.rasterMs += frameClock.realNow() - started;
          const image = cropTextImage(canvas); canvas = image.canvas;
          validate?.(image);
          if (this.disposed) throw new Error('text-cache-disposed');
          const bytes = canvas.width * canvas.height * 4;
          if (resident + bytes > 64 * 1024 * 1024) throw new Error('active-cache-budget');
          resident += bytes;
          this.entries.set(r.key, { id: `${this.namespace}-unit-${++this.sequence}`, image, bytes, sent: false });
          canvas = undefined; stats.rebuilt++;
          const reason = r.reason ?? 'paint-or-content-change';
          stats.rebuildReasons[reason] = (stats.rebuildReasons[reason] ?? 0) + 1;
        } catch (error) { if (canvas) canvas.width = 0; failure ??= error; }
      }
    };
    // Settle every build before rollback; no late result may repopulate a cleared cache.
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, fill));
    if (failure) throw failure;
  }
  async layer(key: string, geometry: CapturedLayer, paint: TextResourcePaint): Promise<CapturedLayer> {
    // Alpha-baked masks may only replace RGB. Color alpha belongs in the
    // browser-generated resource; group opacity remains on the layer/group.
    if (paint.kind === 'alpha-baked' && !/^rgb\([\d.,\s]+\)$/.test(paint.tint)) throw new Error('unverified-mask-tint-alpha');
    const entry = this.entries.get(key);
    if (!entry || this.disposed) throw new Error('missing-text-resource');
    const layer = { ...geometry, cacheKey: entry.id, revision: 1,
      tint: paint.kind === 'alpha-baked' ? paint.tint : undefined };
    if (entry.sent) return layer;
    entry.sent = true;
    const source = await createImageBitmap(entry.image.canvas);
    if (this.disposed) { source.close(); throw new Error('text-cache-disposed'); }
    this.outgoing.push(source);
    return { ...layer, source };
  }
  commit() { this.outgoing = []; }
  rollback() { this.outgoing.forEach(source => source.close()); this.outgoing = []; return this.prune(new Set()); }
  dispose() { this.disposed = true; this.rollback(); }
}
