import { rememberCanvasImage } from './canvasFrames';
// Snapshot at the animation boundary, before a WebGL drawing buffer can be cleared.
// One bitmap per live surface; successful worker transfers detach the stored bitmap.
const frames = new Map<HTMLCanvasElement, Promise<ImageBitmap>>();
const close = (frame: Promise<ImageBitmap>) => { void frame.then(bitmap => bitmap.close(), () => undefined); };
export function rememberCanvasBitmap(source: HTMLCanvasElement) {
  const previous = frames.get(source); if (previous) close(previous);
  if (!source.width || !source.height) { frames.delete(source); return; }
  const frame = createImageBitmap(source); void frame.catch(() => undefined); frames.set(source, frame);
}
export function rememberCanvasBitmaps(root: Element) {
  const live = new Set<HTMLCanvasElement>();
  const visit = (node: Element) => {
    if (node instanceof HTMLCanvasElement) {
      live.add(node);
      rememberCanvasBitmap(node);
    }
    for (const child of node.children) visit(child);
    if (node.shadowRoot) for (const child of node.shadowRoot.children) visit(child);
  };
  visit(root);
  for (const [source, frame] of frames) if (!live.has(source)) { close(frame); frames.delete(source); }
}
export function canvasBitmap(source: HTMLCanvasElement) {
  if (!frames.has(source)) rememberCanvasBitmap(source);
  return frames.get(source)!;
}
export async function restoreCanvasBitmaps() {
  for (const [source, frame] of frames) {
    const bitmap = await frame;
    if (bitmap.width && bitmap.height) rememberCanvasImage(source, bitmap);
  }
}
export function releaseCanvasBitmaps() { for (const frame of frames.values()) close(frame); frames.clear(); }

export function detachCanvasBitmap(source: HTMLCanvasElement, frame: Promise<ImageBitmap>) {
  if (frames.get(source) === frame) frames.delete(source);
}
