import React, { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMotionValue } from 'framer-motion';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Project } from '../domain/model';
import { foliaLines, foliaTheme } from './adapter';
import { DEFAULT_FUME_TUNING } from '../vendor/folia/types';
import { getLineRenderEndTime } from '../vendor/folia/utils/lyrics/renderHints';
import { ensureProjectFont } from '../fonts/fonts';
import './style.css';
// A fixed-size iframe gives original window-relative layouts their own real viewport.
void i18n.use(initReactI18next).init({ lng: 'zh', fallbackLng: 'zh', resources: { zh: { translation: { ui: { waitingForMusic: '等待音乐', waitingForLyrics: '等待歌词', nextLine: '下一句' } } } }, interpolation: { escapeValue: false } });
const renderers = {
  'folia-monet': lazy(() => import('../vendor/folia/components/visualizer/monet/VisualizerMonet')),
  'folia-cappella': lazy(() => import('../vendor/folia/components/visualizer/cappella/VisualizerCappella')),
  'folia-diorama': lazy(() => import('../vendor/folia/components/visualizer/diorama/VisualizerDiorama')),
  'folia-curtain': lazy(() => import('../aurora/AuroraStudio')),
  'folia-aurora': lazy(() => import('../aurora/AuroraStudio')),
  'folia-fume': lazy(() => import('../vendor/folia/components/visualizer/fume/VisualizerFume')),
  'folia-classic': lazy(() => import('../vendor/folia/components/visualizer/classic/Visualizer')),
  'folia-partita': lazy(() => import('../vendor/folia/components/visualizer/partita/VisualizerPartita')),
  'folia-cadenza': lazy(() => import('../vendor/folia/components/visualizer/cadenza/VisualizerCadenza')),
  'folia-tilt': lazy(() => import('../vendor/folia/components/visualizer/tilt/VisualizerTilt')),
  'folia-claddagh': lazy(() => import('../vendor/folia/components/visualizer/claddagh/VisualizerCladdagh')),
};
class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' }; static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <div className="folia-failure">模板加载失败：{this.state.error}</div> : this.props.children; }
}
function FoliaHost() {
  const [project, setProject] = useState<Project | null>(null), [index, setIndex] = useState(-1), [paused, setPaused] = useState(true), [epoch, setEpoch] = useState(0);
  const time = useMotionValue(0), power = useMotionValue(0), bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
  const lines = useMemo(() => project ? foliaLines(project) : [], [project]); const theme = useMemo(() => project ? foliaTheme(project) : null, [project]);
  const refs = useRef({ lines, project, previous: 0 }); refs.current.lines = lines; refs.current.project = project;
  useEffect(() => { if (project) void ensureProjectFont(project); }, [project?.font, project?.customFontName, project?.fontWeight]);
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'verse:project') { setProject(e.data.project); return; }
      if (e.data.type === 'verse:font' && e.data.buffer instanceof ArrayBuffer) { const family = typeof e.data.family === 'string' && e.data.family ? e.data.family : 'Verse Local Font'; const face = new FontFace(family, e.data.buffer); void face.load().then(loaded => { document.fonts.add(loaded); setEpoch(value => value + 1); }); return; }
      if (e.data.type === 'verse:capture' && typeof e.data.requestId === 'string') {
        const requestId = e.data.requestId;
        requestAnimationFrame(() => {
          const canvases = [...document.querySelectorAll('canvas')].filter(canvas => canvas.isConnected && canvas.width > 0 && canvas.height > 0);
          const largest = canvases.reduce<HTMLCanvasElement | null>((best, canvas) => !best || canvas.width * canvas.height > best.width * best.height ? canvas : best, null);
          if (!largest) { parent.postMessage({ type: 'verse:capture-result', requestId, error: '画布尚未准备好' }, location.origin); return; }
          const composite = document.createElement('canvas'); composite.width = largest.width; composite.height = largest.height;
          const context = composite.getContext('2d');
          if (!context) { parent.postMessage({ type: 'verse:capture-result', requestId, error: '无法合成画布帧' }, location.origin); return; }
          for (const canvas of canvases) context.drawImage(canvas, 0, 0, composite.width, composite.height);
          void createImageBitmap(composite).then(bitmap => parent.postMessage({ type: 'verse:capture-result', requestId, bitmap }, location.origin, [bitmap])).catch(() => parent.postMessage({ type: 'verse:capture-result', requestId, error: '无法读取画布帧' }, location.origin));
        });
        return;
      }
      if (e.data.type === 'verse:tick') {
        const p = refs.current.project; if (!p) return;
        const t = e.data.time - p.offset;
        if (!Number.isFinite(t)) return;
        // Remount only on an explicit seek to clear real-time spring/exit history.
        if (Math.abs(t - refs.current.previous) > 0.8) setEpoch(n => n + 1);
        refs.current.previous = t;
        time.set(t); setPaused(!e.data.playing);
        const live = refs.current.lines.findLastIndex((l, i, all) => t >= l.startTime && t < Math.min(getLineRenderEndTime(l), all[i + 1]?.startTime ?? Infinity)); setIndex(old => old === live ? old : live);
        const level = Math.max(0, Math.min(1, Number(e.data.power) || 0)); power.set(level); bass.set(level * 0.75); lowMid.set(level * 0.7); mid.set(level * 0.8); vocal.set(level); treble.set(level * 0.5);
      }
    };
    window.addEventListener('message', handle); parent.postMessage({ type: 'verse:ready' }, location.origin);
    return () => window.removeEventListener('message', handle);
  }, [time, power, bass, lowMid, mid, vocal, treble]);
  if (!project || !theme) return <div className="folia-loading">正在准备 Folia 舞台…</div>;
  const Renderer = renderers[project.template as keyof typeof renderers] ?? renderers['folia-fume'];
  return <Boundary key={`${project.template}-${epoch}`}><Suspense fallback={<div className="folia-loading">正在加载原版动画…</div>}><Renderer {...{ auroraBackground: project.template === 'folia-curtain' ? 'curtain' as const : 'nebula' as const }} currentTime={time} currentLineIndex={index} lines={lines} theme={theme} audioPower={power} audioBands={{ bass, lowMid, mid, vocal, treble }} paused={paused} showText seed={project.seed} lyricsFontScale={project.fontScale} isDaylight={project.palette === 'paper'} songTitle={project.title} songArtist={project.artist} isPlayerChromeHidden hideTranslationSubtitle showSubtitleTranslation={false} fumeTuning={{ ...DEFAULT_FUME_TUNING, cameraSpeed: project.intensity, disableGeometricBackground: false }} onLyricLineSeek={t => parent.postMessage({ type: 'verse:seek', time: t + project.offset }, location.origin)}/></Suspense></Boundary>;
}
const root = createRoot(document.getElementById('folia-root')!);
root.render(<FoliaHost/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
