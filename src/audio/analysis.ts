export const AUDIO_ANALYSIS_FPS = 30;

export interface AudioAnalysis {
  fps: number;
  power: Uint8Array;
  bass: Uint8Array;
  lowMid: Uint8Array;
  mid: Uint8Array;
  vocal: Uint8Array;
  treble: Uint8Array;
}

export interface AudioSample {
  power: number;
  bass: number;
  lowMid: number;
  mid: number;
  vocal: number;
  treble: number;
}

export const emptyAudioAnalysis = (): AudioAnalysis => ({
  fps: AUDIO_ANALYSIS_FPS,
  power: new Uint8Array(0),
  bass: new Uint8Array(0),
  lowMid: new Uint8Array(0),
  mid: new Uint8Array(0),
  vocal: new Uint8Array(0),
  treble: new Uint8Array(0),
});

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number };

function bandPass(sampleRate: number, lowHz: number, highHz: number): Biquad {
  const nyquist = sampleRate / 2;
  const low = Math.max(12, Math.min(lowHz, nyquist * .82));
  const high = Math.max(low + 1, Math.min(highHz, nyquist * .94));
  const center = Math.sqrt(low * high);
  const q = Math.max(.22, center / (high - low));
  const omega = 2 * Math.PI * center / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: -2 * Math.cos(omega) / a0,
    a2: (1 - alpha) / a0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

function filter(state: Biquad, input: number) {
  const output = state.b0 * input + state.b1 * state.x1 + state.b2 * state.x2 - state.a1 * state.y1 - state.a2 * state.y2;
  state.x2 = state.x1; state.x1 = input; state.y2 = state.y1; state.y1 = output;
  return output;
}

function percentile(values: Float32Array, ratio: number) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))] ?? 0;
}

function normalizeBand(values: Float32Array, exponent = .72) {
  const result = new Uint8Array(values.length);
  const floor = percentile(values, .12) * .72;
  const ceiling = Math.max(floor + 1e-7, percentile(values, .97));
  let envelope = 0;
  for (let i = 0; i < values.length; i++) {
    const normalized = Math.max(0, Math.min(1, (values[i] - floor) / (ceiling - floor)));
    const target = Math.pow(normalized, exponent);
    // Deterministic fast attack / slow release. It removes frame flutter while preserving hits.
    envelope += (target - envelope) * (target > envelope ? .58 : .16);
    result[i] = Math.round(Math.max(0, Math.min(1, envelope)) * 255);
  }
  return result;
}

/**
 * Builds export-safe band envelopes from decoded PCM. The filter bank is sampled from the file,
 * rather than a live AnalyserNode, so preview, seeking and frame export read identical values.
 */
export function analyzeAudio(buffer: AudioBuffer, fps = AUDIO_ANALYSIS_FPS): AudioAnalysis {
  const frameCount = Math.max(1, Math.ceil(buffer.duration * fps));
  const raw = Array.from({ length: 5 }, () => new Float32Array(frameCount));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const stride = Math.max(1, Math.ceil(buffer.sampleRate / 24000));
  const sampleRate = buffer.sampleRate / stride;
  const filters = [
    bandPass(sampleRate, 20, 150),
    bandPass(sampleRate, 150, 400),
    bandPass(sampleRate, 400, 1200),
    bandPass(sampleRate, 1000, 3500),
    bandPass(sampleRate, 3500, 12000),
  ];
  const counts = new Uint32Array(frameCount);
  for (let sourceIndex = 0; sourceIndex < buffer.length; sourceIndex += stride) {
    let input = 0;
    for (const channel of channels) input += channel[sourceIndex] ?? 0;
    input /= Math.max(1, channels.length);
    const frame = Math.min(frameCount - 1, Math.floor(sourceIndex / buffer.sampleRate * fps));
    counts[frame]++;
    for (let band = 0; band < filters.length; band++) {
      const value = filter(filters[band], input);
      raw[band][frame] += value * value;
    }
  }
  for (let band = 0; band < raw.length; band++) {
    for (let frame = 0; frame < frameCount; frame++) raw[band][frame] = Math.sqrt(raw[band][frame] / Math.max(1, counts[frame]));
  }
  const [bass, lowMid, mid, vocal, treble] = raw.map((values, index) => normalizeBand(values, index === 3 ? .62 : .72));
  const power = new Uint8Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const body = bass[frame] * .46 + lowMid[frame] * .34 + mid[frame] * .2;
    power[frame] = Math.round(Math.max(0, Math.min(255, body)));
  }
  return { fps, power, bass, lowMid, mid, vocal, treble };
}

export function sampleAudioAnalysis(analysis: AudioAnalysis, time: number): AudioSample {
  if (!analysis.power.length) return { power: 0, bass: 0, lowMid: 0, mid: 0, vocal: 0, treble: 0 };
  const position = Math.max(0, time) * analysis.fps;
  const lower = Math.max(0, Math.min(analysis.power.length - 1, Math.floor(position)));
  const upper = Math.min(analysis.power.length - 1, lower + 1);
  const amount = Math.max(0, Math.min(1, position - lower));
  const read = (values: Uint8Array) => (values[lower] ?? 0) + ((values[upper] ?? values[lower] ?? 0) - (values[lower] ?? 0)) * amount;
  return {
    power: read(analysis.power),
    bass: read(analysis.bass),
    lowMid: read(analysis.lowMid),
    mid: read(analysis.mid),
    vocal: read(analysis.vocal),
    treble: read(analysis.treble),
  };
}
