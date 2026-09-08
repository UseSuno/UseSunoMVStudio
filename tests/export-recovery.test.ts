import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultProject } from '../src/domain/model';
import type { PlaybackClock } from '../src/audio/clock';
import type { AudioAnalysis } from '../src/audio/analysis';
import { exportFoliaFrames, frameCommand } from '../src/export/foliaFrames';

const encoder = vi.hoisted(() => ({ add: vi.fn(), cancel: vi.fn() }));
vi.mock('../src/export/messages', () => ({ exportMessage: (key: string) => key }));
vi.mock('../src/export/capabilities', () => ({ canExportFrames: () => true }));
vi.mock('../src/folia/adapter', () => ({ foliaTheme: () => ({ backgroundColor: '#000' }) }));
vi.mock('../src/fonts/fonts', () => ({ ensureProjectFont: async () => {} }));
vi.mock('../src/audio/analysis', () => ({ sampleAudioAnalysis: () => ({}) }));
vi.mock('mediabunny', () => ({
  BufferTarget: class { buffer = new ArrayBuffer(8); },
  CanvasSource: class { add = encoder.add; close() {} },
  AudioBufferSource: class { async add() {} close() {} },
  Mp4OutputFormat: class {}, WebMOutputFormat: class {},
  Output: class { state = 'pending'; addVideoTrack() {} addAudioTrack() {} async start() { this.state = 'started'; }
    async finalize() { this.state = 'finalized'; } async cancel() { this.state = 'canceled'; encoder.cancel(); }
  },
}));

beforeEach(() => { encoder.add.mockReset().mockResolvedValue(undefined); encoder.cancel.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  const commands: string[] = [], bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const origin = 'https://studio.test', scope = new EventTarget(); let reloads = 0;
  const target = { postMessage(data: { type: string; requestId: string }) {
    commands.push(data.type);
    const bitmap = data.type === 'verse:capture' ? { close: vi.fn() } : undefined;
    if (bitmap) bitmaps.push(bitmap);
    queueMicrotask(() => scope.dispatchEvent(Object.assign(new Event('message'), {
      origin, source: target, data: { type: 'verse:capture-result', requestId: data.requestId, bitmap },
    })));
  } };
  const iframe = { contentWindow: target, style: { width: '640px', height: '360px' }, dataset: {},
    get src() { return '/folia.html'; }, set src(_value: string) { reloads++; },
  };
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }) };
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: () => iframe, createElement: () => canvas });
  vi.stubGlobal('window', Object.assign(scope, { document, location: { origin }, setTimeout, clearTimeout,
    requestAnimationFrame(callback: FrameRequestCallback) { queueMicrotask(() => callback(0)); return 1; }, cancelAnimationFrame() {},
  }));
  vi.stubGlobal('document', document); vi.stubGlobal('location', { origin });
  vi.stubGlobal('AudioBuffer', class { copyToChannel() {} });
  const clock = { time: 3, exporting: false, pause: vi.fn(), seek: vi.fn() } as unknown as PlaybackClock;
  const buffer = { duration: 1, length: 30, sampleRate: 30, numberOfChannels: 1, getChannelData: () => new Float32Array(30) } as unknown as AudioBuffer;
  const run = (signal = new AbortController().signal, end = 1 / 30) => exportFoliaFrames(defaultProject([]), buffer, {} as AudioAnalysis,
    { height: 720, fps: 30, start: 0, end, format: 'mp4' }, clock, signal, () => {});
  return { scope, target, run, iframe, canvas, clock, document, commands, bitmaps, reloads: () => reloads };
}

it('discards a failed renderer and restores preview dimensions, position and bitmap resources', async () => {
  const f = fixture(); encoder.add.mockRejectedValueOnce(new Error('encoder failed'));
  await expect(f.run()).rejects.toThrow('encoder failed');
  expect(f.reloads()).toBe(1); expect(f.iframe.dataset).toMatchObject({ exportReloading: 'true' });
  expect(f.iframe.style).toEqual({ width: '640px', height: '360px' });
  expect(f.clock.exporting).toBe(false); expect(f.clock.seek).toHaveBeenCalledWith(3);
  expect(f.canvas.width).toBe(0); expect(f.bitmaps[0].close).toHaveBeenCalledOnce(); expect(encoder.cancel).toHaveBeenCalledOnce();
});

it('ends a successful session without reloading the iframe', async () => {
  const f = fixture(); const blob = await f.run();
  expect(blob.type).toBe('video/mp4'); expect(f.commands).toContain('verse:export-end'); expect(f.reloads()).toBe(0);
  expect(f.clock.exporting).toBe(false); expect(encoder.cancel).not.toHaveBeenCalled();
});

it('retains encoded frames while hidden and resumes without duplicate timestamps or renderer reload', async () => {
  const f = fixture(); let hidden!: () => void;
  const paused = new Promise<void>(resolve => { hidden = resolve; });
  encoder.add.mockImplementationOnce(async () => { f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange')); hidden(); });
  let complete = false;
  const result = f.run(undefined, 2 / 30).then(blob => { complete = true; return blob; });
  await paused; await new Promise(resolve => setTimeout(resolve, 20));
  expect(complete).toBe(false); expect(encoder.add).toHaveBeenCalledTimes(1);
  expect(f.clock.exporting).toBe(true); expect(encoder.cancel).not.toHaveBeenCalled();
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'));
  await expect(result).resolves.toBeInstanceOf(Blob);
  expect(encoder.add.mock.calls.map(call => call[0])).toEqual([0, 1 / 30]);
  expect(f.reloads()).toBe(0); expect(f.clock.exporting).toBe(false);
});

it('allows canceling a paused export and releases the existing encoder and renderer', async () => {
  const f = fixture(), controller = new AbortController();
  encoder.add.mockImplementationOnce(async () => {
    f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange')); controller.abort();
  });
  await expect(f.run(controller.signal, 2 / 30)).rejects.toMatchObject({ name: 'AbortError' });
  expect(encoder.cancel).toHaveBeenCalledOnce(); expect(f.reloads()).toBe(1); expect(f.clock.exporting).toBe(false);
});

it('keeps an in-flight frame request alive across a long background pause', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const f = fixture(); let requestId = '';
  f.target.postMessage = data => { requestId = data.requestId; };
  let settled = false;
  const result = frameCommand(f.target as unknown as Window, 'verse:capture', {}, new AbortController().signal).then(value => { settled = true; return value; });
  await Promise.resolve(); await vi.advanceTimersByTimeAsync(3000);
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60000); expect(settled).toBe(false);
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'));
  const bitmap = { close: vi.fn() };
  f.scope.dispatchEvent(Object.assign(new Event('message'), { origin: location.origin, source: f.target,
    data: { type: 'verse:capture-result', requestId, bitmap } }));
  await expect(result).resolves.toBe(bitmap); expect(vi.getTimerCount()).toBe(0);
});
