import { visibleTimeout, waitUntilVisible } from '../src/export/visibility';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAbortReason, nextExportPaint, preventExportExit, restartExportStage, waitForExportStage } from '../src/export/lifecycle';

vi.mock('../src/export/messages', () => ({ exportMessage: (key: string) => key }));
afterEach(() => vi.useRealTimers());

function fixture() {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const scope = Object.assign(new EventTarget(), { document, location: { origin: 'https://studio.test' },
    requestAnimationFrame(callback: FrameRequestCallback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id: number) { frames.delete(id); }, setTimeout, clearTimeout,
  });
  return { document, scope: scope as unknown as Window, frames, hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); } };
}

describe('export interruption and recovery', () => {
  it('confirms page exit only while an export owns the guard', () => {
    const f = fixture(), release = preventExportExit(f.scope);
    const during = new Event('beforeunload', { cancelable: true }); f.scope.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    release();
    const after = new Event('beforeunload', { cancelable: true }); f.scope.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
  it('waits while hidden, resumes when visible, and can be canceled while paused', async () => {
    const f = fixture(); f.hide(); let resumed = false;
    const parent = new AbortController();
    const waiting = waitUntilVisible(parent.signal, f.scope).then(() => { resumed = true; });
    await Promise.resolve(); expect(resumed).toBe(false); expect(parent.signal.aborted).toBe(false);
    f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'));
    await waiting; expect(resumed).toBe(true);
    f.hide(); const canceled = waitUntilVisible(parent.signal, f.scope);
    parent.abort(); await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('counts only visible time toward a timeout, including repeated pauses', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const f = fixture(), expired = vi.fn();
    const dispose = visibleTimeout(expired, 15000, f.scope);
    await vi.advanceTimersByTimeAsync(5000); f.hide();
    await vi.advanceTimersByTimeAsync(60000); expect(expired).not.toHaveBeenCalled();
    f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(4000); f.hide();
    await vi.advanceTimersByTimeAsync(60000);
    f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(5999); expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(expired).toHaveBeenCalledOnce();
    dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a pending paint without leaking the animation callback', async () => {
    const f = fixture(), controller = new AbortController();
    const paint = nextExportPaint(controller.signal, f.scope); controller.abort();
    await expect(paint).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.frames.size).toBe(0); expect(exportAbortReason(controller.signal).name).toBe('AbortError');
  });
  it('waits for the replacement iframe before a retry and ignores unrelated ready messages', async () => {
    vi.useFakeTimers(); const f = fixture(), target = {};
    const iframe = { dataset: {}, src: '/folia.html', contentWindow: target } as unknown as HTMLIFrameElement;
    restartExportStage(iframe); expect(iframe.dataset.exportReloading).toBe('true');
    let resumed = false;
    const ready = waitForExportStage(iframe, new AbortController().signal, f.scope).then(() => { resumed = true; });
    const send = (origin: string, source: object) => f.scope.dispatchEvent(Object.assign(new Event('message'), { origin, source, data: { type: 'verse:ready' } }));
    send('https://unrelated.test', target); send(f.scope.location.origin, {});
    await Promise.resolve(); expect(resumed).toBe(false);
    send(f.scope.location.origin, target); await ready;
    expect(iframe.dataset.exportReloading).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels or times out a stage reload without leaving a pending listener', async () => {
    vi.useFakeTimers(); const f = fixture();
    const iframe = { dataset: { exportReloading: 'true' } } as unknown as HTMLIFrameElement;
    const controller = new AbortController(), canceled = waitForExportStage(iframe, controller.signal, f.scope);
    controller.abort(); await expect(canceled).rejects.toMatchObject({ name: 'AbortError' }); expect(vi.getTimerCount()).toBe(0);
    const timed = waitForExportStage(iframe, new AbortController().signal, f.scope);
    const assertion = expect(timed).rejects.toThrow('stageMissing');
    await vi.advanceTimersByTimeAsync(15000); await assertion; expect(vi.getTimerCount()).toBe(0);
  });
});
