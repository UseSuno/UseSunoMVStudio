import { visibleTimeout } from '../export/visibility';
import { frameClock } from './exportClock';

type NativeCanvas = HTMLCanvasElement & { requestPaint(): void };
type NativeContext = CanvasRenderingContext2D & { drawElementImage(element: Element, x: number, y: number, width: number, height: number): void };
let session: { canvas: NativeCanvas; root: HTMLElement; restore(): void } | undefined;
let failed = false;

export function releaseNativeCapture() {
  session?.restore(); session = undefined; failed = false;
}

/** Opt-in only. Keep the live React root intact and restore its position before fallback. */
export async function captureNative(root: HTMLElement, width: number, height: number): Promise<HTMLCanvasElement | null> {
  if (failed) return null;
  try {
    if (!session) {
      const canvas = document.createElement('canvas') as NativeCanvas;
      const context = canvas.getContext('2d') as NativeContext | null;
      if (typeof canvas.requestPaint !== 'function' || typeof context?.drawElementImage !== 'function') { failed = true; return null; }
      canvas.width = width; canvas.height = height;
      canvas.style.cssText = `display:block;width:${width}px;height:${height}px`;
      canvas.setAttribute('layoutsubtree', '');
      const parent = root.parentNode!, next = root.nextSibling;
      const drawable = root.getAttribute('drawable');
      parent.insertBefore(canvas, root); canvas.append(root); root.setAttribute('drawable', '');
      session = { canvas, root, restore() {
        parent.insertBefore(root, next?.parentNode === parent ? next : null);
        if (drawable === null) root.removeAttribute('drawable'); else root.setAttribute('drawable', drawable);
        canvas.remove(); canvas.width = 0;
      } };
    }
    const { canvas } = session;
    const context = canvas.getContext('2d') as NativeContext;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        stop(); canvas.removeEventListener('paint', paint);
        if (error) reject(error); else resolve();
      };
      const paint = () => {
        try { context.clearRect(0, 0, width, height); context.drawElementImage(root, 0, 0, width, height); finish(); }
        catch (error) { finish(error); }
      };
      const stop = visibleTimeout(() => finish(new Error('Native capture paint timed out')), 5000, window, frameClock.realNow);
      canvas.addEventListener('paint', paint, { once: true });
      try { canvas.requestPaint(); } catch (error) { finish(error); }
    });
    return canvas;
  } catch (error) {
    console.warn('HTML-in-Canvas capture failed; using standard capture.', error);
    releaseNativeCapture(); failed = true;
    await frameClock.paint();
    return null;
  }
}
