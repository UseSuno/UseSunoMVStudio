export interface PaintLayer {
  source?: CanvasImageSource;
  transform?: [number, number, number, number, number, number];
  tint?: string;
  color?: string;
  x: number; y: number; width: number; height: number;
  opacity: number;
  blend: GlobalCompositeOperation;
  filter: string;
  children?: PaintLayer[];
}

const groupSurfaces = new WeakMap<object, (HTMLCanvasElement | OffscreenCanvas)[]>();
export function releasePaintGroups(context: CanvasRenderingContext2D) {
  for (const canvas of groupSurfaces.get(context) ?? []) canvas.width = 0;
  groupSurfaces.delete(context);
}

export function paintLayers(context: CanvasRenderingContext2D, layers: PaintLayer[], depth = 0, pool?: (HTMLCanvasElement | OffscreenCanvas)[]) {
  pool ??= groupSurfaces.get(context);
  if (!pool) { pool = []; groupSurfaces.set(context, pool); }
  for (const layer of layers) {
    if (layer.opacity <= 0 || layer.width <= 0 || layer.height <= 0) continue;
    if (layer.children && layer.opacity === 1 && layer.filter === 'none' && layer.blend === 'source-over' && !layer.transform) {
      paintLayers(context, layer.children, depth, pool);
      continue;
    }
    context.save();
    if (layer.transform) context.transform(...layer.transform);
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blend;
    context.filter = layer.filter;
    if (layer.children) {
      // Group opacity is applied once, after overlapping units have been composed.
      const surface = pool[depth] ??= typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
      const width = Math.ceil(layer.width), height = Math.ceil(layer.height);
      if (surface.width !== width) surface.width = width;
      if (surface.height !== height) surface.height = height;
      const group = surface.getContext('2d') as CanvasRenderingContext2D | null;
      if (!group) throw new Error('Unable to compose text opacity group.');
      group.setTransform(1, 0, 0, 1, 0, 0); group.clearRect(0, 0, width, height);
      group.setTransform(1, 0, 0, 1, -layer.x, -layer.y);
      paintLayers(group, layer.children, depth + 1, pool);
      context.drawImage(surface, layer.x, layer.y);
    } else if (layer.source && layer.tint) {
      const mask = layer.source as ImageBitmap;
      const surface = pool[depth] ??= typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
      if (surface.width !== mask.width) surface.width = mask.width;
      if (surface.height !== mask.height) surface.height = mask.height;
      const tint = surface.getContext('2d') as CanvasRenderingContext2D;
      tint.setTransform(1, 0, 0, 1, 0, 0);
      tint.globalCompositeOperation = 'source-over';
      tint.clearRect(0, 0, surface.width, surface.height);
      tint.drawImage(mask, 0, 0);
      tint.globalCompositeOperation = 'source-in';
      tint.fillStyle = layer.tint; tint.fillRect(0, 0, surface.width, surface.height);
      tint.globalCompositeOperation = 'source-over';
      context.drawImage(surface, layer.x, layer.y, layer.width, layer.height);
    } else if (layer.source) context.drawImage(layer.source, layer.x, layer.y, layer.width, layer.height);
    else if (layer.color) { context.fillStyle = layer.color; context.fillRect(layer.x, layer.y, layer.width, layer.height); }
    context.restore();
  }
}
