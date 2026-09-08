import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginPaperPresentation, endPaperPresentation, releaseDeferredPaperDraws } from '../src/folia/paperPresentation';
afterEach(releaseDeferredPaperDraws);
describe('Paper output presentation', () => {
  it('preserves final uniforms and draws once after all updates, then restores preview', () => {
    const observed: number[] = [];
    const gl = { time: 0, drawArrays: vi.fn(function(this: { time: number }) { observed.push(this.time); }) };
    const original = gl.drawArrays;
    const canvas = { isConnected: true, getContext: () => gl };
    const root = { querySelectorAll: () => [canvas] } as unknown as Element;
    beginPaperPresentation(root); gl.time = 10; gl.drawArrays(); gl.time = 11; gl.drawArrays(); endPaperPresentation(false);
    expect(observed).toEqual([]);
    beginPaperPresentation(root); gl.time = 20; gl.drawArrays(); gl.time = 21; gl.drawArrays(); endPaperPresentation(true);
    expect(observed).toEqual([21]);
    releaseDeferredPaperDraws(); expect(gl.drawArrays).toBe(original);
    gl.time = 22; gl.drawArrays(); expect(observed).toEqual([21, 22]);
  });
  it('restores disconnected shader contexts before installing replacements', () => {
    const gl = { drawArrays: vi.fn() }, original = gl.drawArrays;
    const canvas = { isConnected: true, getContext: () => gl };
    beginPaperPresentation({ querySelectorAll: () => [canvas] } as unknown as Element);
    expect(gl.drawArrays).not.toBe(original); canvas.isConnected = false;
    beginPaperPresentation({ querySelectorAll: () => [] } as unknown as Element);
    expect(gl.drawArrays).toBe(original);
  });
});
