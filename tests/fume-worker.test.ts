import { afterEach, describe, expect, it, vi } from 'vitest';
import { FumeExportWorker, workerFonts } from '../src/export/fumeWorker';

class FakeWorker extends EventTarget {
  static latest: FakeWorker;
  sent: { id: number; type: string }[] = [];
  terminated = false;
  constructor() { super(); FakeWorker.latest = this; }
  postMessage(message: { id: number; type: string }) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
function setup() {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('window', { document: Object.assign(new EventTarget(), { hidden: false }), setTimeout, clearTimeout });
}
afterEach(() => vi.unstubAllGlobals());

describe('Fume Worker lifecycle', () => {
  it('matches replies to requests and propagates worker errors', async () => {
    setup(); const renderer = new FumeExportWorker(new AbortController().signal);
    const request = renderer.request('init');
    FakeWorker.latest.reply({ id: 999, error: 'stale reply' });
    FakeWorker.latest.reply({ id: FakeWorker.latest.sent[0].id, error: 'font mismatch' });
    await expect(request).rejects.toThrow('font mismatch');
    renderer.dispose(); expect(FakeWorker.latest.terminated).toBe(true);
  });
  it('cancels a pending request without waiting for a worker reply', async () => {
    setup(); const controller = new AbortController(); const renderer = new FumeExportWorker(controller.signal);
    const request = renderer.request('frame'); controller.abort(new Error('cancelled'));
    await expect(request).rejects.toThrow('cancelled');
    await expect(renderer.request('finish')).rejects.toThrow('cancelled');
    expect(FakeWorker.latest.sent).toHaveLength(1); renderer.dispose();
  });
  it('carries font weight and Unicode ranges into the worker', () => {
    const values: Record<string, string> = { 'font-family': '"Local Song"', src: 'url(blob:test)', 'font-weight': '600', 'unicode-range': 'U+4E00-9FFF' };
    const document = { styleSheets: [{ cssRules: [{ type: 5, style: { getPropertyValue: (key: string) => values[key] || '' } }] }] };
    expect(workerFonts(document as unknown as Document)).toEqual([{ family: 'Local Song', source: 'url(blob:test)', descriptors: { weight: '600', style: 'normal', unicodeRange: 'U+4E00-9FFF' } }]);
  });
});
