import { AudioSample, AudioSampleSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import { createFumePainter, setFumeWorkerPixelRatio } from '../vendor/folia/components/visualizer/fume/fumePainter';
import { paintLayers } from '../folia/paintLayers';
import type { WorkerFont } from './fumeWorker';
import type { FumeWorkerFrame } from '../folia/workerCapture';

const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage(message: unknown, transfers?: Transferable[]): void; fonts: FontFaceSet };
let output: Output, target: BufferTarget, video: CanvasSource, audio: AudioSampleSource;
let canvas: OffscreenCanvas, lyricCanvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D;
let painter: ReturnType<typeof createFumePainter>;
let current = { time: 0, index: -1, audio: {} as Record<string, number> };
let indexRef = { current: -1 };
let audioTime = 0;

async function process(data: { type: string; [key: string]: any }) {
  if (data.type === 'init') {
    for (const font of data.fonts as WorkerFont[]) scope.fonts.add(new FontFace(font.family, font.source, font.descriptors));
    canvas = new OffscreenCanvas(data.width, data.height); context = canvas.getContext('2d')!;
    lyricCanvas = new OffscreenCanvas(data.width, data.height);
    target = new BufferTarget();
    output = new Output({ format: data.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
    video = new CanvasSource(canvas, { codec: data.format === 'mp4' ? 'avc' : 'vp9', bitrate: data.height >= 1080 ? 10_000_000 : 5_000_000, keyFrameInterval: 2 });
    audio = new AudioSampleSource({ codec: data.format === 'mp4' ? 'aac' : 'opus', bitrate: 192_000 });
    output.addVideoTrack(video, { frameRate: data.fps }); output.addAudioTrack(audio);
    await output.start(); return;
  }
  if (data.type === 'bitmap' || data.type === 'layers') {
    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (data.type === 'layers') {
        if (!('filter' in context) && data.frame.layers.some((layer: {filter: string}) => layer.filter !== 'none')) throw new Error('Worker Canvas filters are unavailable.');
        paintLayers(context as unknown as CanvasRenderingContext2D, data.frame.layers);
      } else context.drawImage(data.bitmap, 0, 0);
      await video.add(data.timestamp, data.duration);
      const frames = data.audioData.length / data.channels;
      if (frames) {
        const sample = new AudioSample({ format: 'f32-planar', data: data.audioData, numberOfFrames: frames, numberOfChannels: data.channels, sampleRate: data.sampleRate, timestamp: audioTime });
        try { await audio.add(sample); } finally { sample.close(); }
        audioTime += frames / data.sampleRate;
      }
    } finally { if (data.type === 'layers') data.frame.layers.forEach((layer: { source?: ImageBitmap }) => layer.source?.close()); else data.bitmap.close(); }
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
      await video.add(data.timestamp, data.duration);
      const frames = data.audioData.length / data.channels;
      if (frames) {
        const sample = new AudioSample({ format: 'f32-planar', data: data.audioData, numberOfFrames: frames, numberOfChannels: data.channels, sampleRate: data.sampleRate, timestamp: audioTime });
        try { await audio.add(sample); } finally { sample.close(); }
        audioTime += frames / data.sampleRate;
      }
    } finally { layers.forEach(layer => layer.source?.close()); }
    return;
  }
  if (data.type === 'finish') {
    video.close(); audio.close(); await output.finalize();
    if (!target.buffer) throw new Error('Worker output is empty.');
    return target.buffer;
  }
  throw new Error('Unknown worker request.');
}
let queue = Promise.resolve();
scope.onmessage = event => {
  queue = queue.then(async () => {
    try { const result = await process(event.data); scope.postMessage({ id: event.data.id, result }, result instanceof ArrayBuffer ? [result] : []); }
    catch (error) { scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
