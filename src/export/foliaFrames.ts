import { exportDiagnostics, type ExportDiagnostics } from './diagnostics';
import type { LayeredFrame } from '../folia/layeredCapture';
import { FumeExportWorker, workerFonts } from './fumeWorker';
import type { FumeWorkerFrame } from '../folia/workerCapture';
import { frameProgress, type ExportProgress } from './progress';
import { isValidExportRange } from './range';
import { visibleTimeout, waitUntilVisible } from './visibility';
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import type { PlaybackClock } from '../audio/clock';
import { dimensions, type Project } from '../domain/model';
import { ensureProjectFont } from '../fonts/fonts';
import { foliaTheme } from '../folia/adapter';
import type { ExportOptions } from './video';
import { sampleAudioAnalysis, type AudioAnalysis } from '../audio/analysis';
import { canExportFrames, canExportDirect } from './capabilities';
import { exportMessage } from './messages';
import { exportAbortReason, nextExportPaint, restartExportStage, waitForExportStage } from './lifecycle';

export const frameCommand = async <T = ImageBitmap | undefined>(target: Window, type: string, payload: Record<string, unknown>, signal: AbortSignal, onBackend?: (backend: string) => void) => {
  await waitUntilVisible(signal);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(exportAbortReason(signal)); return; }
    const requestId = crypto.randomUUID();
    const stopTimeout = visibleTimeout(() => finish(new Error(exportMessage('captureTimeout'))), 15000);
    const abort = () => finish(exportAbortReason(signal));
    const listener = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== target || event.data?.type !== 'verse:capture-result' || event.data.requestId !== requestId) return;
      if (typeof event.data.captureBackend === 'string') onBackend?.(event.data.captureBackend);
      finish(event.data.error ? new Error(event.data.error) : null, (event.data.jobId ?? event.data.workerFrame ?? event.data.bitmap ?? event.data.clockStats ?? event.data.stageStats) as T);
    };
    const finish = (error: Error | null, bitmap?: T) => {
      stopTimeout(); signal.removeEventListener('abort', abort); window.removeEventListener('message', listener);
      if (error) reject(error); else resolve(bitmap as T);
    };
    signal.addEventListener('abort', abort, { once: true }); window.addEventListener('message', listener);
    target.postMessage({ ...payload, type, requestId }, location.origin);
  });
};

export async function captureFrame(target: Window, signal: AbortSignal, captureMethod = 'standard', onBackend?: (backend: string) => void) {
  const bitmap = await frameCommand(target, 'verse:capture', { captureMethod }, signal, onBackend);
  if (!bitmap) throw new Error(exportMessage('frameMissing'));
  return bitmap;
}

