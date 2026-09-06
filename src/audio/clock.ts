// A single media clock supplies the canvas, transport, timeline and timing editor.
export class PlaybackClock {
  audio = new Audio(); time = 0; duration = 46; playing = false; exporting = false; loop: [number, number] | null = null;
  private listeners = new Set<() => void>();
  constructor() { this.audio.preload = 'auto'; this.audio.addEventListener('ended', () => { this.playing = false; this.time = this.duration; this.emit(); }); }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.playing;
  private emit() { this.listeners.forEach(fn => fn()); }
  attach(url: string, duration: number) { this.pause(); this.audio.src = url; this.duration = duration; this.seek(0); }
  seek(time: number) { this.time = Math.max(0, Math.min(this.duration, time)); if (this.audio.src) this.audio.currentTime = this.time; this.emit(); }
  tick() { if (this.playing) { this.time = this.audio.currentTime; if (this.loop && this.time >= this.loop[1]) this.seek(this.loop[0]); } return this.time; }
  async play() { if (!this.audio.src) throw new Error('请先导入音频。'); if (this.time >= this.duration - 0.02) this.seek(0); await this.audio.play(); this.playing = true; this.emit(); }
  pause() { this.audio.pause(); this.playing = false; this.emit(); }
  dispose() { this.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
}
