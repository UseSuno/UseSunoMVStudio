import type { Project } from '../domain/model';
import { dimensions } from '../domain/model';
import type { PlaybackClock } from '../audio/clock';
import { foliaTheme } from '../folia/adapter';
import type { ExportOptions } from './video';
import { recordingMime } from './realtime';
import { sampleAudioAnalysis, type AudioAnalysis } from '../audio/analysis';
import { canCompositeProject, regionCaptureAvailable } from './capabilities';
import { composeStage } from '../folia/compositor';
import { exportMessage } from './messages';
// Record upstream frames, never substitute the legacy Studio renderer for a Folia template.
interface CroppableTrack extends MediaStreamTrack { cropTo(target: unknown): Promise<void> }
interface CropAPI { fromElement(element: Element): Promise<unknown> }
export const hasRegionCapture = regionCaptureAvailable;
export async function recordFolia(project: Project, buffer: AudioBuffer, audioAnalysis: AudioAnalysis, options: ExportOptions, clock: PlaybackClock, signal: AbortSignal, report: (p: number, s: string) => void): Promise<Blob> {
  const iframe = document.querySelector<HTMLIFrameElement>('.folia-stage-frame');
  const captureSurface = iframe?.closest<HTMLElement>('.folia-stage-host');
  if (!iframe?.contentWindow || !iframe.contentDocument || !captureSurface) throw new Error(exportMessage('stageMissing'));
  const mime = recordingMime(options.format); if (!mime) throw new Error(exportMessage('codecMissing'));
  const direct = project.template === 'folia-fume' && canCompositeProject(project);
  let screen: MediaStream | null = null, screenVideo: HTMLVideoElement | null = null;
  const [width, height] = dimensions(project.ratio, options.height), originalStyle = { width: iframe.style.width, height: iframe.style.height };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!;
  let audioContext: AudioContext | null = null, audioSource: AudioBufferSourceNode | null = null, stream: MediaStream | null = null, recorder: MediaRecorder | null = null, raf = 0;
  let failure: Error | null = null; const oldTime = clock.time;
  const stop = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
  const abort = () => { failure = new DOMException(exportMessage('canceled'), 'AbortError'); stop(); };
  const hidden = () => { if (document.hidden) { failure = new Error(exportMessage('visibilityLost')); stop(); } };
  const stoppedSharing = () => { failure = new Error(exportMessage('sharingStopped')); stop(); };
  const check = () => { if (signal.aborted) throw new DOMException(exportMessage('canceled'), 'AbortError'); };
  const tick = (t: number, playing: boolean) => iframe.contentWindow!.postMessage({ type: 'verse:tick', time: t, playing, audio: sampleAudioAnalysis(audioAnalysis, t) }, location.origin);
  const draw = () => {
    ctx.fillStyle = foliaTheme(project).backgroundColor; ctx.fillRect(0, 0, width, height);
    if (screenVideo && screenVideo.readyState >= 2) { ctx.drawImage(screenVideo, 0, 0, width, height); return; }
    iframe.contentWindow!.dispatchEvent(new Event('verse:before-capture'));
    const composite = composeStage(iframe.contentDocument!.getElementById('folia-root')!, width, height, foliaTheme(project).backgroundColor);
    ctx.drawImage(composite, 0, 0);
    composite.width = 0;
  };
  try {
    check(); clock.pause();
    if (!direct) {
      const CropTarget = (window as unknown as { CropTarget?: CropAPI }).CropTarget;
      if (!regionCaptureAvailable() || !CropTarget) throw new Error(exportMessage('regionMissing'));
      // Permission is explicitly requested by the export action. No microphone/system audio is captured.
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude' } as DisplayMediaStreamOptions);
      const track = screen.getVideoTracks()[0] as CroppableTrack;
      if (!track.cropTo) throw new Error(exportMessage('cropMissing'));
      // Crop the visible clipping container, not the scaled iframe's underlying box.
      // This is also the rectangle used by the recording focus masks.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      check();
      await track.cropTo(await CropTarget.fromElement(captureSurface));
      track.addEventListener('ended', stoppedSharing);
      screenVideo = document.createElement('video'); screenVideo.muted = true; screenVideo.srcObject = screen; await screenVideo.play();
      document.body.classList.add('recording-folia');
    } else { iframe.style.width = `${width}px`; iframe.style.height = `${height}px`; }
    clock.exporting = true; iframe.contentWindow.postMessage({ type: 'verse:project', project: structuredClone(project) }, location.origin);
    report(0, exportMessage('preparingFrames'));
    tick(options.start, true);
    // Let the source's layout and spring state settle at the selected start before recording.
    for (let i = 0; i < 30; i++) { check(); await new Promise(r => setTimeout(r, 25)); tick(options.start, true); }
    draw(); audioContext = new AudioContext(); await audioContext.resume();
    audioSource = audioContext.createBufferSource(); audioSource.buffer = buffer; const destination = audioContext.createMediaStreamDestination(); audioSource.connect(destination);
    stream = canvas.captureStream(30); for (const t of destination.stream.getAudioTracks()) stream.addTrack(t);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: options.height >= 1080 ? 12_000_000 : 7_000_000, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    const finished = new Promise<Blob>((resolve, reject) => { recorder!.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder!.onerror = () => { failure = new Error(exportMessage('recordingFailed')); stop(); reject(failure); }; recorder!.onstop = () => failure ? reject(failure) : resolve(new Blob(chunks, { type: mime })); });
    signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', hidden);
    check(); recorder.start(1000); const start = audioContext.currentTime, duration = options.end - options.start; audioSource.start(start, options.start, duration);
    const render = () => {
      try { const elapsed = audioContext!.currentTime - start; tick(options.start + Math.min(elapsed, duration), true); draw(); report(Math.min(1, elapsed / duration), exportMessage('recording')); if (elapsed >= duration) stop(); else raf = requestAnimationFrame(render); }
      catch (e) { failure = e instanceof Error ? e : new Error(exportMessage('canvasReadFailed')); stop(); }
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
