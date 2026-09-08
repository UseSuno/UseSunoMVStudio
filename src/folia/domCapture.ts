import { createContext, destroyContext, domToCanvas, type Context } from 'modern-screenshot';
import { withCanvasFrames } from './canvasFrames';

let context: Context<HTMLElement> | undefined;
let size = '';
/** Rasterize the real DOM/CSS/SVG/Canvas tree, including browser text shaping. */
export async function captureDom(root: HTMLElement, width: number, height: number) {
  const nextSize = `${width}:${height}`;
  if (!context || size !== nextSize) {
    releaseDomCapture(); size = nextSize;
    // The host enforces a visible-time timeout; wall-time image timers would skip assets after a background pause.
    context = await createContext(root, { width, height, scale: 1, timeout: 0,
      features: { restoreScrollPosition: true },
      onCloneEachNode(node) {
        if (node instanceof HTMLElement || node instanceof SVGElement) {
          node.style.setProperty('animation', 'none', 'important');
          node.style.setProperty('transition', 'none', 'important');
        }
      },
    });
  }
  return withCanvasFrames(() => domToCanvas(context!));
}
export function releaseDomCapture() { if (context) destroyContext(context); context = undefined; size = ''; }
