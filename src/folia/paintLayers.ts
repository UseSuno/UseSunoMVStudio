export interface PaintLayer {
  source?: CanvasImageSource;
  color?: string;
  x: number; y: number; width: number; height: number;
  opacity: number;
  blend: GlobalCompositeOperation;
  filter: string;
}

export function paintLayers(context: CanvasRenderingContext2D, layers: PaintLayer[]) {
  for (const layer of layers) {
    if (layer.opacity <= 0 || layer.width <= 0 || layer.height <= 0) continue;
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blend;
    context.filter = layer.filter;
    if (layer.source) context.drawImage(layer.source, layer.x, layer.y, layer.width, layer.height);
    else if (layer.color) { context.fillStyle = layer.color; context.fillRect(layer.x, layer.y, layer.width, layer.height); }
    context.restore();
  }
}
