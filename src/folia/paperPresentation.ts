// Paper uses one program and independent full-frame passes per canvas. Preserve all
// clock/uniform updates, but draw the last state only once at each output boundary.
type DrawArgs = Parameters<WebGL2RenderingContext['drawArrays']>;
const entries = new Map<HTMLCanvasElement, { restore: () => void; flush: () => void }>();
let collecting = false;
export function beginPaperPresentation(root: Element) {
  for (const [canvas, entry] of entries) if (!canvas.isConnected) { entry.restore(); entries.delete(canvas); }
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('[data-paper-shader] canvas')) {
    if (entries.has(canvas)) continue;
    const gl = canvas.getContext('webgl2'); if (!gl) continue;
    const descriptor = Object.getOwnPropertyDescriptor(gl, 'drawArrays'), draw = gl.drawArrays;
    let pending: DrawArgs | undefined;
    const wrapped: typeof gl.drawArrays = (...args) => { if (collecting) pending = args; else draw.apply(gl, args); };
    gl.drawArrays = wrapped;
    entries.set(canvas, {
      flush: () => { if (pending) { draw.apply(gl, pending); pending = undefined; } },
      restore: () => {
        if (gl.drawArrays !== wrapped) return;
        if (descriptor) Object.defineProperty(gl, 'drawArrays', descriptor);
        else delete (gl as unknown as Record<string, unknown>).drawArrays;
      },
    });
  }
  collecting = true;
}
export function endPaperPresentation(present: boolean) { collecting = false; if (present) for (const entry of entries.values()) entry.flush(); }
export function releaseDeferredPaperDraws() { collecting = false; for (const entry of entries.values()) entry.restore(); entries.clear(); }
