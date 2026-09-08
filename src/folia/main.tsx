import { beginPaperPresentation, endPaperPresentation, releaseDeferredPaperDraws } from './paperPresentation';
import { rememberCanvasBitmaps, restoreCanvasBitmaps, releaseCanvasBitmaps } from './canvasBitmaps';
import { setDeferredStagePresentation, setLayeredPresentation } from './presentation';
let layeredCapture: typeof import('./layeredCapture') | undefined;
let fumeWorkerCapture: typeof import('./workerCapture') | undefined;
import { captureDirect, releaseDirectCapture } from './directCapture';
import { canExportDirect } from '../export/capabilities';
import { captureNative, releaseNativeCapture } from './nativeCapture';
import { visibleTimeout, waitUntilVisible } from '../export/visibility';
import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { frameClock } from './exportClock';
import { rememberCanvasFrames, releaseCanvasFrames } from './canvasFrames';
let domCapture: typeof import('./domCapture') | undefined;
const releaseDomCapture = () => domCapture?.releaseDomCapture();
import { useMotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import type { Project } from '../domain/model';
import { foliaLines, foliaTheme } from './adapter';
import { DEFAULT_DIORAMA_TUNING, DEFAULT_FUME_TUNING, DEFAULT_MONET_TUNING, DEFAULT_PENDOLO_TUNING, DEFAULT_SONNET_TUNING, DEFAULT_TEMPERA_TUNING } from '../vendor/folia/types';
import { getLineRenderEndTime } from '../vendor/folia/utils/lyrics/renderHints';
import { ensureProjectFont } from '../fonts/fonts';
import useFontsEpoch from '../vendor/folia/hooks/useFontsEpoch';
import { getStudioVisualizer } from './registry';
import './style.css';
import { SongIntro } from './SongIntro';
import { introEnd, introFrame } from './intro';
import { exportMessage } from '../export/messages';
const StudioAuroraBackground = React.lazy(() => import('../aurora/StudioAuroraBackground').then(module => ({ default: module.StudioAuroraBackground })));
// A fixed-size iframe gives original window-relative layouts their own real viewport.
class Boundary extends Component<{ children: React.ReactNode; errorLabel:string }, { error: string }> {
  state = { error: '' }; static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <div className="folia-failure">{this.props.errorLabel}: {this.state.error}</div> : this.props.children; }
}
function FoliaHost() {
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null), [index, setIndex] = useState(-1), [paused, setPaused] = useState(true), [epoch, setEpoch] = useState(0), [artwork, setArtwork] = useState<{ coverUrl: string | null; portraitUrl: string | null }>({ coverUrl: null, portraitUrl: null });
  const time = useMotionValue(0), power = useMotionValue(0), bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
  const fontsEpoch = useFontsEpoch();
  const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble }), [bass, lowMid, mid, vocal, treble]);
  const [introActive, setIntroActive] = useState(false);
  useEffect(() => {
    const end = project ? introEnd(project) : 0;
    const sync = () => setIntroActive(project ? introFrame(time.get() + project.offset, end).active : false);
    sync();
    return time.on('change', sync);
  }, [project, time]);
  const lines = useMemo(() => project ? foliaLines(project) : [], [project]); const theme = useMemo(() => project ? foliaTheme(project) : null, [project]);
  const refs = useRef({ lines, project, previous: 0 }); refs.current.lines = lines; refs.current.project = project;
  useEffect(() => { if (project) void ensureProjectFont(project); }, [project?.font, project?.customFontName, project?.fontWeight]);
  useEffect(() => { const sync=(event:StorageEvent)=>{if(event.key==='verse-studio-language'&&event.newValue)void i18n.changeLanguage(event.newValue);};addEventListener('storage',sync);return()=>removeEventListener('storage',sync);},[]);
  useEffect(() => {
    let directSession = false, workerSession = false;
    let layeredSession = false;
    type CaptureJob = { frame?: import('./layeredCapture').LayeredFrame; bitmap?: ImageBitmap; backend: string };
    const jobs = new Map<string, Promise<CaptureJob>>();
    const releaseJobs = () => { for (const job of jobs.values()) void job.then(value => { value.bitmap?.close(); value.frame?.layers.forEach(layer => layer.source?.close()); }, () => undefined); jobs.clear(); };
    const queueJob = (job: Promise<CaptureJob>) => { const id = crypto.randomUUID(); void job.catch(() => undefined); jobs.set(id, job); return id; };
    const remember = () => { const root = document.getElementById('folia-root')!; if (workerSession) fumeWorkerCapture!.rememberWorkerCanvasFrames(root); else if (layeredSession) rememberCanvasBitmaps(root); else rememberCanvasFrames(root); };
    const handle = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'verse:export-reset') { setEpoch(value => value + 1); return; }
      if (e.data.type === 'verse:project') { setProject(e.data.project); return; }
      if (e.data.type === 'verse:artwork') { setArtwork({ coverUrl: typeof e.data.coverUrl === 'string' ? e.data.coverUrl : null, portraitUrl: typeof e.data.portraitUrl === 'string' ? e.data.portraitUrl : null }); return; }
      if (e.data.type === 'verse:font' && e.data.buffer instanceof ArrayBuffer) { const family = typeof e.data.family === 'string' && e.data.family ? e.data.family : 'Verse Local Font'; const url = URL.createObjectURL(new Blob([e.data.buffer])); const style = document.createElement('style'); style.dataset.exportFont = ''; style.textContent = `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(url)})}`; document.head.querySelectorAll('style[data-export-font]').forEach(node => { URL.revokeObjectURL((node as HTMLStyleElement).dataset.url || ''); node.remove(); }); style.dataset.url = url; document.head.appendChild(style); const face = new FontFace(family, e.data.buffer); void face.load().then(loaded => { document.fonts.add(loaded); setEpoch(value => value + 1); }); return; }
      if (e.data.type === 'verse:export-begin' || e.data.type === 'verse:export-step' || e.data.type === 'verse:export-end' || e.data.type === 'verse:capture' || e.data.type === 'verse:collect') {
        const data = e.data, requestId = data.requestId;
        if (typeof requestId !== 'string') return;
        void (async () => {
          try {
            await waitUntilVisible();
            if (data.type === 'verse:collect') {
              const job = jobs.get(data.jobId); if (!job) throw new Error('Capture job is missing.'); jobs.delete(data.jobId);
              const value = await job;
              parent.postMessage({ type: 'verse:capture-result', requestId, bitmap: value.bitmap, workerFrame: value.frame, captureBackend: value.backend }, location.origin, value.bitmap ? [value.bitmap] : value.frame!.layers.flatMap(layer => layer.source ? [layer.source] : []));
              return;
            }
            if (data.type === 'verse:export-begin') { releaseJobs(); releaseDeferredPaperDraws(); layeredSession = data.captureMethod === 'layered'; setLayeredPresentation(layeredSession); if (layeredSession) layeredCapture ??= await import('./layeredCapture'); layeredCapture?.releaseLayeredCapture(); directSession = ['direct', 'worker'].includes(data.captureMethod) && !!refs.current.project && canExportDirect(refs.current.project); if (data.captureMethod === 'worker' && directSession) fumeWorkerCapture ??= await import('./workerCapture'); workerSession = data.captureMethod === 'worker' && directSession; fumeWorkerCapture?.setFumeExternalPainting(workerSession); releaseDirectCapture(); releaseNativeCapture(); frameClock.begin(); releaseDomCapture(); releaseCanvasFrames(); releaseCanvasBitmaps(); }
            if (data.type === 'verse:export-end') { releaseJobs(); releaseDeferredPaperDraws();
              directSession = false; workerSession = false; layeredSession = false; setLayeredPresentation(false); layeredCapture?.releaseLayeredCapture(); fumeWorkerCapture?.setFumeExternalPainting(false); releaseDirectCapture(); releaseNativeCapture(); frameClock.end(); releaseDomCapture(); releaseCanvasFrames(); releaseCanvasBitmaps();
              // The original renderer resumes with its native clock after the export session.
              flushSync(() => setEpoch(value => value + 1));
            }
            if (data.type === 'verse:export-step') {
              if (!frameClock.exporting) throw new Error('Export session is not active.');
              for (const tick of data.steps ?? [data]) {
                flushSync(() => applyTick(tick));
                if (layeredSession) beginPaperPresentation(document.getElementById('folia-root')!);
                setDeferredStagePresentation(layeredSession && tick.capturePixels === false);
                try { frameClock.step(tick.delta); } finally { setDeferredStagePresentation(false); if (layeredSession) endPaperPresentation(tick.capturePixels !== false); }
                if (tick.capturePixels !== false) remember();
                if (!directSession && !layeredSession) await frameClock.paint();
                frameClock.hold();
                await Promise.resolve();
              }
            }
            if (data.type === 'verse:capture') {
              if (data.prepareLayered && jobs.size >= 2) throw new Error('The capture queue is full.');
              let timedOut = false;
              const stopTimeout = visibleTimeout(() => { timedOut = true; }, 14000, window, frameClock.realNow);
              try {
                const needsCanvas = ['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-tempera', 'folia-sonnet'].includes(refs.current.project?.template ?? '');
                const needsRuntime = ['folia-sonnet', 'folia-tempera'].includes(refs.current.project?.template ?? '');
                while ((data.captureMethod === 'worker' && !document.querySelector('canvas[data-fume-painter]')) || (needsRuntime && !document.querySelector('canvas[data-capture-ready="true"]')) || (needsCanvas && !document.querySelector('[data-capture-renderer] canvas')) || !document.querySelector('[data-capture-renderer]') || document.querySelector('.folia-loading, [data-capture-ready="false"]')) {
                  if (timedOut) throw new Error(exportMessage('captureTimeout'));
                  await frameClock.paint();
                  if (frameClock.exporting) { frameClock.step(0); remember(); }
                }
              } finally { stopTimeout(); }
              await document.fonts.ready;
              await waitUntilVisible();
              frameClock.hold();
              window.dispatchEvent(new Event('verse:before-capture'));
              const root = document.getElementById('folia-root')!;
              if (data.captureMethod === 'worker' && directSession) {
                const workerFrame = await fumeWorkerCapture!.captureWorkerFrame(root);
                parent.postMessage({ type: 'verse:capture-result', requestId, workerFrame }, location.origin, workerFrame.layers.flatMap(layer => layer.source ? [layer.source] : []));
                return;
              }
              if (data.captureMethod === 'layered' && layeredSession) {
                try {
                  if (data.prepareLayered) {
                    const prepared = await layeredCapture!.prepareLayeredPacket(root, innerWidth, innerHeight, refs.current.project!, true);
                    const jobId = queueJob(prepared.result.then(frame => ({ frame, backend: 'layered' })));
                    parent.postMessage({ type: 'verse:capture-result', requestId, jobId }, location.origin);
                    return;
                  }
                  if (data.transferLayers) {
                    const workerFrame = await layeredCapture!.captureLayeredPacket(root, innerWidth, innerHeight, refs.current.project!);
                    parent.postMessage({ type: 'verse:capture-result', requestId, workerFrame, captureBackend: 'layered' }, location.origin, workerFrame.layers.flatMap(layer => layer.source ? [layer.source] : []));
                    return;
                  }
                  const composite = await layeredCapture!.captureLayered(root, innerWidth, innerHeight, refs.current.project!);
                  const bitmap = await createImageBitmap(composite);
                  parent.postMessage({ type: 'verse:capture-result', requestId, bitmap, captureBackend: 'layered' }, location.origin, [bitmap]);
                  return;
                } catch { await restoreCanvasBitmaps(); releaseCanvasBitmaps(); layeredSession = false; setLayeredPresentation(false); releaseDeferredPaperDraws(); layeredCapture?.releaseLayeredCapture(); }
              }
              if (layeredSession) await restoreCanvasBitmaps();
              const native = data.captureMethod === 'native' ? await captureNative(root, innerWidth, innerHeight) : null;
              const direct = data.captureMethod === 'direct' && directSession;
              if (!direct && !native) domCapture ??= await import('./domCapture');
              const composite = direct ? captureDirect(root, innerWidth, innerHeight, foliaTheme(refs.current.project!).backgroundColor) : native ?? await domCapture!.captureDom(root, innerWidth, innerHeight);
              const bitmap = await createImageBitmap(composite);
              if (data.prepareLayered) {
                const jobId = queueJob(Promise.resolve({ bitmap, backend: 'standard' }));
                parent.postMessage({ type: 'verse:capture-result', requestId, jobId }, location.origin); return;
              }
              parent.postMessage({ type: 'verse:capture-result', requestId, bitmap, captureBackend: direct ? 'direct' : native ? 'native' : 'standard' }, location.origin, [bitmap]);
              return;
            }
            parent.postMessage({ type: 'verse:capture-result', requestId, ok: true }, location.origin);
          } catch (error) {
            parent.postMessage({ type: 'verse:capture-result', requestId, error: error instanceof Error ? error.message : exportMessage('composeFailed') }, location.origin);
          }
        })();
        return;
      }
      if (e.data.type === 'verse:tick' && !frameClock.exporting) applyTick(e.data);
    };
    const applyTick = (data: { time: number; playing: boolean; audio?: Record<string, unknown> }) => {
        const p = refs.current.project; if (!p) return;
        const t = data.time - p.offset;
        if (!Number.isFinite(t)) return;
        // Remount only on an explicit seek to clear real-time spring/exit history.
        if (Math.abs(t - refs.current.previous) > 0.8 && !frameClock.exporting) setEpoch(n => n + 1);
        refs.current.previous = t;
        time.set(t); setPaused(!data.playing);
        const live = refs.current.lines.findLastIndex((l, i, all) => t >= l.startTime && t < Math.min(getLineRenderEndTime(l), all[i + 1]?.startTime ?? Infinity)); setIndex(old => old === live ? old : live);
        const sample = data.audio && typeof data.audio === 'object' ? data.audio : {};
        const amount = Math.max(0, Math.min(1, p.audioReactivityAmount ?? .7));
        const gain = p.audioReactivity === 'off' ? 0 : amount * (p.audioReactivity === 'rhythmic' ? 1.35 : .85);
        const signal = (key: string) => Math.max(0, Math.min(255, (Number(sample[key]) || 0) * gain));
        power.set(signal('power')); bass.set(signal('bass')); lowMid.set(signal('lowMid')); mid.set(signal('mid')); vocal.set(signal('vocal')); treble.set(signal('treble'));
    };
    window.addEventListener('message', handle); parent.postMessage({ type: 'verse:ready' }, location.origin);
    return () => { window.removeEventListener('message', handle); releaseJobs(); releaseDeferredPaperDraws(); };
  }, [time, power, bass, lowMid, mid, vocal, treble, t]);
  if (!project || !theme) return <div className="folia-loading">{t('folia.preparing')}</div>;
  const Renderer = getStudioVisualizer(project.template).renderer;
  const customAurora = project.background === 'aurora-nebula' || project.background === 'aurora-curtain';
  const renderer = <Renderer key={`${project.template}-${epoch}-${fontsEpoch}-${introActive}-${lines.length === 0}`} currentTime={time} currentLineIndex={index} lines={lines} theme={theme} audioPower={power} audioBands={audioBands} paused={paused} showText={!introActive && lines.length > 0} seed={project.seed} lyricsFontScale={project.fontScale} isDaylight={project.palette === 'paper'} songTitle={project.title} songArtist={project.artist} coverUrl={artwork.coverUrl} monetPortraitImage={artwork.portraitUrl ? { id: 'studio-monet-portrait', name: project.monetPortraitName || t('folia.customImage'), url: artwork.portraitUrl } : null} isPlayerChromeHidden hideTranslationSubtitle showSubtitleTranslation={false}
    background={customAurora ? { transparent: true } : { mode: project.background }}
    fumeTuning={{ ...DEFAULT_FUME_TUNING, cameraSpeed: project.intensity, disableGeometricBackground: false }}
    dioramaTuning={{ ...DEFAULT_DIORAMA_TUNING, cameraSpeed: project.intensity, motionAmount: project.intensity, audioReactivity: project.audioReactivity === 'off' ? 0 : project.audioReactivityAmount * (project.audioReactivity === 'rhythmic' ? .8 : .38) }}
    monetTuning={{ ...DEFAULT_MONET_TUNING, showAudioVisualization: project.monetAudioVisualization, audioStyle: project.monetAudioStyle, portraitSource: project.monetPortraitSource, portraitStyle: project.monetPortraitStyle, portraitOffsetX: project.monetPortraitOffsetX, showPortraitDragHanger: false }}
    pendoloTuning={{ ...DEFAULT_PENDOLO_TUNING, tickSnappiness: Math.max(.6, project.intensity * 2), activeScale: 1.15 + project.intensity * .1 }}
    sonnetTuning={{ ...DEFAULT_SONNET_TUNING, cameraIntensity: project.intensity, typographyMotion: project.intensity }}
    temperaTuning={{ ...DEFAULT_TEMPERA_TUNING, cameraIntensity: project.intensity, glyphMotion: project.intensity, layerImages: project.temperaLayerImages }}
    onLyricLineSeek={lyricTime => parent.postMessage({ type: 'verse:seek', time: lyricTime + project.offset }, location.origin)}/>;
  return <Boundary errorLabel={t('folia.loadFailed')} key={project.template}><Suspense fallback={<div className="folia-loading">{t('folia.loading')}</div>}><div className="relative h-full w-full overflow-hidden">{customAurora ? <div data-capture-background style={{ display: 'contents' }}><StudioAuroraBackground mode={project.background === 'aurora-curtain' ? 'aurora-curtain' : 'aurora-nebula'} currentTime={time} audioBands={audioBands} theme={theme} isDaylight={project.palette === 'paper'}/></div> : null}<div data-capture-renderer className="absolute inset-0">{renderer}</div><SongIntro project={project} time={time} coverUrl={artwork.coverUrl}/></div></Suspense></Boundary>;
}
const root = createRoot(document.getElementById('folia-root')!);
root.render(<FoliaHost/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
