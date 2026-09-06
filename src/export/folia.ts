import type { Project } from '../domain/model';
import { dimensions } from '../domain/model';
import type { PlaybackClock } from '../audio/clock';
import { foliaTheme } from '../folia/adapter';
import type { ExportOptions } from './video';
import { recordingMime } from './realtime';
// Record upstream frames, never substitute the legacy Studio renderer for a Folia template.
interface CroppableTrack extends MediaStreamTrack { cropTo(target: unknown): Promise<void> }
interface CropAPI { fromElement(element: Element): Promise<unknown> }
export function hasRegionCapture() { return !!(window as unknown as { CropTarget?: CropAPI }).CropTarget && !!navigator.mediaDevices?.getDisplayMedia; }
export async function recordFolia(project: Project, buffer: AudioBuffer, peaks: number[], options: ExportOptions, clock: PlaybackClock, signal: AbortSignal, report: (p: number, s: string) => void): Promise<Blob> {
  const iframe = document.querySelector<HTMLIFrameElement>('.folia-stage-frame');
  if (!iframe?.contentWindow || !iframe.contentDocument) throw new Error('Folia 舞台尚未加载。');
  const mime = recordingMime(options.format); if (!mime) throw new Error('此浏览器不支持所选录制格式。');
  const direct = project.template === 'folia-fume';
  let screen: MediaStream | null = null, screenVideo: HTMLVideoElement | null = null;
  const [width, height] = dimensions(project.ratio, options.height), originalStyle = { width: iframe.style.width, height: iframe.style.height };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!;
  let audioContext: AudioContext | null = null, audioSource: AudioBufferSourceNode | null = null, stream: MediaStream | null = null, recorder: MediaRecorder | null = null, raf = 0;
  let failure: Error | null = null; const oldTime = clock.time;
  const stop = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
  const abort = () => { failure = new DOMException('已取消导出', 'AbortError'); stop(); };
  const hidden = () => { if (document.hidden) { failure = new Error('录制中断：请保持 Studio 页面可见。'); stop(); } };
  const stoppedSharing = () => { failure = new Error('页面共享已停止，录制取消。'); stop(); };
  const check = () => { if (signal.aborted) throw new DOMException('已取消导出', 'AbortError'); };
  const tick = (t: number, playing: boolean) => iframe.contentWindow!.postMessage({ type: 'verse:tick', time: t, playing, power: peaks[Math.min(peaks.length - 1, Math.floor(t / project.duration * peaks.length))] ?? 0 }, location.origin);
  const draw = () => {
    ctx.fillStyle = foliaTheme(project).backgroundColor; ctx.fillRect(0, 0, width, height);
    if (screenVideo && screenVideo.readyState >= 2) { ctx.drawImage(screenVideo, 0, 0, width, height); return; }
    const layers = [...iframe.contentDocument!.querySelectorAll('canvas')].filter(c => c.width && c.height);
    if (!layers.length) throw new Error('原版画布未准备好，请先播放预览后重试。');
    for (const layer of layers) ctx.drawImage(layer, 0, 0, width, height);
  };
  try {
    check(); clock.pause();
    if (!direct) {
      const CropTarget = (window as unknown as { CropTarget?: CropAPI }).CropTarget;
      if (!CropTarget) throw new Error('此浏览器不支持原版 DOM 模板的区域录制，请使用桌面 Chrome，或选择浮名模板直接录制。');
      // Permission is explicitly requested by the export action. No microphone/system audio is captured.
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude' } as DisplayMediaStreamOptions);
      const track = screen.getVideoTracks()[0] as CroppableTrack;
      if (!track.cropTo) throw new Error('浏览器未提供画布区域裁切能力。');
      await track.cropTo(await CropTarget.fromElement(iframe));
      track.addEventListener('ended', stoppedSharing);
      screenVideo = document.createElement('video'); screenVideo.muted = true; screenVideo.srcObject = screen; await screenVideo.play();
      document.body.classList.add('recording-folia');
    } else { iframe.style.width = `${width}px`; iframe.style.height = `${height}px`; }
    clock.exporting = true; iframe.contentWindow.postMessage({ type: 'verse:project', project: structuredClone(project) }, location.origin);
    report(0, '准备原版镜头与字形…');
    tick(options.start, true);
    // Let the source's layout and spring state settle at the selected start before recording.
    for (let i = 0; i < 30; i++) { check(); await new Promise(r => setTimeout(r, 25)); tick(options.start, true); }
    draw(); audioContext = new AudioContext(); await audioContext.resume();
    audioSource = audioContext.createBufferSource(); audioSource.buffer = buffer; const destination = audioContext.createMediaStreamDestination(); audioSource.connect(destination);
    stream = canvas.captureStream(30); for (const t of destination.stream.getAudioTracks()) stream.addTrack(t);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: options.height >= 1080 ? 12_000_000 : 7_000_000, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    const finished = new Promise<Blob>((resolve, reject) => { recorder!.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder!.onerror = () => { failure = new Error('原版录制失败。'); stop(); reject(failure); }; recorder!.onstop = () => failure ? reject(failure) : resolve(new Blob(chunks, { type: mime })); });
    signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', hidden);
    check(); recorder.start(1000); const start = audioContext.currentTime, duration = options.end - options.start; audioSource.start(start, options.start, duration);
    const render = () => {
      try { const elapsed = audioContext!.currentTime - start; tick(options.start + Math.min(elapsed, duration), true); draw(); report(Math.min(0.99, elapsed / duration), '正在录制 Folia 原版画面…'); if (elapsed >= duration) stop(); else raf = requestAnimationFrame(render); }
      catch (e) { failure = e instanceof Error ? e : new Error('画布读取失败'); stop(); }
    };
    render(); return await finished;
  } finally {
    cancelAnimationFrame(raf); signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', hidden);
    screen?.getVideoTracks().forEach(t => t.removeEventListener('ended', stoppedSharing)); screen?.getTracks().forEach(t => t.stop()); stream?.getTracks().forEach(t => t.stop());
    try { audioSource?.stop(); } catch { /* Audio may have naturally ended. */ } if (audioContext) await audioContext.close();
    if (screenVideo) { screenVideo.pause(); screenVideo.srcObject = null; }
    document.body.classList.remove('recording-folia'); iframe.style.width = originalStyle.width; iframe.style.height = originalStyle.height;
    clock.exporting = false; clock.seek(oldTime); tick(oldTime, false); canvas.width = 0;
  }
}
