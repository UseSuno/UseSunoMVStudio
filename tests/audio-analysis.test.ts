import { describe, expect, it } from 'vitest';
import { analyzeAudio, sampleAudioAnalysis } from '../src/audio/analysis';

function toneSequence() {
  const sampleRate = 24000;
  const seconds = 4.5;
  const data = new Float32Array(sampleRate * seconds);
  const tones = [80, 240, 1800, 7000];
  for (let index = 0; index < data.length; index++) {
    const section = Math.min(tones.length - 1, Math.floor(index / sampleRate));
    const local = index % sampleRate;
    const fade = Math.min(1, local / 400, (sampleRate - local) / 400);
    data[index] = Math.sin(2 * Math.PI * tones[section] * index / sampleRate) * .45 * Math.max(0, fade);
  }
  return {
    duration: seconds,
    length: data.length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('deterministic audio analysis', () => {
  it('separates low, vocal and treble passages on the shared media clock', () => {
    const analysis = analyzeAudio(toneSequence());
    const bass = sampleAudioAnalysis(analysis, .6);
    const vocal = sampleAudioAnalysis(analysis, 2.6);
    const treble = sampleAudioAnalysis(analysis, 3.6);
    expect(bass.bass).toBeGreaterThan(bass.vocal);
    expect(vocal.vocal).toBeGreaterThan(vocal.bass);
    expect(treble.treble).toBeGreaterThan(treble.lowMid);
    expect(sampleAudioAnalysis(analysis, 2.6)).toEqual(vocal);
  });

  it('interpolates adjacent analysis frames instead of stepping at 30 fps', () => {
    const values = new Uint8Array([0, 120]);
    const analysis = { fps: 30, power: values, bass: values, lowMid: values, mid: values, vocal: values, treble: values };
    expect(sampleAudioAnalysis(analysis, 1 / 60).treble).toBe(60);
  });
});
