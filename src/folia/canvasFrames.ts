// WebGL drawing buffers may be cleared by the next browser paint. Retain only
// the latest rendered pixels; do not change the renderer's WebGL configuration.
const frames = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function canvases(root: Element): HTMLCanvasElement[] {
  const result: HTMLCanvasElement[] = [];
  const visit = (element: Element) => {
    if (element instanceof HTMLCanvasElement) result.push(element);
    for (const child of element.children) visit(child);
    if (element.shadowRoot) for (const child of element.shadowRoot.children) visit(child);
  };
  visit(root); return result;
}
export function rememberCanvasFrames(root: Element, include: (canvas: HTMLCanvasElement) => boolean = () => true) {
  const all = canvases(root);
  const live = new Set(all.filter(include));
  for (const [source, target] of frames) if (!live.has(source)) { target.width = 0; frames.delete(source); }
  for (const source of all) if (include(source)) rememberCanvasFrame(source);
}
export function rememberCanvasFrame(source: HTMLCanvasElement) { rememberCanvasImage(source, source); }
export function rememberCanvasImage(source: HTMLCanvasElement, image: CanvasImageSource) {
  if (!source.width || !source.height) return;
  let target = frames.get(source);
  if (!target) { target = document.createElement('canvas'); frames.set(source, target); }
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  const context = target.getContext('2d')!;
  context.clearRect(0, 0, target.width, target.height); context.drawImage(image, 0, 0);
}
export async function withCanvasFrames<T>(capture: () => Promise<T>): Promise<T> {
  const restore: (() => void)[] = [];
  for (const [source, target] of frames) {
    const descriptor = Object.getOwnPropertyDescriptor(source, 'toDataURL');
    Object.defineProperty(source, 'toDataURL', { configurable: true, value: target.toDataURL.bind(target) });
    restore.push(() => { if (descriptor) Object.defineProperty(source, 'toDataURL', descriptor); else delete (source as unknown as Record<string, unknown>).toDataURL; });
  }
  try { return await capture(); } finally { restore.forEach(fn => fn()); }
}
export function releaseCanvasFrames() { for (const target of frames.values()) target.width = 0; frames.clear(); }

/** Last pixels retained before the browser clears a WebGL drawing buffer. */
export function retainedCanvasFrame(source: HTMLCanvasElement) { return frames.get(source) ?? source; }
