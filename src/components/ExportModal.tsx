import type { FrameProgress } from '../export/progress';
import { isValidExportRange } from '../export/range';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, CircleAlert, Film, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlaybackClock } from '../audio/clock';
import { dimensions, type Project } from '../domain/model';
import { downloadBlob } from '../persistence/project';
import { Modal } from './Modal';
import { RecordingFocus } from './RecordingFocus';
import { VideoResult } from './VideoResult';
import { canExportDirect, canExportFrames, canCompositeProject, regionCaptureAvailable } from '../export/capabilities';
import { exportMessage } from '../export/messages';
import type { AudioAnalysis } from '../audio/analysis';
import { ensureProjectFont } from '../fonts/fonts';
import { preventExportExit } from '../export/lifecycle';

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  format: 'mp4' | 'webm';
  createdAt: number;
}
// Encoding loads only when the export surface is opened.
export function ExportModal({ project, buffer, peaks, audioAnalysis, close, clock, artifact, setArtifact, confirmDiscard = true }: { project: Project; buffer: AudioBuffer | null; peaks: number[]; audioAnalysis: AudioAnalysis; clock: PlaybackClock; close: () => void; artifact: ExportArtifact | null; setArtifact: (artifact: ExportArtifact | null) => void; confirmDiscard?: boolean }) {
  const { t } = useTranslation();
  const [captureMethod, setCaptureMethod] = useState<'standard' | 'native' | 'direct' | 'worker' | 'layered'>('standard');
  const [captureBackend, setCaptureBackend] = useState('');
  const directReady = canExportDirect(project);
  useEffect(() => { if (!directReady && (captureMethod === 'direct' || captureMethod === 'worker')) setCaptureMethod('standard'); }, [directReady, captureMethod]);
  const fastFolia = canExportFrames(project);
  const [height, setHeight] = useState(720), [format, setFormat] = useState<'mp4' | 'webm'>('mp4'), [mode, setMode] = useState<'offline' | 'realtime'>(!project.template.startsWith('folia-') || fastFolia ? 'offline' : 'realtime');
  const needsRegion = mode === 'realtime' && project.template.startsWith('folia-') && (project.template !== 'folia-fume' || !canCompositeProject(project));
  const regionReady = !needsRegion || regionCaptureAvailable();
  const [range, setRange] = useState({ start: 0, end: project.duration });
  const [support, setSupport] = useState<{ mp4: boolean; webm: boolean } | null>(null), [error, setError] = useState('');
  const [running, setRunning] = useState(false), [progress, setProgress] = useState(0), [status, setStatus] = useState('');
  const [frameStats, setFrameStats] = useState<FrameProgress | undefined>();
  const [fontReady, setFontReady] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => { const update = () => setHidden(document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  const paused = running && mode === 'offline' && hidden;
  const controller = useRef<AbortController | null>(null);
  const [w, h] = dimensions(project.ratio, height);
  useEffect(() => { if (!fastFolia && project.template.startsWith('folia-')) setMode('realtime'); }, [fastFolia, project.template]);
  useEffect(() => {
    let alive = true; setSupport(null); setError('');
    const detect = async () => {
      if (!buffer) throw new Error(t('export.audioMissing'));
      if (mode === 'offline') { const { supportedFormats } = await import('../export/video'); return supportedFormats(w, h, buffer); }
      const { recordingMime } = await import('../export/realtime'); return { mp4: !!recordingMime('mp4'), webm: !!recordingMime('webm') };
    };
    void detect().then(s => { if (alive) { setSupport(s); if (!s.mp4 && s.webm) setFormat('webm'); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [w, h, buffer, mode]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { let alive = true; setFontReady(null); void ensureProjectFont(project).then(() => { if (alive) setFontReady(true); }).catch(() => { if (alive) setFontReady(false); }); return () => { alive = false; }; }, [project.font, project.customFontName, project.fontWeight]);
  const untimedCount = project.lines.filter(l => l.start === null || l.end === null).length;
  const untimed = untimedCount > 0;
  const estimated = project.lines.some(l => l.precision === 'estimated');
  const outOfRange = project.lines.some(l => l.start !== null && l.start + project.offset >= project.duration);
  const validRange = isValidExportRange(range.start, range.end, project.duration);
  const codecReady = !!support?.[format];
  const canExport = !!buffer && !untimed && !outOfRange && validRange && codecReady && fontReady !== null && regionReady && (mode !== 'offline' || !project.template.startsWith('folia-') || fastFolia);
  const rangeDuration = Math.max(0, range.end - range.start);
  const start = async () => {
    if (!buffer || !validRange || controller.current) return;
    setCaptureBackend(''); setRunning(true); setFrameStats(undefined); setError(''); setProgress(0); setStatus(t('export.preparing')); controller.current = new AbortController();
    const allowExit = preventExportExit();
    try { const options = { captureMethod, height, fps: 30, start: range.start, end: range.end, format }; const report = (p: number, text: string, frames?: FrameProgress) => { setProgress(p); setStatus(text); setFrameStats(frames); };
      const blob = project.template.startsWith('folia-') ? mode === 'offline' ? await (await import('../export/foliaFrames')).exportFoliaFrames(project, buffer, audioAnalysis, options, clock, controller.current.signal, report, setCaptureBackend) : await (await import('../export/folia')).recordFolia(project, buffer, audioAnalysis, options, clock, controller.current.signal, report) : mode === 'offline' ? await (await import('../export/video')).exportVideo(project, buffer, peaks, options, controller.current.signal, report) : await (await import('../export/realtime')).recordVideo(project, buffer, peaks, options, controller.current.signal, report, clock);
      setArtifact({ blob, filename: `${project.title}.${format}`, width: w, height: h, format, createdAt: Date.now() }); setProgress(1); setStatus(t('export.complete'));
    } catch (e) { setError(e instanceof Error ? e.message : t('export.failed')); } finally { allowExit(); controller.current = null; setRunning(false); }
  };
  const checks = [
    ...(needsRegion ? [{ ok: regionReady, pending: false, text: exportMessage(regionReady ? 'captureCheck' : 'captureUnavailable') }] : []),
    { ok: !!buffer, pending: false, text: buffer ? t('export.audioOk') : t('export.audioMissing') },
    { ok: true, pending: false, text: project.lines.length ? t('export.lyricsOk', { count: project.lines.length }) : t('export.instrumental') },
    { ok: !untimed && !outOfRange, pending: false, text: untimed ? t('export.timingMissing', { count: untimedCount }) : outOfRange ? t('export.outOfRangeShort') : t('export.timingOk') },
    { ok: validRange, pending: false, text: validRange ? t('export.rangeOk', { duration: rangeDuration.toFixed(1), frames: Math.ceil(rangeDuration * 30) }) : t('export.rangeInvalid') },
    { ok: fontReady !== false, pending: fontReady === null, text: fontReady === null ? t('export.fontChecking') : fontReady ? t('export.fontOk') : t('export.fontError') },
    { ok: codecReady, pending: support === null, text: support === null ? t('export.codecChecking') : codecReady ? t('export.codecOk', { format: format.toUpperCase() }) : t('export.codecError') },
  ];
  if (running && mode === 'realtime') return <Modal title={t('export.realtimeLabel')} close={close} busy className="recording-dialog"><RecordingFocus progress={progress} duration={rangeDuration} status={status === exportMessage('recording') ? t('export.recordingLabel') : status} cancel={() => controller.current?.abort()}/></Modal>;
  return <Modal title={t('export.title')} close={close} busy={running} className="export-dialog"><div className="export-dialog-body"><div className="export-summary"><Film size={26}/><div><strong>{project.title}</strong><p>{w} × {h} · 30 fps · {t('export.containsAudio')}</p></div></div>
    <div className="export-layout"><section className="export-settings" aria-labelledby="export-settings-title"><h3 id="export-settings-title">{t('export.settingsTitle')}</h3><fieldset disabled={running}><div className="form-row"><label>{t('export.resolution')}<select value={height} onChange={e => setHeight(Number(e.target.value))}><option value={720}>720p · {t('export.standard')}</option><option value={1080}>1080p · {t('export.hd')}</option></select></label><label>{t('export.format')}<select value={format} onChange={e => setFormat(e.target.value as 'mp4' | 'webm')}><option value="mp4" disabled={!support?.mp4}>MP4 {support && !support.mp4 ? `· ${t('export.unsupported')}` : ''}</option><option value="webm" disabled={!support?.webm}>WebM {support && !support.webm ? `· ${t('export.unsupported')}` : ''}</option></select></label></div>
    <fieldset className="export-mode-control"><legend>{t('export.method')}</legend><div className="export-mode-options"><label><input type="radio" name="export-mode" value="offline" checked={mode === 'offline'} disabled={project.template.startsWith('folia-') && !fastFolia} onChange={() => setMode('offline')}/><span>{t('export.offline')}</span></label><label><input type="radio" name="export-mode" value="realtime" checked={mode === 'realtime'} onChange={() => setMode('realtime')}/><span>{t('export.realtimeLabel')}</span></label></div></fieldset>
    {mode === 'offline' && project.template.startsWith('folia-') && <><label className="form-label">{t('export.captureMethod')}<select value={captureMethod} onChange={e => setCaptureMethod(e.target.value as typeof captureMethod)}><option value="standard">{t('export.captureStandard')}</option><option value="layered" disabled={typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'}>{t('export.captureLayered')}</option><option value="native">{t('export.captureNative')}</option>{directReady && <><option value="direct">{t('export.captureDirect')}</option><option value="worker" disabled={typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'}>{t('export.captureWorker')}</option></>}</select></label>{captureMethod !== 'standard' && <details className="export-method-details"><summary>{t('export.methodDetails')}</summary><p>{t(captureMethod === 'layered' ? 'export.layeredNotice' : captureMethod === 'worker' ? 'export.workerNotice' : captureMethod === 'direct' ? 'export.directNotice' : 'export.nativeNotice')}</p></details>}</>}
    <div className="form-row"><label>{t('export.start')}<input type="number" min="0" step="0.01" value={Number(range.start.toFixed(2))} onChange={e => setRange({ ...range, start: Number(e.target.value) })}/></label><label>{t('export.end')}<input type="number" min="0" step="0.01" max={Number(project.duration.toFixed(2))} value={Number(range.end.toFixed(2))} onChange={e => setRange({ ...range, end: Number(e.target.value) })}/></label></div></fieldset></section><aside className="export-guidance">

    {mode === 'offline' && project.template.startsWith('folia-') && captureMethod !== 'standard' && captureBackend && <p role="status" className="field-note">{t(captureBackend === 'layered' ? 'export.layeredActive' : captureBackend === 'worker' ? 'export.workerActive' : captureBackend === 'direct' ? 'export.directActive' : captureBackend === 'native' ? 'export.nativeActive' : captureMethod === 'layered' ? 'export.layeredFallback' : 'export.nativeFallback')}</p>}
    <section className="export-preflight"><h3>{t('export.preflight')}</h3><div className="preflight-grid">{checks.map((check, index) => <div key={index} className={check.pending ? 'pending' : check.ok ? 'pass' : 'fail'}>{check.pending ? <Loader2 className="spin" size={14}/> : check.ok ? <CheckCircle2 size={14}/> : <CircleAlert size={14}/>}<span>{check.text}</span></div>)}</div>{estimated && <p><CircleAlert size={13}/>{t('export.estimatedWarning')}</p>}</section>
    <section className="export-notice" aria-labelledby="export-notice-title"><h3 id="export-notice-title">{t('export.noticeTitle')}</h3><p>{t('export.durationNotice')}</p><p>{t(mode === 'offline' ? 'export.pauseNotice' : 'export.visibilityNotice')}</p><p>{mode === 'offline' ? t('export.limitOffline') : t('export.limitRealtime')}</p></section>
    {project.template.startsWith('folia-') && <p className="field-note">{mode === 'offline' ? t('export.fastNote') : needsRegion ? t('export.domNote') : t('export.canvasNote')}</p>}
    {needsRegion && !regionReady && <p role="alert" className="warning">{exportMessage('regionMissing')}</p>}
    {project.background === 'common' && needsRegion && <p className="field-note">{exportMessage('commonRecording')}</p>}
    {untimed && <p className="warning">{t('export.untimedWarning')}</p>}{outOfRange && <p className="warning">{t('export.outOfRange')}</p>}{!validRange && <p className="warning">{t('export.rangeInvalid')}</p>}
    {!support && !error && <p className="field-note">{t('export.detecting')}</p>}{support && !support.mp4 && !support.webm && <p className="warning">{t('export.noCodec')}</p>}
    </aside></div>
    <div className="export-feedback">{running && <div className="export-progress"><progress value={progress} max="1"/><span role="status">{paused ? t('export.paused') : status}</span><b>{Math.round(progress * 100)}%</b></div>}
    {running && frameStats && <p className="field-note">{t('export.speedStats', { fps: frameStats.fps.toFixed(1), remaining: `${Math.floor(Math.ceil(frameStats.remainingSeconds) / 60)}:${(Math.ceil(frameStats.remainingSeconds) % 60).toString().padStart(2, '0')}` })}</p>}
    {error && <p role="alert" className="warning">{error}</p>}{artifact && <div className="export-success"><CheckCircle2 size={19}/><span>{artifact.filename} · {(artifact.blob.size / 1024 / 1024).toFixed(1)} MB · {artifact.width} × {artifact.height}</span></div>}
    {artifact && <><VideoResult blob={artifact.blob}/><p className="export-retained">{t('export.retained')}</p></>}
    </div></div><div className="modal-actions export-dialog-footer"><div>{running ? <button onClick={() => controller.current?.abort()}>{t('export.cancel')}</button> : <button onClick={close}>{t('export.back')}</button>}{artifact && !running ? <><button className="discard-export" onClick={() => { if (!confirmDiscard || window.confirm(t('export.discardConfirm'))) setArtifact(null); }}>{t('export.discard')}</button><button disabled={!canExport} onClick={() => void start()}>{t('export.retry')}</button></> : null}</div>{artifact && !running ? <button className="primary" onClick={() => downloadBlob(artifact.blob, artifact.filename)}><ArrowDownToLine size={15}/>{t('export.download')}</button> : <button className="primary" disabled={running || !canExport} onClick={() => void start()}>{running ? <Loader2 className="spin" size={15}/> : <ArrowDownToLine size={15}/>} {running ? t('export.exporting') : t('export.startExport')}</button>}</div>
  </Modal>;
}
