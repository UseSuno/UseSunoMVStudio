import { exportMessage } from '../export/messages';

import { paintLayers, type PaintLayer } from './paintLayers';
export { paintLayers, type PaintLayer } from './paintLayers';

const parent = (node: Element): Element | null => node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null);
const supportedBlend = new Set(['normal', 'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);

/** Capture contract: Canvas surfaces plus explicitly marked solid background/veil layers.
 * Geometry is measured in the iframe viewport, including the ancestors' translations/scales.
 * The common DOM background is deliberately excluded by capabilities.ts.
 */
export function readPaintLayers(root: Element): PaintLayer[] {
  const view = root.ownerDocument.defaultView!;
  const layers: PaintLayer[] = [];
  // Ancestors are shared by several surfaces; read each style once per capture.
  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleFor = (element: Element) => {
    let style = styles.get(element);
    if (!style) { style = view.getComputedStyle(element); styles.set(element, style); }
    return style;
  };
  const visit = (element: Element) => {
    if (element.tagName === 'CANVAS' || element.hasAttribute('data-capture-solid')) {
      let opacity = 1, blend = 'source-over', filters: string[] = [];
      for (let node: Element | null = element; node; node = parent(node)) {
        const style = styleFor(node);
        if (style.display === 'none' || style.visibility === 'hidden') { opacity = 0; break; }
        opacity *= Number(style.opacity);
        if (style.mixBlendMode !== 'normal') {
          if (!supportedBlend.has(style.mixBlendMode)) throw new Error(exportMessage('unsupportedComposition'));
          blend = style.mixBlendMode;
        }
        if (style.filter !== 'none') filters.unshift(style.filter);
        if (style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          if (!matrix.is2D || Math.abs(matrix.b) > .00001 || Math.abs(matrix.c) > .00001) throw new Error(exportMessage('unsupportedComposition'));
        }
        if (node === root) break;
      }
      const rect = element.getBoundingClientRect();
      const canvas = element.tagName === 'CANVAS' ? element as HTMLCanvasElement : null;
      if (!canvas || (canvas.width > 0 && canvas.height > 0)) layers.push({
        source: canvas ?? undefined,
        color: canvas ? undefined : styleFor(element).backgroundColor,
        x: rect.left, y: rect.top, width: rect.width, height: rect.height,
        opacity, blend: blend as GlobalCompositeOperation, filter: filters.join(' ') || 'none',
      });
    }
    // These surfaces have no competing positioned child stacking contexts; preserve paint order.
    for (const child of Array.from(element.children)) visit(child);
    if (element.shadowRoot) for (const child of Array.from(element.shadowRoot.children)) visit(child);
  };
  visit(root);
  return layers;
}

export function composeStage(root: Element, width: number, height: number, background: string): HTMLCanvasElement {
  const canvas = root.ownerDocument.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(exportMessage('composeFailed'));
  const layers = readPaintLayers(root);
  if (!layers.some(layer => layer.source)) throw new Error(exportMessage('canvasMissing'));
  if (!('filter' in context) && layers.some(layer => layer.filter !== 'none')) throw new Error(exportMessage('unsupportedComposition'));
  context.fillStyle = background; context.fillRect(0, 0, width, height);
  const view = root.ownerDocument.defaultView!;
  context.scale(width / view.innerWidth, height / view.innerHeight);
  paintLayers(context, layers);
  return canvas;
}
