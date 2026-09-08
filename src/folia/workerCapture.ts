import { readPaintLayers, type PaintLayer } from './compositor';
import { rememberCanvasFrames, retainedCanvasFrame } from './canvasFrames';
import { takeFumeWorkerFrame } from '../vendor/folia/components/visualizer/fume/fumePainter';

export interface WorkerLayer extends Omit<PaintLayer, 'source'> { source?: ImageBitmap }
export interface FumeWorkerFrame {
  runtime: ReturnType<typeof takeFumeWorkerFrame>;
  layers: WorkerLayer[];
  fumeIndex: number;
}
export async function captureWorkerFrame(root: HTMLElement): Promise<FumeWorkerFrame> {
  const runtime = takeFumeWorkerFrame();
  const originals = readPaintLayers(root);
  const fumeIndex = originals.findIndex(layer => layer.source instanceof HTMLCanvasElement && layer.source.hasAttribute('data-fume-painter'));
  if (fumeIndex < 0) throw new Error('Fume surface is missing.');
  const layers: WorkerLayer[] = [];
  try {
    for (let i = 0; i < originals.length; i++) {
      const { source, ...style } = originals[i];
      layers.push({ ...style, source: i !== fumeIndex && source instanceof HTMLCanvasElement && source.dataset.phase !== 'off' ? await createImageBitmap(retainedCanvasFrame(source)) : undefined });
    }
    return { runtime, layers, fumeIndex };
  } catch (error) { layers.forEach(layer => layer.source?.close()); throw error; }
}

export { setFumeExternalPainting } from '../vendor/folia/components/visualizer/fume/fumePainter';

/** The worker redraws Fume itself; an inactive intro canvas is completely transparent. */
export function rememberWorkerCanvasFrames(root: HTMLElement) {
  rememberCanvasFrames(root, canvas => !canvas.hasAttribute('data-fume-painter') && canvas.dataset.phase !== 'off');
}
