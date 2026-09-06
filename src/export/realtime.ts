import type { Project } from '../domain/model';
import { compileProject } from '../renderer/compile';
import { drawFrame } from '../renderer/draw';
import type { ExportOptions } from './video';
// Compatibility recording is deliberately separate from deterministic offline encoding.
export function recordingMime(format: 'mp4' | 'webm') {
  const choices = format === 'mp4' ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return typeof MediaRecorder === 'undefined' ? undefined : choices.find(m => MediaRecorder.isTypeSupported(m));
}
export async function recordVideo(project: Project, buffer: AudioBuffer, peaks: number[], options: ExportOptions, signal: AbortSignal, progress: (p: number, text: string) => void) {
  if (project.template.startsWith('folia-')) throw new Error('请使用 Folia 原版录制。');
  const mime = recordingMime(options.format); if (!mime) throw new Error('浏览器不支持此录制格式。');
  const plan = compileProject(structuredClone(project), peaks, options.height), canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height;
  const context = canvas.getContext('2d')!, audioContext = new AudioContext();
  const source = audioContext.createBufferSource(), destination = audioContext.createMediaStreamDestination(); source.buffer = buffer; source.connect(destination);
  const stream = canvas.captureStream(options.fps); for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: options.height >= 1080 ? 10_000_000 : 5_000_000, audioBitsPerSecond: 192000 });
  const chunks: Blob[] = []; let frame = 0, failure: Error | null = null;
  const duration = options.end - options.start;
  const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  const abort = () => { failure = new DOMException('已取消导出', 'AbortError'); stop(); };
  const hidden = () => { if (document.hidden) { failure = new Error('录制因页面转入后台而中断。请保持页面可见后重试。'); stop(); } };
  try {
    if (signal.aborted) throw new DOMException('已取消导出', 'AbortError');
    await audioContext.resume(); drawFrame(context, plan, options.start);
    const finished = new Promise<Blob>((resolve, reject) => { recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder.onerror = () => { failure = new Error('录制失败。'); stop(); reject(failure); }; recorder.onstop = () => failure ? reject(failure) : resolve(new Blob(chunks, { type: mime })); });
    signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', hidden);
    recorder.start(1000); const start = audioContext.currentTime; source.start(0, options.start, duration);
    const tick = () => { const elapsed = audioContext.currentTime - start; drawFrame(context, plan, options.start + Math.min(elapsed, duration)); progress(Math.min(0.99, elapsed / duration), '实时录制中，请保持页面可见…'); if (elapsed >= duration) stop(); else frame = requestAnimationFrame(tick); };
    tick(); return await finished;
  } finally { cancelAnimationFrame(frame); signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', hidden); try { source.stop(); } catch { /* Source may already have ended. */ } stream.getTracks().forEach(t => t.stop()); await audioContext.close(); canvas.width = 0; }
}
