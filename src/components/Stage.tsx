import { useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import type { Project } from '../domain/model';
import { timeLabel } from '../domain/model';
import type { PlaybackClock } from '../audio/clock';
import { compileProject } from '../renderer/compile';
import { drawFrame } from '../renderer/draw';
import { FoliaStage } from './FoliaStage';
// React owns controls; continuous drawing is isolated inside this canvas.
export function Stage({ project, peaks, clock, fontBlob, coverBlob, monetPortraitBlob, onError }: { project: Project; peaks: number[]; clock: PlaybackClock; fontBlob: Blob | null; coverBlob: Blob | null; monetPortraitBlob: Blob | null; onError: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), label = useRef<HTMLSpanElement>(null);
  const playing = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const plan = useMemo(() => compileProject(project, peaks), [project, peaks]);
  useEffect(() => {
    let id = 0, alive = true, previous = -1;
    const draw = () => { if (!alive) return; const t = clock.tick(); const ctx = canvas.current?.getContext('2d'); if (ctx && t !== previous) { drawFrame(ctx, plan, t); previous = t; } if (label.current) label.current.textContent = timeLabel(t); id = requestAnimationFrame(draw); };
    void document.fonts.ready.then(draw);
    return () => { alive = false; cancelAnimationFrame(id); };
  }, [plan, clock]);
  const toggle = () => playing ? clock.pause() : void clock.play().catch(e => onError(e.message));
  const [ratioWidth, ratioHeight] = project.ratio.split(':').map(Number);
  return <section className="stage-area">
    <div className="stage-toolbar"><span><i className="status-dot" /> 实时预览</span><span>{project.ratio} <span className="dim">/</span> 适合画布</span><button title="全屏预览" aria-label="全屏预览" onClick={() => { void stage.current?.requestFullscreen().catch(e => onError(e.message)); }}><Maximize2 size={15}/></button></div>
    <div className="stage-frame-slot"><div className={`stage-surround ratio-${project.ratio.replace(':', '-')}`} style={{ '--ratio-width': ratioWidth, '--ratio-height': ratioHeight } as CSSProperties} ref={stage}>{project.template.startsWith('folia-') ? <FoliaStage project={project} peaks={peaks} clock={clock} fontBlob={fontBlob} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob}/> : <canvas ref={canvas} width={plan.width} height={plan.height} aria-label={`${project.title}歌词动画预览`} />}<span className="canvas-corner top-left"/><span className="canvas-corner bottom-right"/></div></div>
    <div className="transport"><div className="volume"><Volume2 size={15}/><input aria-label="播放音量" type="range" min="0" max="1" step="0.05" defaultValue="1" onChange={e => { clock.audio.volume = Number(e.target.value); }}/></div>
      <div className="transport-buttons"><button aria-label="上一句" onClick={() => { const starts = project.lines.map(l => (l.start ?? 0) + project.offset).filter(t => t < clock.time - 0.1); clock.seek(starts.at(-1) ?? 0); }}><SkipBack size={17}/></button><button className="play-button" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button aria-label="下一句" onClick={() => clock.seek(project.lines.map(l => (l.start ?? 0) + project.offset).find(t => t > clock.time + 0.1) ?? project.duration)}><SkipForward size={17}/></button></div>
      <div className="timecode"><span ref={label}>00:00.0</span><span className="dim"> / {timeLabel(project.duration)}</span></div></div>
  </section>;
}
