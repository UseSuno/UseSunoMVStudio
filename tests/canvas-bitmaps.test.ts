import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasBitmap, detachCanvasBitmap, rememberCanvasBitmap, rememberCanvasBitmaps, releaseCanvasBitmaps, restoreCanvasBitmaps } from '../src/folia/canvasBitmaps';
import { rememberCanvasImage } from '../src/folia/canvasFrames';
vi.mock('../src/folia/canvasFrames', () => ({ rememberCanvasImage: vi.fn() }));
class Surface {
  width = 16; height = 9; children: Surface[] = []; shadowRoot = null;
  constructor(private deferred = false) {}
  hasAttribute(name: string) { return this.deferred && name === 'data-capture-ready'; }
}
const source = (deferred = false) => new Surface(deferred) as unknown as HTMLCanvasElement;
const bitmap = () => ({ width: 16, height: 9, close: vi.fn() }) as unknown as ImageBitmap;
afterEach(async () => { releaseCanvasBitmaps(); await Promise.resolve(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('offline bitmap ownership', () => {
  it('closes replaced and disconnected snapshots while retaining the current frame', async () => {
    vi.stubGlobal('HTMLCanvasElement', Surface);
    const first = bitmap(), second = bitmap(), surface = source();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
    rememberCanvasBitmap(surface); expect(await canvasBitmap(surface)).toBe(first);
    rememberCanvasBitmap(surface); expect(await canvasBitmap(surface)).toBe(second);
    expect(first.close).toHaveBeenCalledOnce(); expect(second.close).not.toHaveBeenCalled();
    rememberCanvasBitmaps({ children: [], shadowRoot: null } as unknown as Element);
    await Promise.resolve(); expect(second.close).toHaveBeenCalledOnce();
  });
  it('does not retire a snapshot owned by an in-flight capture job', async () => {
    const first = bitmap(), second = bitmap(), surface = source();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
    rememberCanvasBitmap(surface); const pending = canvasBitmap(surface); detachCanvasBitmap(surface, pending);
    rememberCanvasBitmap(surface); await canvasBitmap(surface);
    releaseCanvasBitmaps(); await Promise.resolve();
    expect(first.close).not.toHaveBeenCalled(); expect(second.close).toHaveBeenCalledOnce();
    (await pending).close();
  });
  it('preserves snapshots for a standard-capture fallback before releasing them', async () => {
    const image = bitmap(), surface = source();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(image));
    rememberCanvasBitmap(surface); await restoreCanvasBitmaps();
    expect(rememberCanvasImage).toHaveBeenCalledWith(surface, image);
    expect(image.close).not.toHaveBeenCalled();
  });
  it('propagates capture failures and can still clean up', async () => {
    const surface = source(); vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('context lost')));
    rememberCanvasBitmap(surface);
    await expect(canvasBitmap(surface)).rejects.toThrow('context lost');
    releaseCanvasBitmaps();
  });
});
