import { describe, expect, it } from 'vitest';
import { FrameClock } from '../src/folia/frameClock';

function fixture(animations: Animation[] = []) {
  let real = 1000, next = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scope = {
    performance: { now: () => real }, Date: { now: () => 1e9 + real },
    requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; },
    cancelAnimationFrame: (id: number) => { callbacks.delete(id); },
    document: { getAnimations: () => animations },
  };
  const clock = new FrameClock(scope as unknown as Window & typeof globalThis);
  return { clock, scope, elapse(ms: number) { real += ms; }, paint() { const batch = [...callbacks]; callbacks.clear(); batch.forEach(([, cb]) => cb(real)); } };
}

describe('export-only frame clock', () => {
  it('leaves preview RAF and time on the native clock', () => {
    const f = fixture(), stamps: number[] = [];
    f.scope.requestAnimationFrame(t => stamps.push(t)); f.elapse(17); f.paint();
    expect(stamps).toEqual([1017]); expect(f.scope.performance.now()).toBe(1017);
  });
  it('holds queued animation callbacks and wall-clock time during encoder waits', () => {
    const f = fixture(), stamps: number[] = [];
    const loop = (t: number) => { stamps.push(t); f.scope.requestAnimationFrame(loop); };
    f.scope.requestAnimationFrame(loop); f.clock.begin();
    f.elapse(500); f.paint(); expect(stamps).toEqual([]);
    f.clock.step(1000 / 60); f.elapse(700); f.paint();
    expect(stamps).toEqual([1000 + 1000 / 60]);
    expect(f.scope.performance.now()).toBeCloseTo(1016.6667, 3);
    expect(f.scope.Date.now()).toBeCloseTo(1e9 + 1016.6667, 3);
    f.clock.end(); f.paint(); expect(stamps.at(-1)).toBe(2200);
    expect(f.scope.performance.now()).toBe(2200);
  });
  it('advances CSS animations explicitly and resumes only animations that were playing', () => {
    const animation = (playing: boolean) => ({ currentTime: 20, playState: playing ? 'running' : 'paused', pending: false, playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: 500 }) },
      pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; }, finish() { this.playState = 'finished'; },
    });
    const moving = animation(true), paused = animation(false), f = fixture([moving, paused] as unknown as Animation[]);
    f.clock.begin(); f.clock.step(30); f.elapse(2000); f.clock.hold();
    expect(moving.currentTime).toBe(50); expect(paused.currentTime).toBe(20);
    f.clock.end(); expect(moving.playState).toBe('running'); expect(paused.playState).toBe('paused');
  });
  it('honors cancellation and rejects invalid steps', () => {
    const f = fixture(); let calls = 0;
    f.clock.begin(); const id = f.scope.requestAnimationFrame(() => calls++); f.scope.cancelAnimationFrame(id);
    f.clock.step(16); expect(calls).toBe(0);
    expect(() => f.clock.step(-1)).toThrow(); expect(() => f.clock.step(Infinity)).toThrow();
    f.clock.end(); expect(() => f.clock.step(16)).toThrow();
  });
});
