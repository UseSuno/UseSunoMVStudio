import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import type { PlaybackClock } from '../audio/clock';
import { dimensions, type Project } from '../domain/model';
import { ensureProjectFont } from '../fonts/fonts';
import { foliaTheme } from '../folia/adapter';
import type { ExportOptions } from './video';
import { sampleAudioAnalysis, type AudioAnalysis } from '../audio/analysis';

const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const captureFrame = (target: Window, signal: AbortSignal) => new Promise<ImageBitmap>((resolve, reject) => {
  const requestId = crypto.randomUUID();
  const timeout = window.setTimeout(() => finish(new Error('等待浮名画布超时。')), 3000);
  const abort = () => finish(new DOMException('已取消导出', 'AbortError'));
  const listener = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== target || event.data?.type !== 'verse:capture-result' || event.data.requestId !== requestId) return;
    finish(event.data.error ? new Error(event.data.error) : null, event.data.bitmap);
  };
  const finish = (error: Error | null, bitmap?: ImageBitmap) => {
    clearTimeout(timeout); signal.removeEventListener('abort', abort); window.removeEventListener('message', listener);
    if (error || !bitmap) reject(error ?? new Error('没有收到画布帧。')); else resolve(bitmap);
  };
  signal.addEventListener('abort', abort, { once: true }); window.addEventListener('message', listener);
  target.postMessage({ type: 'verse:capture', requestId }, location.origin);
});

const supportedCanvasTemplates = new Set(['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-curtain', 'folia-tempera', 'folia-sonnet']);

// Canvas and WebGL templates can advance their media clock frame-by-frame without playing the audio.
export async function exportFoliaFrames(project: Project, buffer: AudioBuffer, audioAnalysis: AudioAnalysis, options: ExportOptions, clock: PlaybackClock, signal: AbortSignal, report: (progress: number, text: string) => void) {
  if (!supportedCanvasTemplates.has(project.template)) throw new Error('此主题包含基于真实时间的 DOM 动画，暂时只能使用兼容录制。');
  const iframe = document.querySelector<HTMLIFrameElement>('.folia-stage-frame');
  if (!iframe?.contentWindow) throw new Error('动画舞台尚未准备好。');
  const [width, height] = dimensions(project.ratio, options.height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: options.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: options.format === 'mp4' ? 'avc' : 'vp9', bitrate: options.height >= 1080 ? 10_000_000 : 5_000_000, keyFrameInterval: 2 });
  const audio = new AudioBufferSource({ codec: options.format === 'mp4' ? 'aac' : 'opus', bitrate: 192_000 });
  output.addVideoTrack(video, { frameRate: options.fps }); output.addAudioTrack(audio);
  const oldTime = clock.time, oldStyle = { width: iframe.style.width, height: iframe.style.height };
  const check = () => { if (signal.aborted) throw new DOMException('已取消导出', 'AbortError'); };
  const tick = (time: number) => iframe.contentWindow!.postMessage({ type: 'verse:tick', time, playing: true, audio: sampleAudioAnalysis(audioAnalysis, time) }, location.origin);
  try {
    clock.pause(); clock.exporting = true; await ensureProjectFont(project);
    iframe.style.width = `${width}px`; iframe.style.height = `${height}px`;
    iframe.contentWindow.postMessage({ type: 'verse:project', project: structuredClone(project) }, location.origin);
    tick(options.start); await nextPaint(); await nextPaint();
    await output.start();
    const duration = options.end - options.start, totalFrames = Math.ceil(duration * options.fps);
    const firstSample = Math.round(options.start * buffer.sampleRate), lastSample = Math.min(buffer.length, Math.round(options.end * buffer.sampleRate));
    let audioCursor = firstSample;
    for (let frame = 0; frame < totalFrames; frame++) {
      check(); const relative = frame / options.fps, mediaTime = options.start + relative;
      tick(mediaTime);
      context.fillStyle = foliaTheme(project).backgroundColor; context.fillRect(0, 0, width, height);
      const bitmap = await captureFrame(iframe.contentWindow, signal);
      context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
      await video.add(relative, Math.min(1 / options.fps, duration - relative));
      const audioUntil = Math.min(lastSample, firstSample + Math.round((relative + 1 / options.fps) * buffer.sampleRate));
      if (audioUntil > audioCursor) {
        const chunk = new AudioBuffer({ length: audioUntil - audioCursor, sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels });
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) chunk.copyToChannel(buffer.getChannelData(channel).subarray(audioCursor, audioUntil), channel);
        await audio.add(chunk); audioCursor = audioUntil;
      }
      if (frame % 8 === 0) report(frame / totalFrames * .97, `正在生成 ${frame + 1} / ${totalFrames} 帧`);
    }
    video.close(); audio.close(); report(.98, '正在封装视频…'); await output.finalize();
    if (!target.buffer) throw new Error('视频封装失败。');
    report(1, '导出完成'); return new Blob([target.buffer], { type: options.format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    iframe.style.width = oldStyle.width; iframe.style.height = oldStyle.height; clock.exporting = false; clock.seek(oldTime); tick(oldTime); canvas.width = 0;
  }
}
