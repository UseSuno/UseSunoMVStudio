import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Film, Loader2 } from 'lucide-react';
import type { PlaybackClock } from '../audio/clock';
import { dimensions, type Project } from '../domain/model';
import { downloadBlob } from '../persistence/project';
import { Modal } from './Modal';
import { VideoResult } from './VideoResult';
// Encoding loads only when the export surface is opened.
export function ExportModal({ project, buffer, peaks, close, clock }: { project: Project; buffer: AudioBuffer | null; peaks: number[]; clock: PlaybackClock; close: () => void }) {
  const fastFolia = ['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-curtain'].includes(project.template);
  const [height, setHeight] = useState(720), [format, setFormat] = useState<'mp4' | 'webm'>('mp4'), [mode, setMode] = useState<'offline' | 'realtime'>(!project.template.startsWith('folia-') || fastFolia ? 'offline' : 'realtime');
  const [range, setRange] = useState({ start: 0, end: project.duration });
  const [support, setSupport] = useState<{ mp4: boolean; webm: boolean } | null>(null), [error, setError] = useState('');
  const [running, setRunning] = useState(false), [progress, setProgress] = useState(0), [status, setStatus] = useState(''), [result, setResult] = useState<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [w, h] = dimensions(project.ratio, height);
  useEffect(() => {
    let alive = true; setSupport(null); setError('');
    const detect = async () => {
      if (!buffer) throw new Error('请先导入可播放的音频。');
      if (mode === 'offline') { const { supportedFormats } = await import('../export/video'); return supportedFormats(w, h, buffer); }
      const { recordingMime } = await import('../export/realtime'); return { mp4: !!recordingMime('mp4'), webm: !!recordingMime('webm') };
    };
    void detect().then(s => { if (alive) { setSupport(s); if (!s.mp4 && s.webm) setFormat('webm'); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [w, h, buffer, mode]);
  useEffect(() => () => controller.current?.abort(), []);
  const untimed = project.lines.some(l => l.start === null || l.end === null);
  const outOfRange = project.lines.some(l => l.start !== null && l.start + project.offset >= project.duration);
  const validRange = Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start && range.end <= project.duration + 0.01 && range.end - range.start <= 300;
  const start = async () => {
    if (!buffer || !validRange) return;
    setRunning(true); setResult(null); setError(''); setProgress(0); setStatus('准备字体与编码器…'); controller.current = new AbortController();
    try { const options = { height, fps: 30, start: range.start, end: range.end, format }; const report = (p: number, text: string) => { setProgress(p); setStatus(text); };
      const blob = project.template.startsWith('folia-') ? mode === 'offline' ? await (await import('../export/foliaFrames')).exportFoliaFrames(project, buffer, peaks, options, clock, controller.current.signal, report) : await (await import('../export/folia')).recordFolia(project, buffer, peaks, options, clock, controller.current.signal, report) : mode === 'offline' ? await (await import('../export/video')).exportVideo(project, buffer, peaks, options, controller.current.signal, report) : await (await import('../export/realtime')).recordVideo(project, buffer, peaks, options, controller.current.signal, report);
      setResult(blob); setProgress(1); setStatus('视频已生成，可下载');
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败'); } finally { setRunning(false); }
  };
  return <Modal title="导出歌词影片" close={close} busy={running}><div className="export-summary"><Film size={26}/><div><strong>{project.title}</strong><p>{w} × {h} · 30 fps · 包含音频</p></div></div>
    <fieldset disabled={running}><div className="form-row"><label>分辨率<select value={height} onChange={e => { setHeight(Number(e.target.value)); setResult(null); }}><option value={720}>720p · 标准</option><option value={1080}>1080p · 高清</option></select></label><label>视频格式<select value={format} onChange={e => { setFormat(e.target.value as 'mp4' | 'webm'); setResult(null); }}><option value="mp4" disabled={!support?.mp4}>MP4 {support && !support.mp4 ? '· 不支持' : ''}</option><option value="webm" disabled={!support?.webm}>WebM {support && !support.webm ? '· 不支持' : ''}</option></select></label></div>
    <label className="form-label">导出方式<select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setResult(null); }}><option value="offline" disabled={project.template.startsWith('folia-') && !fastFolia}>快速逐帧 · 无需完整播放</option><option value="realtime">{project.template.startsWith('folia-') ? '兼容录制 · 保留原始动画' : '兼容录制 · 需要完整播放'}</option></select></label>
    <div className="form-row"><label>开始时间 / 秒<input type="number" min="0" step="0.1" value={range.start} onChange={e => { setRange({ ...range, start: Number(e.target.value) }); setResult(null); }}/></label><label>结束时间 / 秒<input type="number" min="0" step="0.1" max={project.duration} value={range.end} onChange={e => { setRange({ ...range, end: Number(e.target.value) }); setResult(null); }}/></label></div></fieldset>
    <p className="field-note">当前版本每次最多导出 5 分钟。{mode === 'offline' ? '按固定时间逐帧编码，通常快于歌曲时长，处理速度取决于设备。' : '此主题含真实时间的 DOM 或 3D 动画；录制期间请保持页面可见。'}</p>
    {project.template.startsWith('folia-') && <p className="field-note">{fastFolia ? (mode === 'offline' ? '此模板使用固定时间逐帧渲染，无需共享屏幕，也无需等待歌曲完整播放。' : '兼容模式直接录制画布，无需共享屏幕。') : '此模板包含 DOM 动画，需在浏览器提示中选择当前 Studio 标签页。画布会自动裁切；清晰度取决于画布显示大小。'}</p>}
    {untimed && <p className="warning">还有未校时的歌词，请完成打点或生成估算时间后再导出。</p>}{outOfRange && <p className="warning">部分歌词在音频结束后，请调整时间或整体偏移。</p>}{!validRange && <p className="warning">请选择音频范围内、不超过 300 秒的有效区间。</p>}
    {!support && !error && <p className="field-note">正在检测音视频编码能力…</p>}{support && !support.mp4 && !support.webm && <p className="warning">当前方式无可用编码组合，请切换兼容录制或使用其他浏览器。</p>}
    {running && <div className="export-progress"><progress value={progress} max="1"/><span>{status}</span><b>{Math.round(progress * 100)}%</b></div>}
    {error && <p role="alert" className="warning">{error}</p>}{result && <div className="export-success"><CheckCircle2 size={19}/><span>视频已生成 · {(result.size / 1024 / 1024).toFixed(1)} MB</span></div>}
    {result && <VideoResult blob={result}/>}
    <div className="modal-actions">{running ? <button onClick={() => controller.current?.abort()}>取消导出</button> : <button onClick={close}>返回编辑</button>}{result ? <button className="primary" onClick={() => downloadBlob(result, `${project.title}.${format}`)}><ArrowDownToLine size={15}/>下载视频</button> : <button className="primary" disabled={running || !buffer || !support?.[format] || untimed || outOfRange || !validRange} onClick={() => void start()}>{running ? <Loader2 className="spin" size={15}/> : <ArrowDownToLine size={15}/>} {running ? '正在导出' : '开始导出'}</button>}</div>
  </Modal>;
}
