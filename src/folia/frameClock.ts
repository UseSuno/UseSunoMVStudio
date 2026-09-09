/** An iframe-only animation clock. Normal preview uses the browser unchanged. */
export class FrameClock {
  private active = false;
  private stamp = 0;
  private sequence = 0;
  private frames = new Map<number, { callback: FrameRequestCallback; native?: number }>();
  private animations = new Map<Animation, { time: number; running: boolean; finished: boolean }>();
  readonly realNow: () => number;
  private readonly request: typeof requestAnimationFrame;
  private readonly cancel: typeof cancelAnimationFrame;
  private readonly dateNow: typeof Date.now;
  private dateStart = 0;
  private startStamp = 0;
  private session = 0;
  private mappedStarts = 0;
  private maximumClockGapMs = 0;
  private virtualStarts = new WeakMap<Animation, { session: number; time: number }>();
  private restoreAnimate: (() => void) | undefined;

  constructor(private scope: Window & typeof globalThis) {
    this.realNow = scope.performance.now.bind(scope.performance);
    this.request = scope.requestAnimationFrame.bind(scope);
    this.cancel = scope.cancelAnimationFrame.bind(scope);
    this.dateNow = scope.Date.now.bind(scope.Date);
    // Install before animation libraries import and retain RAF references.
    scope.requestAnimationFrame = callback => {
      const id = ++this.sequence;
      const frame = { callback, native: undefined as number | undefined };
      this.frames.set(id, frame);
      if (!this.active) this.schedule(id, frame);
      return id;
    };
    scope.cancelAnimationFrame = id => {
      const frame = this.frames.get(id);
      if (frame?.native !== undefined) this.cancel(frame.native);
      this.frames.delete(id);
    };
    Object.defineProperty(scope.performance, 'now', { configurable: true, value: () => this.active ? this.stamp : this.realNow() });
    scope.Date.now = () => this.active ? this.dateStart + this.stamp - this.startStamp : this.dateNow();
  }

  private schedule(id: number, frame: { callback: FrameRequestCallback; native?: number }) {
    frame.native = this.request(stamp => { this.frames.delete(id); frame.callback(stamp); });
  }
  get exporting() { return this.active; }
  get diagnostics() { return { mappedStarts: this.mappedStarts, maximumClockGapMs: this.maximumClockGapMs }; }
  /** Browser paint/asset loading continues while animation time is held. */
  paint() { return new Promise<void>(resolve => this.request(() => resolve())); }
  private installAnimateMapping() {
    if (this.restoreAnimate) return;
    const prototype = this.scope.Element?.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'animate');
    const nativeAnimate = prototype?.animate;
    const startTime = this.scope.Animation && Object.getOwnPropertyDescriptor(this.scope.Animation.prototype, 'startTime');
    if (!prototype || !nativeAnimate || !startTime?.get || !startTime.set) return;
    const clock = this;
    prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = nativeAnimate.apply(this, args);
      if (clock.active && animation.timeline === clock.scope.document.timeline) {
        Object.defineProperty(animation, 'startTime', {
          configurable: true,
          get() { return startTime.get!.call(animation); },
          set(value: unknown) {
            const timelineTime = clock.scope.document.timeline.currentTime;
            if (clock.active && typeof value === 'number' && Number.isFinite(value) && typeof timelineTime === 'number') {
              clock.mappedStarts++;
              clock.maximumClockGapMs = Math.max(clock.maximumClockGapMs, Math.abs(clock.stamp - timelineTime));
              clock.virtualStarts.set(animation, { session: clock.session, time: value });
              startTime.set!.call(animation, timelineTime - (clock.stamp - value));
            } else {
              clock.virtualStarts.delete(animation);
              startTime.set!.call(animation, value);
            }
          },
        });
      }
      return animation;
    };
    this.restoreAnimate = () => {
      if (descriptor) Object.defineProperty(prototype, 'animate', descriptor);
      else prototype.animate = nativeAnimate;
      for (const animation of this.animations.keys()) {
        if (Object.prototype.hasOwnProperty.call(animation, 'startTime')) Reflect.deleteProperty(animation, 'startTime');
      }
      this.virtualStarts = new WeakMap();
      this.restoreAnimate = undefined;
    };
  }
  begin() {
    if (this.active) throw new Error('An export is already running.');
    this.session++; this.mappedStarts = 0; this.maximumClockGapMs = 0;
    this.stamp = this.startStamp = this.realNow(); this.dateStart = this.dateNow(); this.active = true;
    this.installAnimateMapping();
    for (const frame of this.frames.values()) if (frame.native !== undefined) { this.cancel(frame.native); frame.native = undefined; }
    this.freezeAnimations(0);
  }
  private freezeAnimations(delta: number) {
    const live = new Set(this.scope.document.getAnimations());
    for (const animation of live) {
      let state = this.animations.get(animation);
      if (!state) {
        const origin = this.virtualStarts.get(animation);
        const time = origin?.session === this.session
          ? (this.stamp - origin.time) * animation.playbackRate
          : Number(animation.currentTime) || 0;
        state = { time, running: animation.playState === 'running' || animation.pending, finished: animation.playState === 'finished' };
        this.animations.set(animation, state);
      } else if (state.running && !state.finished) state.time += delta * animation.playbackRate;
      if (!state.running || state.finished) continue;
      // hold() is also called while capturing the same frame. Re-applying pause
      // and an unchanged currentTime dirties browser animation styles again.
      if (animation.playState !== 'paused') animation.pause();
      const end = Number(animation.effect?.getComputedTiming().endTime);
      if (Number.isFinite(end) && state.time >= end && animation.playbackRate > 0) {
        animation.finish(); state.finished = true;
      } else if (animation.currentTime === null || Number(animation.currentTime) !== state.time) animation.currentTime = state.time;
    }
    for (const animation of this.animations.keys()) if (!live.has(animation)) this.animations.delete(animation);
  }
  step(milliseconds: number) {
    if (!this.active || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 100) throw new Error('Invalid animation step.');
    this.stamp += milliseconds;
    this.freezeAnimations(milliseconds);
    const pending = [...this.frames];
    for (const [id, frame] of pending) {
      if (!this.frames.delete(id)) continue;
      frame.callback(this.stamp);
    }
    this.freezeAnimations(0);
  }
  hold() { if (this.active) this.freezeAnimations(0); }
  end() {
    if (!this.active) return;
    this.active = false;
    for (const [animation, state] of this.animations) if (state.running && !state.finished && animation.playState !== 'idle') animation.play();
    this.restoreAnimate?.();
    this.animations.clear();
    for (const [id, frame] of this.frames) this.schedule(id, frame);
  }
}
