import { frameClock } from './exportClock';
import { CssSnapshot } from './cssSnapshot';
import { paintLayers, readPaintLayers } from './compositor';
import { canvasBitmap, detachCanvasBitmap } from './canvasBitmaps';
import type { Project } from '../domain/model';

import { layerBitmaps, type LayeredFrame } from './layerPackets';
import { TiltTextCapture } from './tiltTextCapture';
export type { LayeredFrame } from './layerPackets';
let textCapture: TiltTextCapture | undefined;
let snapshot: CssSnapshot | undefined;
let canvas: HTMLCanvasElement | undefined;
const sent = new Map<string, number>();
const transient = new WeakSet<ImageBitmap>();
const surfacePlaceholder = (width: number, height: number) => ({ x: 0, y: 0, width, height, opacity: 1, blend: 'source-over' as const, filter: 'none' });
const surface = (source: ImageBitmap, width: number, height: number): LayeredFrame['layers'][number] => ({ source, x: 0, y: 0, width, height, opacity: 1, blend: 'source-over', filter: 'none' });
/** Finish all live DOM reads before returning. Rasterization can then overlap the next tick. */
export async function prepareLayeredPacket(root: HTMLElement, width: number, height: number, project: Project, detach = false, textCache = false) {
  const started = frameClock.realNow();
  const stageStats: Record<string, number> = {};
  snapshot ??= new CssSnapshot(root);
  const text = detach && textCache && project.template === 'folia-tilt'
    ? await (textCapture ??= new TiltTextCapture(snapshot)).prepare(root, width, height)
    : undefined;
  const readStarted = frameClock.realNow();
  const originals = readPaintLayers(root);
  stageStats.layerReadMs = frameClock.realNow() - readStarted;
  const backgrounds = [...root.querySelectorAll('[data-capture-background]')];
  const intro = originals.findIndex(layer => layer.source instanceof HTMLCanvasElement && layer.source.hasAttribute('data-phase'));
  const sources = new Map<HTMLCanvasElement, Promise<ImageBitmap>>();
  for (const layer of originals) if (layer.source instanceof HTMLCanvasElement) sources.set(layer.source, canvasBitmap(layer.source));
  const prepared: Awaited<ReturnType<CssSnapshot['prepare']>>[] = [];
  const layers: Promise<LayeredFrame['layers'][number]>[] = [Promise.resolve({ x: 0, y: 0, width, height, opacity: 1, blend: 'source-over', filter: 'none', color: getComputedStyle(root).backgroundColor })];
  const dom = async (include: (node: Element) => boolean, key: string) => {
    const frame = await snapshot!.prepare(width, height, include, key); prepared.push(frame);
    const layer = frame.image.then(async canvas => {
      for (const [name, value] of Object.entries(frame.timing)) stageStats[`${key}.${name}`] = value;
      const bitmapStarted = frameClock.realNow();
      // Only the ordered Worker stream may retain surfaces between frames.
      if (detach) {
        // A pooled canvas can contain new pixels; identity alone is not a revision.
        const revision = frame.revision;
        if (sent.get(key) === revision) return { ...surfacePlaceholder(width, height), cacheKey: key, revision };
        const source = await createImageBitmap(canvas); stageStats[`${key}.bitmapMs`] = frameClock.realNow() - bitmapStarted;
        sent.set(key, revision); transient.add(source);
        return { ...surface(source, width, height), cacheKey: key, revision };
      }
      const source = await createImageBitmap(canvas); stageStats[`${key}.bitmapMs`] = frameClock.realNow() - bitmapStarted; transient.add(source);
      return surface(source, width, height);
    });
    void layer.catch(() => undefined); layers.push(layer);
  };
  const used = new Set<HTMLCanvasElement>(text && 'consumedCanvases' in text && text.consumedCanvases instanceof Set ? text.consumedCanvases as Set<HTMLCanvasElement> : []);
  const originalLayer = (index: number) => {
    const { source, children: _children, ...style } = originals[index];
    if (source instanceof HTMLCanvasElement) used.add(source);
    const layer = source instanceof HTMLCanvasElement ? sources.get(source)!.then(source => ({ ...style, source })) : Promise.resolve(style); void layer.catch(() => undefined); layers.push(layer);
  };
  try {
    if (project.background === 'common' && backgrounds.length) await dom(node => node.tagName !== 'CANVAS' && backgrounds.some(bg => bg.contains(node) || node.contains(bg)), 'background');
    for (let index = 0; index < originals.length; index++) {
      if (index === intro) continue;
      const source = originals[index].source;
      if (source instanceof HTMLCanvasElement && used.has(source)) continue;
      if (project.background === 'common' && source instanceof Element && backgrounds.some(bg => bg.contains(source))) continue;
      originalLayer(index);
    }
    if (text) for (const layer of text.layers) layers.push(Promise.resolve(layer));
    await dom(node => node.tagName !== 'CANVAS' && !node.hasAttribute('data-capture-background') && !text?.excluded.has(node), 'foreground');
    if (intro >= 0) originalLayer(intro);
  } catch (error) {
    sent.clear();
    if (text) layerBitmaps(text.layers).forEach(source => source.close());
    prepared.forEach(frame => frame.release());
    for (const layer of layers) void layer.then(value => { for (const source of layerBitmaps([value])) if (detach || transient.has(source)) source.close(); }, () => undefined);
    throw error;
  }
  if (detach) for (const [source, bitmap] of sources) { detachCanvasBitmap(source, bitmap); if (!used.has(source)) void bitmap.then(value => value.close(), () => undefined); }
  const result = Promise.all(layers).then(layers => { stageStats.captureReadyWallMs = frameClock.realNow() - started; return { layers, stageStats, releaseKeys: text?.releaseKeys, textStats: text?.stats }; }).catch(async error => {
    sent.clear();
    const settled = await Promise.allSettled(layers);
    for (const item of settled) if (item.status === 'fulfilled') for (const bitmap of layerBitmaps([item.value])) if (detach || transient.has(bitmap)) bitmap.close();
    throw error;
  }).finally(() => prepared.forEach(frame => frame.release()));
  void result.catch(() => undefined);
  return { result };
}
export async function captureLayeredPacket(root: HTMLElement, width: number, height: number, project: Project) {
  return (await prepareLayeredPacket(root, width, height, project)).result;
}
export function releaseTransientLayers(frame: LayeredFrame) { for (const layer of frame.layers) if (layer.source && transient.has(layer.source)) layer.source.close(); }
export async function captureLayered(root: HTMLElement, width: number, height: number, project: Project) {
  const packet = await captureLayeredPacket(root, width, height, project);
  try {
    canvas ??= document.createElement('canvas');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d')!;
    if (!('filter' in context) && packet.layers.some(layer => layer.filter !== 'none')) throw new Error('Canvas filters are unavailable.');
    context.clearRect(0, 0, width, height); paintLayers(context, packet.layers);
    return canvas;
  } finally { releaseTransientLayers(packet); }
}
export function releaseLayeredCapture() { textCapture?.dispose(); textCapture = undefined; snapshot?.dispose(); snapshot = undefined; sent.clear(); if (canvas) canvas.width = 0; canvas = undefined; }
