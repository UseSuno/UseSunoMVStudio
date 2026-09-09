import type { PaintLayer } from './paintLayers';

export interface CapturedLayer extends Omit<PaintLayer, 'source' | 'children'> {
  source?: ImageBitmap;
  children?: CapturedLayer[];
  cacheKey?: string;
  revision?: number;
}
export interface TextCaptureStats {
  mode: 'cached' | 'baseline' | 'empty';
  reason?: string;
  units: number;
  rebuilt: number;
  reused: number;
  rebuildReasons: Record<string, number>;
  fieldChanges?: Record<string, number>;
  rasterMs: number;
  prepareMs: number;
  cacheBytes: number;
}
export interface LayeredFrame {
  stageStats?: Record<string, number>;
  layers: CapturedLayer[];
  releaseKeys?: string[];
  textStats?: TextCaptureStats;
}
export function visitLayers<T extends { children?: T[] }>(layers: readonly T[], visit: (layer: T) => void) {
  for (const layer of layers) { visit(layer); if (layer.children) visitLayers(layer.children, visit); }
}
export function layerBitmaps(layers: readonly CapturedLayer[]) {
  const result: ImageBitmap[] = [];
  visitLayers(layers, layer => { if (layer.source) result.push(layer.source); });
  return result;
}
