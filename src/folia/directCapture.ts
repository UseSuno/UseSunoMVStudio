import { paintLayers, readPaintLayers } from './compositor';
import { retainedCanvasFrame } from './canvasFrames';

let canvas: HTMLCanvasElement | undefined;
/** First prototype: Fume + Latent. Reuse original rendered surfaces and CSS geometry. */
export function captureDirect(root: HTMLElement, width: number, height: number, background: string) {
  canvas ??= document.createElement('canvas');
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = background; context.fillRect(0, 0, width, height);
  const layers = readPaintLayers(root).map(layer => ({ ...layer,
    source: layer.source instanceof HTMLCanvasElement ? retainedCanvasFrame(layer.source) : layer.source,
  }));
  if (!layers.some(layer => layer.source)) throw new Error('Direct renderer has no canvas surface.');
  paintLayers(context, layers);
  return canvas;
}
export function releaseDirectCapture() { if (canvas) canvas.width = 0; canvas = undefined; }
