import { AudioBufferSource, BufferTarget, CanvasSource, Output, Mp4OutputFormat, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import type { Project } from '../domain/model';
import { compileProject } from '../renderer/compile';
import { drawFrame } from '../renderer/draw';
// Offline frame generation uses the same renderer as the editor.
export interface ExportOptions { height: number; fps: number; start: number; end: number; format: 'mp4' | 'webm' }
export async function supportedFormats(width: number, height: number, buffer: AudioBuffer) {
  const [avc, aac, vp9, opus] = await Promise.all([
    canEncodeVideo('avc', { width, height, bitrate: 8_000_000 }), canEncodeAudio('aac', { sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels }),
    canEncodeVideo('vp9', { width, height, bitrate: 8_000_000 }), canEncodeAudio('opus', { sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels }),
  ]);
  return { mp4: avc && aac, webm: vp9 && opus };
}
export async function exportVideo(project: Project, buffer: AudioBuffer, peaks: number[], options: ExportOptions, signal: AbortSignal, onProgress: (progress: number, text: string) => void): Promise<Blob> {
  if (project.template.startsWith('folia-')) throw new Error('Folia 原版动画需要使用原版实时录制，不能用旧渲染器替代。');
  const snapshot = structuredClone(project), plan = compileProject(snapshot, peaks, options.height);
  const duration = options.end - options.start;
  if (duration <= 0 || options.start < 0 || options.end > buffer.duration + 0.05) throw new Error('导出范围超出音频时长。');
  const available = await supportedFormats(plan.width, plan.height, buffer);
  if (!available[options.format]) throw new Error('浏览器不支持此音视频编码组合，请选择其他格式或浏览器。');
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: options.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: options.format === 'mp4' ? 'avc' : 'vp9', bitrate: options.height >= 1080 ? 10_000_000 : 5_000_000, keyFrameInterval: 2 });
  const audio = new AudioBufferSource({ codec: options.format === 'mp4' ? 'aac' : 'opus', bitrate: 192_000 });
  output.addVideoTrack(video, { frameRate: options.fps }); output.addAudioTrack(audio);
  const check = () => { if (signal.aborted) throw new DOMException('已取消导出', 'AbortError'); };
  try {
    check(); await output.start();
    const totalFrames = Math.ceil(duration * options.fps);
    const startSample = Math.round(options.start * buffer.sampleRate), endSample = Math.min(buffer.length, Math.round(options.end * buffer.sampleRate));
    let audioCursor = startSample;
    for (let frame = 0; frame < totalFrames; frame++) {
      check(); const time = frame / options.fps;
      drawFrame(ctx, plan, options.start + time);
      await video.add(time, Math.min(1 / options.fps, duration - time));
      // Interleave PCM chunks to keep the muxer from buffering an entire audio track.
      const audioUntil = Math.min(endSample, startSample + Math.round((time + 1 / options.fps) * buffer.sampleRate));
      if (audioUntil > audioCursor) {
        const chunk = new AudioBuffer({ length: audioUntil - audioCursor, sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels });
        for (let c = 0; c < buffer.numberOfChannels; c++) chunk.copyToChannel(buffer.getChannelData(c).subarray(audioCursor, audioUntil), c);
        await audio.add(chunk); audioCursor = audioUntil;
      }
      if (frame % 8 === 0) { onProgress(frame / totalFrames * 0.97, `正在渲染 ${frame + 1} / ${totalFrames} 帧`); await new Promise(r => setTimeout(r, 0)); }
    }
    check(); video.close(); audio.close(); onProgress(0.98, '正在封装音频与视频…'); await output.finalize(); check();
    if (!target.buffer) throw new Error('视频封装失败。');
    onProgress(1, '导出完成'); return new Blob([target.buffer], { type: options.format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } catch (err) { if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {}); throw err; }
  finally { canvas.width = 0; canvas.height = 0; }
}
