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
  /** Browser paint/asset loading continues while animation time is held. */
  paint() { return new Promise<void>(resolve => this.request(() => resolve())); }
  begin() {
    if (this.active) throw new Error('An export is already running.');
    this.stamp = this.startStamp = this.realNow(); this.dateStart = this.dateNow(); this.active = true;
    for (const frame of this.frames.values()) if (frame.native !== undefined) { this.cancel(frame.native); frame.native = undefined; }
    this.freezeAnimations(0);
  }
  private freezeAnimations(delta: number) {
    const live = new Set(this.scope.document.getAnimations());
    for (const animation of live) {
      let state = this.animations.get(animation);
      if (!state) {
        state = { time: Number(animation.currentTime) || 0, running: animation.playState === 'running' || animation.pending, finished: animation.playState === 'finished' };
        this.animations.set(animation, state);
      } else if (state.running && !state.finished) state.time += delta * animation.playbackRate;
      if (!state.running || state.finished) continue;
      animation.pause();
      const end = Number(animation.effect?.getComputedTiming().endTime);
      if (Number.isFinite(end) && state.time >= end && animation.playbackRate > 0) {
        animation.finish(); state.finished = true;
      } else animation.currentTime = state.time;
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
    this.animations.clear();
    for (const [id, frame] of this.frames) this.schedule(id, frame);
  }
}
