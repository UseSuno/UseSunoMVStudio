import { normalizeEmbedded } from '../import/embedded';
export type { EmbeddedCandidate } from '../import/embedded';
// Audio decoding stays separate from the playback clock and renderer.
export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try { return await context.decodeAudioData(await blob.arrayBuffer()); } finally { await context.close(); }
}
export function envelope(buffer: AudioBuffer, count = 600) {
  const values = new Float32Array(count); const data = buffer.getChannelData(0); const stride = Math.max(1, Math.floor(data.length / count));
  for (let i = 0; i < count; i++) { let sum = 0; let n = 0; for (let j = i * stride; j < Math.min((i + 1) * stride, data.length); j += 32) { sum += data[j] * data[j]; n++; } values[i] = Math.sqrt(sum / Math.max(n, 1)); }
  const max = Math.max(...values, 0.001); return Array.from(values, v => v / max);
}
export function demoAudio(): Blob {
  const rate = 22050, duration = 46, count = rate * duration;
  const buffer = new ArrayBuffer(44 + count * 2), v = new DataView(buffer);
  const write = (offset: number, str: string) => [...str].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); v.setUint32(4, 36 + count * 2, true); write(8, 'WAVE'); write(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); write(36, 'data'); v.setUint32(40, count * 2, true);
  const notes = [130.81, 164.81, 196, 146.83, 174.61, 220, 130.81, 196];
  for (let i = 0; i < count; i++) { const t = i / rate; const n = Math.floor(t / 5.75); const local = t % 5.75; const fade = Math.min(t / 2, (duration - t) / 3, 1); const a = Math.sin(Math.PI * local / 5.75) ** 2; const freq = notes[n]; const wave = (Math.sin(t * freq * Math.PI * 2) + Math.sin(t * freq * 1.5 * Math.PI * 2) * 0.45 + Math.sin(t * freq * 2 * Math.PI * 2) * 0.2) * a * fade * 0.12; v.setInt16(44 + i * 2, wave * 32767, true); }
  return new Blob([buffer], { type: 'audio/wav' });
}
export async function embeddedLyrics(file: Blob) {
  const { parseBlob } = await import('music-metadata');
  const metadata = await parseBlob(file);
  const picture = metadata.common.picture?.[0];
  const cover = picture ? new Blob([new Uint8Array(picture.data)], { type: picture.format || 'image/jpeg' }) : null;
  return { title: metadata.common.title, artist: metadata.common.artist, cover, candidates: normalizeEmbedded(metadata.common.lyrics ?? []) };
}