// Original renderers advance their media clock frame-by-frame without playing the audio.
export async function exportFoliaFrames(project: Project, buffer: AudioBuffer, audioAnalysis: AudioAnalysis, options: ExportOptions, clock: PlaybackClock, signal: AbortSignal, report: ExportProgress, onBackend?: (backend: string) => void, onDiagnostics?: (value: ExportDiagnostics) => void) {
  if (['direct', 'worker'].includes(options.captureMethod ?? '') && !canExportDirect(project)) throw new Error('Direct export currently supports Fume with Latent background only.');
  if (!canExportFrames(project)) throw new Error(exportMessage('realtimeRequired'));
  const iframe = document.querySelector<HTMLIFrameElement>('.folia-stage-frame');
  if (!iframe?.contentWindow) throw new Error(exportMessage('stageMissing'));
  const [width, height] = dimensions(project.ratio, options.height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: options.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: options.format === 'mp4' ? 'avc' : 'vp9', bitrate: options.height >= 1080 ? 10_000_000 : 5_000_000, keyFrameInterval: 2 });
  const audio = new AudioBufferSource({ codec: options.format === 'mp4' ? 'aac' : 'opus', bitrate: 192_000 });
  output.addVideoTrack(video, { frameRate: options.fps }); output.addAudioTrack(audio);
  const oldTime = clock.time, oldStyle = { width: iframe.style.width, height: iframe.style.height };
  const check = () => { if (signal.aborted) throw exportAbortReason(signal); };
  const step = (time: number, delta: number, capturePixels = true) => frameCommand(iframe.contentWindow!, 'verse:export-step', { time, delta, capturePixels, playing: true, audio: sampleAudioAnalysis(audioAnalysis, time) }, signal);
  let worker: FumeExportWorker | undefined;
  const pendingWorkerFrames: Promise<void>[] = [];
  let completedWorkerFrames = 0;
  // Bound transferred surfaces and immutable encoder snapshots to three frames.
  const waitForWorkerCapacity = async () => {
    if (pendingWorkerFrames.length >= 3) await pendingWorkerFrames.shift();
  };
  let meter: ReturnType<typeof frameProgress> | undefined;
  let session = false, stageTouched = false, completed = false;
  const diagnostics = exportDiagnostics(project, options);
  let framesEnded = false;
  let previewHidden = false; const oldOpacity = iframe.style.opacity;
  try {
    await waitUntilVisible(signal); check();
    if (!isValidExportRange(options.start, options.end, buffer.duration)) throw new Error(exportMessage('invalidRange'));
    clock.pause(); clock.exporting = true; await ensureProjectFont(project);
    check();
    await waitForExportStage(iframe, signal);
    stageTouched = true;
    iframe.style.width = `${width}px`; iframe.style.height = `${height}px`;
    await nextExportPaint(signal); await nextExportPaint(signal);
    session = true; await frameCommand(iframe.contentWindow, 'verse:export-begin', { captureMethod: options.captureMethod, textCache: options.textCache }, signal);
    if (options.captureMethod === 'layered') { iframe.style.opacity = '0'; previewHidden = true; }
    // Run the original entrance/spring algorithms through a short, fixed pre-roll.
    const preRoll = Math.min(2, options.start), warmFrames = Math.ceil(preRoll * 60);
    await step(options.start - preRoll, 0);
    for (let i = 1; i <= warmFrames; i++) { check(); await step(options.start - preRoll + preRoll * i / warmFrames, preRoll * 1000 / warmFrames); }

    if (options.captureMethod === 'worker' || options.captureMethod === 'layered') {
      worker = new FumeExportWorker(signal);
      await worker.request('init', { width, height, fps: options.fps, format: options.format, fonts: options.captureMethod === 'worker' ? workerFonts(iframe.contentDocument!) : [] });
    } else await output.start();
    const duration = options.end - options.start, totalFrames = Math.ceil(duration * options.fps);
    meter = frameProgress(totalFrames); diagnostics.beginFrames();
    const firstSample = Math.round(options.start * buffer.sampleRate), lastSample = Math.min(buffer.length, Math.round(options.end * buffer.sampleRate));
    let audioCursor = firstSample;
    let queued: { id: string; frame: number } | undefined;
    const submit = (packet: FumeWorkerFrame | LayeredFrame | ImageBitmap, relative: number) => {
      const until = Math.min(lastSample, firstSample + Math.round((relative + 1 / options.fps) * buffer.sampleRate));
      const count = until - audioCursor, packed = new Float32Array(count * buffer.numberOfChannels);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) packed.set(buffer.getChannelData(channel).subarray(audioCursor, until), channel * count);
      const span = Math.min(1 / options.fps, duration - relative);
      const pendingWorkerFrame = packet instanceof ImageBitmap ? worker!.addBitmap(packet, relative, span, packed, buffer.sampleRate, buffer.numberOfChannels)
        : 'runtime' in packet ? worker!.add(packet, relative, span, packed, buffer.sampleRate, buffer.numberOfChannels)
        : worker!.addLayers(packet, relative, span, packed, buffer.sampleRate, buffer.numberOfChannels);
      const completed = pendingWorkerFrame.then(stats => { diagnostics.stages(Math.round(relative * options.fps), stats); completedWorkerFrames++; diagnostics.completed(); });
      void completed.catch(() => undefined); pendingWorkerFrames.push(completed); audioCursor = until;
    };
    const collect = async (job: { id: string; frame: number }) => {
      await waitForWorkerCapacity();
      let backend = 'layered';
      const packet = await frameCommand<LayeredFrame | ImageBitmap>(iframe.contentWindow!, 'verse:collect', { jobId: job.id }, signal, value => { backend = value; onBackend?.(value); });
      diagnostics.frame(job.frame, backend, packet instanceof ImageBitmap ? undefined : packet.textStats);
      if (!(packet instanceof ImageBitmap)) diagnostics.stages(job.frame, packet.stageStats);
      submit(packet, job.frame / options.fps);
    };
    for (let frame = 0; frame < totalFrames; frame++) {
      check(); const relative = frame / options.fps, mediaTime = options.start + relative;
      if (frame > 0) {
        // Preserve both animation steps; direct/Worker sessions skip screen-paint waits.
        if (options.captureMethod === 'layered') {
          const updateStats = await frameCommand<Record<string, number>>(iframe.contentWindow, 'verse:export-step', { steps: [mediaTime - 1 / options.fps / 2, mediaTime].map((time, index) => ({ time, delta: 1000 / options.fps / 2, capturePixels: index === 1, playing: true, audio: sampleAudioAnalysis(audioAnalysis, time) })) }, signal);
          diagnostics.stages(frame, updateStats);
        } else {
          await step(mediaTime - 1 / options.fps / 2, 1000 / options.fps / 2, false);
          await step(mediaTime, 1000 / options.fps / 2);
        }
      }
      if (worker) {
        if (options.captureMethod === 'layered') {
          const id = await frameCommand<string>(iframe.contentWindow, 'verse:capture', { captureMethod: 'layered', prepareLayered: true }, signal);
          if (queued) await collect(queued);
          queued = { id, frame };
        } else {
          await waitForWorkerCapacity();
          const packet = await frameCommand<FumeWorkerFrame>(iframe.contentWindow, 'verse:capture', { captureMethod: 'worker' }, signal);
          onBackend?.('worker'); diagnostics.frame(frame, 'worker'); submit(packet, relative);
        }
      } else {
        context.fillStyle = foliaTheme(project).backgroundColor; context.fillRect(0, 0, width, height);
        let backend = options.captureMethod ?? 'standard';
        const bitmap = await captureFrame(iframe.contentWindow, signal, options.captureMethod, value => { backend = value as typeof backend; onBackend?.(value); });
        try { context.drawImage(bitmap, 0, 0, width, height); } finally { bitmap.close(); }
        await video.add(relative, Math.min(1 / options.fps, duration - relative));
        const audioUntil = Math.min(lastSample, firstSample + Math.round((relative + 1 / options.fps) * buffer.sampleRate));
        if (audioUntil > audioCursor) {
          const chunk = new AudioBuffer({ length: audioUntil - audioCursor, sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels });
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) chunk.copyToChannel(buffer.getChannelData(channel).subarray(audioCursor, audioUntil), channel);
          await audio.add(chunk); audioCursor = audioUntil;
        }
        diagnostics.frame(frame, backend); diagnostics.completed();
      }
      if (frame % 8 === 0) report(frame / totalFrames * .97, exportMessage('frames', { current: frame + 1, total: totalFrames }), worker ? meter.sample(completedWorkerFrames) : meter.sample(frame + 1));
    }
    if (queued) await collect(queued);
    await waitUntilVisible(signal); check(); report(.98, exportMessage('muxing'));
    if (worker) await Promise.all(pendingWorkerFrames);
    diagnostics.endFrames(); framesEnded = true;
    if (worker) { target.buffer = await worker.request<ArrayBuffer>('finish'); }
    else { video.close(); audio.close(); await output.finalize(); }
    check();
    if (!target.buffer) throw new Error(exportMessage('muxFailed'));
    const blob = new Blob([target.buffer], { type: options.format === 'mp4' ? 'video/mp4' : 'video/webm' });
    report(1, exportMessage('complete')); completed = true; return blob;
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw signal.aborted ? exportAbortReason(signal) : error;
  } finally {
    if (!framesEnded) diagnostics.endFrames();
    diagnostics.beginCleanup();
    if (previewHidden) iframe.style.opacity = oldOpacity;
    worker?.dispose();
    meter?.dispose();
    let restart = stageTouched && !completed;
    if (session && completed) {
      try { diagnostics.animationClock(await frameCommand<{ mappedStarts: number; maximumClockGapMs: number }>(iframe.contentWindow!, 'verse:export-end', {}, signal)); }
      catch { restart = true; }
    }
    iframe.style.width = oldStyle.width; iframe.style.height = oldStyle.height;
    clock.exporting = false; clock.seek(oldTime);
    if (restart) restartExportStage(iframe);
    else iframe.contentWindow!.postMessage({ type: 'verse:tick', time: oldTime, playing: false, audio: sampleAudioAnalysis(audioAnalysis, oldTime) }, location.origin);
    canvas.width = 0;
    const diagnostic = diagnostics.finish(completed ? 'complete' : signal.aborted ? 'canceled' : 'failed');
    onDiagnostics?.(diagnostic);
  }
}
