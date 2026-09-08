import { lazy, Suspense, useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import type { Project } from '../domain/model';
import { timeLabel } from '../domain/model';
import type { PlaybackClock } from '../audio/clock';
import { FoliaStage } from './FoliaStage';
import type { AudioAnalysis } from '../audio/analysis';
import { useTranslation } from 'react-i18next';
const LegacyCanvas = lazy(() => import('./LegacyCanvas'));
// React owns controls; continuous drawing is isolated inside this canvas.
export function Stage({ project, peaks, audioAnalysis, clock, fontBlob, coverBlob, monetPortraitBlob, change, onError }: { project: Project; change: (patch: Partial<Project>) => void; peaks: number[]; audioAnalysis: AudioAnalysis; clock: PlaybackClock; fontBlob: Blob | null; coverBlob: Blob | null; monetPortraitBlob: Blob | null; onError: (s: string) => void }) {
  const { t } = useTranslation();
  const stage = useRef<HTMLDivElement>(null), label = useRef<HTMLSpanElement>(null);
  const playing = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  useEffect(() => {
    let id = 0, alive = true;
    const draw = () => { if (!alive) return; if (label.current) label.current.textContent = timeLabel(clock.tick()); id = requestAnimationFrame(draw); }; draw();
    return () => { alive = false; cancelAnimationFrame(id); };
  }, [clock]);
  const toggle = () => playing ? clock.pause() : void clock.play().catch(e => onError(e.message));
  const [ratioWidth, ratioHeight] = project.ratio.split(':').map(Number);
  return <section className="stage-area">
    <div className="stage-toolbar"><span><i className="status-dot" /> {t('stage.live')}</span><div className="stage-view-controls"><div className="stage-ratio-options" role="group" aria-label={t('inspector.ratio')}>{(['16:9', '9:16', '1:1'] as const).map(ratio => <button key={ratio} type="button" aria-pressed={project.ratio === ratio} onClick={() => change({ ratio })}>{ratio}</button>)}</div><span className="stage-fit-label">{t('stage.fit')}</span></div><button className="icon-button" data-tooltip={t('stage.fullscreen')} aria-label={t('stage.fullscreen')} onClick={() => { void stage.current?.requestFullscreen().catch(e => onError(e.message)); }}><Maximize2 size={15}/></button></div>
    <div className="stage-frame-slot"><div className={`stage-surround ratio-${project.ratio.replace(':', '-')}`} style={{ '--ratio-width': ratioWidth, '--ratio-height': ratioHeight } as CSSProperties} ref={stage}>{project.template.startsWith('folia-') ? <FoliaStage project={project} audioAnalysis={audioAnalysis} clock={clock} fontBlob={fontBlob} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob}/> : <Suspense fallback={null}><LegacyCanvas project={project} peaks={peaks} clock={clock}/></Suspense>}<span className="canvas-corner top-left"/><span className="canvas-corner bottom-right"/></div></div>
    <div className="transport"><div className="volume"><Volume2 size={15}/><input aria-label={t('stage.volume')} type="range" min="0" max="1" step="0.05" defaultValue="1" onChange={e => { clock.audio.volume = Number(e.target.value); }}/></div>
      <div className="transport-buttons"><button className="icon-button" data-tooltip={t('stage.previous')} aria-label={t('stage.previous')} onClick={() => { const starts = project.lines.map(l => (l.start ?? 0) + project.offset).filter(t => t < clock.time - 0.1); clock.seek(starts.at(-1) ?? 0); }}><SkipBack size={17}/></button><button className="play-button" data-tooltip={playing?t('stage.pause'):t('stage.play')} aria-label={playing?t('stage.pause'):t('stage.play')} onClick={toggle}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button className="icon-button" data-tooltip={t('stage.next')} aria-label={t('stage.next')} onClick={() => clock.seek(project.lines.map(l => (l.start ?? 0) + project.offset).find(t => t > clock.time + 0.1) ?? project.duration)}><SkipForward size={17}/></button></div>
      <div className="timecode"><span ref={label}>00:00.0</span><span className="dim"> / {timeLabel(project.duration)}</span></div></div>
  </section>;
}
