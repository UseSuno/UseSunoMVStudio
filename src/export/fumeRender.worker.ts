import { visitLayers, type CapturedLayer } from '../folia/layerPackets';
import { AudioSample, AudioSampleSource, BufferTarget, VideoSample, VideoSampleSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import { createFumePainter, setFumeWorkerPixelRatio } from '../vendor/folia/components/visualizer/fume/fumePainter';
import { paintLayers, releasePaintGroups } from '../folia/paintLayers';
import type { WorkerFont } from './fumeWorker';
import type { FumeWorkerFrame } from '../folia/workerCapture';

const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage(message: unknown, transfers?: Transferable[]): void; fonts: FontFaceSet };
let output: Output, target: BufferTarget, video: VideoSampleSource, audio: AudioSampleSource;
let canvas: OffscreenCanvas, lyricCanvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D;
let painter: ReturnType<typeof createFumePainter>;
let current = { time: 0, index: -1, audio: {} as Record<string, number> };
let indexRef = { current: -1 };
let audioTime = 0;
const retainedLayers = new Map<string, { revision: number; source: ImageBitmap }>();

// Keep rendering ordered, but snapshot pixels before handing them to the encoder.
// The main thread bounds outstanding frame requests, so this cannot grow indefinitely.
let encoding = Promise.resolve();
function enqueueEncoding(data: { timestamp: number; duration: number; audioData: Float32Array; channels: number; sampleRate: number }, compositeMs: number) {
  const snapshotStarted = performance.now();
  const frame = new VideoFrame(canvas, { timestamp: Math.round(data.timestamp * 1e6), duration: Math.round(data.duration * 1e6) });
  let sample: VideoSample;
  try { sample = new VideoSample(frame); } catch (error) { frame.close(); throw error; }
  const frames = data.audioData.length / data.channels;
  const timestamp = audioTime; audioTime += frames / data.sampleRate;
  const queuedAt = performance.now();
  const stageStats: Record<string, number> = { workerCompositeMs: compositeMs, videoFrameSnapshotMs: queuedAt - snapshotStarted };
  const completion = encoding.then(async () => {
    stageStats.encoderQueueWaitMs = performance.now() - queuedAt;
    const audioSample = frames ? new AudioSample({ format: 'f32-planar', data: data.audioData, numberOfFrames: frames, numberOfChannels: data.channels, sampleRate: data.sampleRate, timestamp }) : undefined;
    try {
      // Each track stays in order and respects its encoder's backpressure.
      const measure = async (name: string, operation: () => Promise<unknown>) => {
        const started = performance.now();
        try { await operation(); } finally { stageStats[name] = performance.now() - started; }
      };
      const results = await Promise.allSettled([measure('videoAddWallMs', () => video.add(sample)), ...(audioSample ? [measure('audioAddWallMs', () => audio.add(audioSample))] : [])]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    } finally { audioSample?.close(); }
  }).finally(() => { sample.close(); frame.close(); });
  encoding = completion;
  void completion.catch(() => undefined);
  return { completion: completion.then(() => stageStats) };
}

async function process(data: { type: string; [key: string]: any }) {
  const drawingStarted = performance.now();
  if (data.type === 'init') {
    for (const font of data.fonts as WorkerFont[]) scope.fonts.add(new FontFace(font.family, font.source, font.descriptors));
    canvas = new OffscreenCanvas(data.width, data.height); context = canvas.getContext('2d')!;
    lyricCanvas = new OffscreenCanvas(data.width, data.height);
    target = new BufferTarget();
    output = new Output({ format: data.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
    video = new VideoSampleSource({ codec: data.format === 'mp4' ? 'avc' : 'vp9', bitrate: data.height >= 1080 ? 10_000_000 : 5_000_000, keyFrameInterval: 2 });
    audio = new AudioSampleSource({ codec: data.format === 'mp4' ? 'aac' : 'opus', bitrate: 192_000 });
    output.addVideoTrack(video, { frameRate: data.fps }); output.addAudioTrack(audio);
    await output.start(); return;
  }
  if (data.type === 'bitmap' || data.type === 'layers') {
    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (data.type === 'layers') {
        if (!('filter' in context) && data.frame.layers.some((layer: {filter: string}) => layer.filter !== 'none')) throw new Error('Worker Canvas filters are unavailable.');
        // FIFO processing has already snapshotted every earlier frame into its
        // own VideoFrame. Encoding may still be pending, but cannot refer to
        // these source bitmaps. Keep release commands in this ordered stream.
        for (const key of data.frame.releaseKeys ?? []) { retainedLayers.get(key)?.source.close(); retainedLayers.delete(key); }
        // Register all sources first: a repeated unit may reference a later sibling.
        visitLayers(data.frame.layers as CapturedLayer[], layer => {
          if (layer.cacheKey && layer.source) {
            retainedLayers.get(layer.cacheKey)?.source.close();
            retainedLayers.set(layer.cacheKey, { revision: layer.revision!, source: layer.source });
          }
        });
        const resolve = (layer: CapturedLayer): import('../folia/paintLayers').PaintLayer => {
          const children = layer.children?.map(resolve);
          if (!layer.cacheKey) return { ...layer, children };
          const retained = retainedLayers.get(layer.cacheKey);
          if (!retained || retained.revision !== layer.revision) throw new Error('Missing retained export layer.');
          return { ...layer, children, source: retained.source };
        };
        const layers = (data.frame.layers as CapturedLayer[]).map(resolve);
        paintLayers(context as unknown as CanvasRenderingContext2D, layers);
      } else context.drawImage(data.bitmap, 0, 0);
      return enqueueEncoding({ timestamp: data.timestamp, duration: data.duration, audioData: data.audioData, channels: data.channels, sampleRate: data.sampleRate }, performance.now() - drawingStarted);
    } finally { if (data.type === 'layers') visitLayers(data.frame.layers as CapturedLayer[], layer => { if (!layer.cacheKey) layer.source?.close(); }); else data.bitmap.close(); }
    return;
  }
  if (data.type === 'frame') {
    const { runtime, layers, fumeIndex } = data.frame as FumeWorkerFrame;
    try {
      if (runtime.snapshot) {
        const snapshot = runtime.snapshot;
        setFumeWorkerPixelRatio(snapshot.dpr);
        const measure = lyricCanvas.getContext('2d')!;
        for (const probe of snapshot.fontProbes ?? []) {
          await scope.fonts.load(probe.font, probe.text);
          measure.font = probe.font;
          if (Math.abs(measure.measureText(probe.text).width - probe.width) > .01) throw new Error('Worker font metrics differ from preview. Use Canvas direct export for this font.');
        }
        indexRef = snapshot.currentLineIndexRef;
        painter = createFumePainter({ ...snapshot, register: false, canvas: lyricCanvas,
          currentTime: { get: () => current.time }, audioPower: { get: () => current.audio.power || 0 },
          audioBands: Object.fromEntries(['bass', 'lowMid', 'mid', 'vocal', 'treble'].map(key => [key, { get: () => current.audio[key] || 0 }])),
          currentLineIndexRef: indexRef, staticBlockSnapshotCacheRef: { current: new Map() }, setHasPrintedContent() {},
        });
      }
      if (!painter) throw new Error('Worker painter is not initialized.');
      for (const step of runtime.steps) { current = step; indexRef.current = step.index; painter.draw(step.now); }
      context.clearRect(0, 0, canvas.width, canvas.height);
      paintLayers(context as unknown as CanvasRenderingContext2D, layers.map((layer, index) => ({ ...layer, source: index === fumeIndex ? lyricCanvas : layer.source })));
      return enqueueEncoding({ timestamp: data.timestamp, duration: data.duration, audioData: data.audioData, channels: data.channels, sampleRate: data.sampleRate }, performance.now() - drawingStarted);
    } finally { layers.forEach(layer => layer.source?.close()); }
    return;
  }
  if (data.type === 'finish') {
    await encoding;
    video.close(); audio.close(); await output.finalize();
    for (const layer of retainedLayers.values()) layer.source.close(); retainedLayers.clear(); releasePaintGroups(context as unknown as CanvasRenderingContext2D);
    if (!target.buffer) throw new Error('Worker output is empty.');
    return target.buffer;
  }
  throw new Error('Unknown worker request.');
}
let queue = Promise.resolve();
scope.onmessage = event => {
  queue = queue.then(async () => {
    try {
      const result = await process(event.data);
      if (result && !(result instanceof ArrayBuffer) && 'completion' in result) {
        // Acknowledge completion, not submission; progress counts encoded work.
        void result.completion.then(stageStats => scope.postMessage({ id: event.data.id, result: stageStats }), error => scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }));
      } else scope.postMessage({ id: event.data.id, result }, result instanceof ArrayBuffer ? [result] : []);
    }
    catch (error) { scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
