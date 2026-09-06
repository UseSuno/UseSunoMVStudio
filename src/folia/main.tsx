import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMotionValue } from 'framer-motion';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Project } from '../domain/model';
import { foliaLines, foliaTheme } from './adapter';
import { DEFAULT_DIORAMA_TUNING, DEFAULT_FUME_TUNING, DEFAULT_MONET_TUNING, DEFAULT_PENDOLO_TUNING, DEFAULT_SONNET_TUNING, DEFAULT_TEMPERA_TUNING } from '../vendor/folia/types';
import { getLineRenderEndTime } from '../vendor/folia/utils/lyrics/renderHints';
import { ensureProjectFont } from '../fonts/fonts';
import useFontsEpoch from '../vendor/folia/hooks/useFontsEpoch';
import { getStudioVisualizer } from './registry';
import { StudioAuroraBackground } from '../aurora/StudioAuroraBackground';
import './style.css';
// A fixed-size iframe gives original window-relative layouts their own real viewport.
void i18n.use(initReactI18next).init({ lng: 'zh', fallbackLng: 'zh', resources: { zh: { translation: { ui: { waitingForMusic: '等待音乐', waitingForLyrics: '等待歌词', nextLine: '下一句' } } } }, interpolation: { escapeValue: false } });
function collectCanvasLayers(root: Document | ShadowRoot | Element, output: HTMLCanvasElement[] = []) {
  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLCanvasElement && child.isConnected && child.width > 0 && child.height > 0) output.push(child);
    if (child.shadowRoot) collectCanvasLayers(child.shadowRoot, output);
    collectCanvasLayers(child, output);
  }
  return output;
}
class Boundary extends Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' }; static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <div className="folia-failure">模板加载失败：{this.state.error}</div> : this.props.children; }
}
function FoliaHost() {
  const [project, setProject] = useState<Project | null>(null), [index, setIndex] = useState(-1), [paused, setPaused] = useState(true), [epoch, setEpoch] = useState(0), [artwork, setArtwork] = useState<{ coverUrl: string | null; portraitUrl: string | null }>({ coverUrl: null, portraitUrl: null });
  const time = useMotionValue(0), power = useMotionValue(0), bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
  const fontsEpoch = useFontsEpoch();
  const lines = useMemo(() => project ? foliaLines(project) : [], [project]); const theme = useMemo(() => project ? foliaTheme(project) : null, [project]);
  const refs = useRef({ lines, project, previous: 0 }); refs.current.lines = lines; refs.current.project = project;
  useEffect(() => { if (project) void ensureProjectFont(project); }, [project?.font, project?.customFontName, project?.fontWeight]);
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== parent || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'verse:project') { setProject(e.data.project); return; }
      if (e.data.type === 'verse:artwork') { setArtwork({ coverUrl: typeof e.data.coverUrl === 'string' ? e.data.coverUrl : null, portraitUrl: typeof e.data.portraitUrl === 'string' ? e.data.portraitUrl : null }); return; }
      if (e.data.type === 'verse:font' && e.data.buffer instanceof ArrayBuffer) { const family = typeof e.data.family === 'string' && e.data.family ? e.data.family : 'Verse Local Font'; const face = new FontFace(family, e.data.buffer); void face.load().then(loaded => { document.fonts.add(loaded); setEpoch(value => value + 1); }); return; }
      if (e.data.type === 'verse:capture' && typeof e.data.requestId === 'string') {
        const requestId = e.data.requestId;
        requestAnimationFrame(() => {
          const canvases = collectCanvasLayers(document);
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
        const sample = e.data.audio && typeof e.data.audio === 'object' ? e.data.audio : {};
        const amount = Math.max(0, Math.min(1, p.audioReactivityAmount ?? .7));
        const gain = p.audioReactivity === 'off' ? 0 : amount * (p.audioReactivity === 'rhythmic' ? 1.35 : .85);
        const signal = (key: string) => Math.max(0, Math.min(255, (Number(sample[key]) || 0) * gain));
        power.set(signal('power')); bass.set(signal('bass')); lowMid.set(signal('lowMid')); mid.set(signal('mid')); vocal.set(signal('vocal')); treble.set(signal('treble'));
      }
    };
    window.addEventListener('message', handle); parent.postMessage({ type: 'verse:ready' }, location.origin);
    return () => window.removeEventListener('message', handle);
  }, [time, power, bass, lowMid, mid, vocal, treble]);
  if (!project || !theme) return <div className="folia-loading">正在准备 Folia 舞台…</div>;
  const Renderer = getStudioVisualizer(project.template).renderer;
  const customAurora = project.background === 'aurora-nebula' || project.background === 'aurora-curtain';
  const renderer = <Renderer currentTime={time} currentLineIndex={index} lines={lines} theme={theme} audioPower={power} audioBands={{ bass, lowMid, mid, vocal, treble }} paused={paused} showText seed={project.seed} lyricsFontScale={project.fontScale} isDaylight={project.palette === 'paper'} songTitle={project.title} songArtist={project.artist} coverUrl={artwork.coverUrl} monetPortraitImage={artwork.portraitUrl ? { id: 'studio-monet-portrait', name: project.monetPortraitName || '自定义图片', url: artwork.portraitUrl } : null} isPlayerChromeHidden hideTranslationSubtitle showSubtitleTranslation={false}
    background={customAurora ? { transparent: true } : { mode: project.background }}
    fumeTuning={{ ...DEFAULT_FUME_TUNING, cameraSpeed: project.intensity, disableGeometricBackground: false }}
    dioramaTuning={{ ...DEFAULT_DIORAMA_TUNING, cameraSpeed: project.intensity, motionAmount: project.intensity, audioReactivity: project.audioReactivity === 'off' ? 0 : project.audioReactivityAmount * (project.audioReactivity === 'rhythmic' ? .8 : .38) }}
    monetTuning={{ ...DEFAULT_MONET_TUNING, showAudioVisualization: project.monetAudioVisualization, audioStyle: project.monetAudioStyle, portraitSource: project.monetPortraitSource, portraitStyle: project.monetPortraitStyle, portraitOffsetX: project.monetPortraitOffsetX, showPortraitDragHanger: false }}
    pendoloTuning={{ ...DEFAULT_PENDOLO_TUNING, tickSnappiness: Math.max(.6, project.intensity * 2), activeScale: 1.15 + project.intensity * .1 }}
    sonnetTuning={{ ...DEFAULT_SONNET_TUNING, cameraIntensity: project.intensity, typographyMotion: project.intensity }}
    temperaTuning={{ ...DEFAULT_TEMPERA_TUNING, cameraIntensity: project.intensity, glyphMotion: project.intensity, layerImages: project.temperaLayerImages }}
    onLyricLineSeek={lyricTime => parent.postMessage({ type: 'verse:seek', time: lyricTime + project.offset }, location.origin)}/>;
  return <Boundary key={`${project.template}-${epoch}-${fontsEpoch}`}><Suspense fallback={<div className="folia-loading">正在加载原版动画…</div>}><div className="relative h-full w-full overflow-hidden">{customAurora ? <StudioAuroraBackground mode={project.background === 'aurora-curtain' ? 'aurora-curtain' : 'aurora-nebula'} currentTime={time} audioBands={{ bass, lowMid, mid, vocal, treble }} theme={theme} isDaylight={project.palette === 'paper'}/> : null}{renderer}</div></Suspense></Boundary>;
}
const root = createRoot(document.getElementById('folia-root')!);
root.render(<FoliaHost/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
