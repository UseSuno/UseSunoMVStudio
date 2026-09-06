import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, AudioLines, Check, ChevronDown, FileUp, FolderOpen, Headphones, Loader2, Music2, Redo2, Save, Undo2, Upload, X } from 'lucide-react';
import { defaultProject, demoSource, type Project } from './domain/model';
import { parseLyrics, toLrc } from './import/lyrics';
import { decodeAudio, demoAudio, embeddedLyrics, envelope, type EmbeddedCandidate } from './audio/media';
import { PlaybackClock } from './audio/clock';
import { useProject } from './hooks/useProject';
import { downloadBlob, downloadProject, loadLocal, readProject, saveLocal } from './persistence/project';
import { Stage } from './components/Stage';
import { Timeline } from './components/Timeline';
import { LyricsPanel } from './components/LyricsPanel';
import { Inspector } from './components/Inspector';
import { Modal } from './components/Modal';
import { ExportModal, type ExportArtifact } from './components/ExportModal';
import { ensureProjectFont, installLocalFont } from './fonts/fonts';
import { realignTimedLinesToPlain } from './import/embedded';
// The editor coordinates user operations; clocks and render loops live outside app state.
const initial = () => defaultProject(parseLyrics(demoSource, 46).lines);
export default function App() {
  const { project, commit, replace, undo, redo, canUndo, canRedo } = useProject(initial());
  const [clock] = useState(() => new PlaybackClock());
  const [audio, setAudio] = useState<Blob | null>(null), [fontBlob, setFontBlob] = useState<Blob | null>(null), [coverBlob, setCoverBlob] = useState<Blob | null>(null), [monetPortraitBlob, setMonetPortraitBlob] = useState<Blob | null>(null), [buffer, setBuffer] = useState<AudioBuffer | null>(null), [peaks, setPeaks] = useState<number[]>([]);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState('正在准备工作台…'), [saveStatus, setSaveStatus] = useState('正在恢复');
  const [selected, select] = useState<string | null>(null), [modal, setModal] = useState<'paste' | 'export' | 'save' | null>(null), [text, setText] = useState('');
  const [toast, setToast] = useState(''), [dragging, setDragging] = useState(false), [includeAudio, setIncludeAudio] = useState(true);
  const [candidates, setCandidates] = useState<EmbeddedCandidate[]>([]);
  const [exportArtifact, setExportArtifact] = useState<ExportArtifact | null>(null);
  const audioInput = useRef<HTMLInputElement>(null), lyricsInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), fontInput = useRef<HTMLInputElement>(null), temperaInput = useRef<HTMLInputElement>(null), monetInput = useRef<HTMLInputElement>(null);
  const current = useRef(project); current.current = project;
  const sourceUrl = useRef(''), loadGeneration = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 7000); return () => clearTimeout(timer); }, [toast]);
  const attach = useCallback((blob: Blob | null, decoded: AudioBuffer | null, duration: number) => {
    clock.pause(); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    setAudio(blob); setBuffer(decoded); setPeaks(decoded ? envelope(decoded) : []);
    if (blob && decoded) { sourceUrl.current = URL.createObjectURL(blob); clock.attach(sourceUrl.current, decoded.duration); }
    else { sourceUrl.current = ''; clock.audio.removeAttribute('src'); clock.duration = duration; clock.seek(0); }
  }, [clock]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let saved = null;
      try { saved = await loadLocal(); } catch { notify('无法恢复本地工程，已打开演示。'); }
      const p = saved?.project ?? initial(); const blob = saved ? saved.audio ?? (p.audioName ? null : demoAudio()) : demoAudio();
      try { const decoded = blob ? await decodeAudio(blob) : null; if (!alive) return; if (saved?.font) { await installLocalFont(saved.font, p.customFontName || 'Verse Local Font'); setFontBlob(saved.font); } setCoverBlob(saved?.cover ?? null); setMonetPortraitBlob(saved?.monetPortrait ?? null); replace(p); attach(blob, decoded, p.duration); if (!saved) clock.seek(13.5); select(p.lines[2]?.id ?? p.lines[0]?.id ?? null); }
      catch (err) { if (alive) { replace(p); notify(`音频恢复失败：${err instanceof Error ? err.message : '请重新导入'}`); } }
      finally { if (alive) { setBusy(''); setReady(true); } }
    })();
    return () => { alive = false; clock.dispose(); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); };
  }, [replace, attach, clock, notify]);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus('保存中…'); let alive = true;
    const timer = setTimeout(() => { void saveLocal({ project, audio, font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob }).then(() => { if (alive) setSaveStatus('已保存到本机'); }).catch(() => { if (alive) setSaveStatus('保存失败 · 请下载工程'); }); }, 650);
    return () => { alive = false; clearTimeout(timer); };
  }, [project, audio, fontBlob, coverBlob, monetPortraitBlob, ready]);
  useEffect(() => { void ensureProjectFont(project).catch(() => notify('Google 字体加载失败，已使用系统备用字体。')); }, [project.font, project.customFontName, project.fontWeight, notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,dialog') || modal) return;
      if (e.code === 'Space') { e.preventDefault(); if (clock.playing) clock.pause(); else void clock.play().catch(err => notify(err.message)); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [clock, modal, undo, redo, notify]);
  const applyLyrics = (source: string, duration = current.current.duration) => {
    if (source.length > 1e6) throw new Error('歌词文本过大。');
    const result = parseLyrics(source, duration); if (!result.lines.length) throw new Error('没有找到可用的歌词。'); if (result.lines.length > 2000) throw new Error('当前最多支持 2000 行歌词。');
    commit(p => ({ ...p, source, lines: result.lines })); select(result.lines[0].id); notify(`已导入 ${result.lines.length} 行歌词。${result.warnings[0] ?? ''}`);
  };
  const applyEmbeddedCandidate = (candidate: EmbeddedCandidate) => {
    const aligned = realignTimedLinesToPlain(current.current.lines, candidate.text);
    if (!aligned) { applyLyrics(candidate.text); return; }
    const repaired = Math.max(0, current.current.lines.length - aligned.length);
    commit(p => ({ ...p, source: candidate.text, lines: aligned }));
    select(aligned[0]?.id ?? null); setCandidates([]);
    notify(repaired ? `已按音频内嵌原文修复 ${repaired} 处断行，并保留句级时间。` : '已按音频内嵌原文校正分行，并保留句级时间。');
  };
  const importAudio = async (file: File) => {
    if (file.size > 150 * 1024 * 1024) throw new Error('音频超过 150 MB，请使用较小的文件。');
    const generation = ++loadGeneration.current; setBusy('正在读取音频与内嵌歌词…'); clock.pause();
    try {
      const [decoded, metadata] = await Promise.all([decodeAudio(file), embeddedLyrics(file).catch(() => null)]);
      if (generation !== loadGeneration.current) return current.current.duration;
      if (decoded.duration > 600) throw new Error('当前版本支持最多 10 分钟音频；每次导出最多 5 分钟。');
      attach(file, decoded, decoded.duration); setCoverBlob(metadata?.cover ?? null); setCandidates(metadata?.candidates ?? []);
      const previous = current.current;
      replace({ ...previous, title: metadata?.title || file.name.replace(/\.[^.]+$/, ''), artist: metadata?.artist || '', duration: decoded.duration, audioName: file.name, coverMimeType: metadata?.cover?.type || undefined, ...(previous.source === demoSource && !previous.audioName ? { lines: [], source: '' } : {}) });
      notify(metadata?.candidates.length ? `发现 ${metadata.candidates.length} 个内嵌歌词候选，请选择使用。` : '音频已导入。可粘贴歌词或导入 LRC。'); return decoded.duration;
    } finally { setBusy(''); }
  };
  const handleFiles = async (files: File[]) => {
    try {
      const music = files.find(f => /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name));
      const lyrics = files.find(f => /\.(lrc|txt)$/i.test(f.name));
      const archive = files.find(f => /\.(lyricmv|json)$/i.test(f.name));
      if (archive) { setBusy('正在打开工程…'); const saved = await readProject(archive); const blob = saved.audio ?? (!saved.project.audioName ? demoAudio() : null); const decoded = blob ? await decodeAudio(blob) : null; if (saved.font) await installLocalFont(saved.font, saved.project.customFontName || 'Verse Local Font'); setFontBlob(saved.font ?? null); setCoverBlob(saved.cover ?? null); setMonetPortraitBlob(saved.monetPortrait ?? null); replace(saved.project); attach(blob, decoded, saved.project.duration); setCandidates([]); notify(blob ? '工程与素材已恢复。' : '工程已恢复，请重新关联音频文件。'); }
      else { const duration = music ? await importAudio(music) : current.current.duration; if (lyrics) { if (lyrics.size > 1e6) throw new Error('歌词文件超过 1 MB。'); applyLyrics(await lyrics.text(), duration); } if (!music && !lyrics) throw new Error('请选择音频、LRC、TXT 或 .lyricmv 工程文件。'); }
    } catch (err) { notify(err instanceof Error ? err.message : '导入失败'); } finally { setBusy(''); }
  };
  const change = (patch: Partial<Project>) => commit(p => ({ ...p, ...patch }));
  const applyLocalFont = async (blob: Blob, family: string) => {
    if (blob.size > 20 * 1024 * 1024) throw new Error('字体文件不能超过 20 MB。');
    await installLocalFont(blob, family); setFontBlob(blob); change({ font: 'local', customFontName: family, fontWeight: 400 }); notify('本地字体已加载并保存到工程。');
  };
  const openTimestamp = () => {
    clock.pause();
    void saveLocal({ project: current.current, audio, font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob })
      .then(() => { location.href = '/timestamp.html'; })
      .catch(() => notify('保存工程失败，暂时无法打开打点工作台。'));
  };
  const addTemperaImages = async (files: File[]) => {
    const remaining = Math.max(0, 16 - current.current.temperaLayerImages.length), selectedFiles = files.slice(0, remaining);
    if (!selectedFiles.length) { notify('凝彩图片池最多保存 16 张图片。'); return; }
    const service = await import('./vendor/folia/services/temperaLayerImages');
    const stored = await Promise.all(selectedFiles.filter(service.isSupportedTemperaLayerImageFile).map(service.prepareTemperaLayerImage));
    await Promise.all(stored.map(service.saveTemperaLayerImage));
    change({ temperaLayerImages: [...current.current.temperaLayerImages, ...stored.map(image => ({ id: image.id, name: image.name, mimeType: image.mimeType, align: 'free' as const, verticalAlign: 'bottom' as const, scale: .7, opacity: 1 }))] });
    notify(`已加入 ${stored.length} 张凝彩画布图片。`);
  };
  const removeTemperaImage = async (id: string) => {
    const { clearTemperaLayerImage } = await import('./vendor/folia/services/temperaLayerImages');
    await clearTemperaLayerImage(id); change({ temperaLayerImages: current.current.temperaLayerImages.filter(image => image.id !== id) });
  };
  const applyMonetPortrait = (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MB 的图片。');
    setMonetPortraitBlob(file); change({ monetPortraitSource: 'custom', monetPortraitName: file.name, monetPortraitMimeType: file.type }); notify('莫奈人物图已更新。');
  };
  const clearMonetPortrait = () => { setMonetPortraitBlob(null); change({ monetPortraitSource: 'cover', monetPortraitName: undefined, monetPortraitMimeType: undefined }); notify(coverBlob ? '已恢复使用音频内嵌封面。' : '自定义图片已移除。'); };
  const fileChanged = (input: HTMLInputElement) => { const files = Array.from(input.files ?? []); input.value = ''; void handleFiles(files); };
  return <div className="studio" onDragOver={e => { e.preventDefault(); if (!busy && !modal) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy && !modal) void handleFiles(Array.from(e.dataTransfer.files)); }}>
    <header className="topbar"><a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Verse Studio"><span className="brand-symbol"><AudioLines size={22}/></span><strong>verse<span>studio</span></strong><span className="beta">PREVIEW</span></a><div className="project-heading"><input key={project.title} aria-label="工程名称" defaultValue={project.title} maxLength={300} onBlur={e => { if (e.target.value.trim() && e.target.value !== project.title) change({ title: e.target.value.trim() }); }}/><ChevronDown size={12}/><span className="save-state"><Check size={12}/>{saveStatus}</span></div><div className="top-actions"><button title="撤销" aria-label="撤销" disabled={!canUndo} onClick={undo}><Undo2 size={16}/></button><button title="重做" aria-label="重做" disabled={!canRedo} onClick={redo}><Redo2 size={16}/></button><span className="divider"/><button className="text-button" onClick={() => projectInput.current?.click()}><FolderOpen size={15}/><span>打开</span></button><button className="text-button" onClick={() => setModal('save')}><Save size={15}/><span>保存工程</span></button><button className="primary" disabled={!ready || !!busy} onClick={() => { clock.pause(); setModal('export'); }}><ArrowDownToLine size={15}/>导出视频</button></div></header>
    <div className="workspace"><aside className="left-panel"><div className="source-heading"><span><Music2 size={15}/>音频素材</span><button aria-label="导入音频" title="导入音频" onClick={() => audioInput.current?.click()}><Upload size={14}/></button></div><button className="audio-card" onClick={() => audioInput.current?.click()}><span className="audio-cover"><AudioLines size={25}/></span><span><strong>{project.audioName || (audio ? '把日子写成诗' : '导入一首歌曲')}</strong><small>{audio ? `${Math.floor(project.duration / 60)}:${Math.floor(project.duration % 60).toString().padStart(2, '0')} · ${project.audioName ? '本地音频' : '演示环境音'}` : 'MP3 / WAV / M4A / FLAC'}</small></span><ChevronDown size={13}/></button>
      {audio && project.audioName && !candidates.length && <button className="reread-lyrics" onClick={() => { setBusy('正在读取内嵌歌词与封面…'); void embeddedLyrics(audio).then(m => { setCandidates(m.candidates); if (m.cover) { setCoverBlob(m.cover); change({ coverMimeType: m.cover.type || undefined }); } if (!m.candidates.length) notify(m.cover ? '已读取音频内嵌封面，未找到歌词。' : '音频中未找到歌词或封面。'); }).catch(e => notify(e.message)).finally(() => setBusy('')); }}>重新读取内嵌歌词与封面</button>}
      {!!candidates.length && <div className="embedded"><span>发现内嵌歌词</span>{candidates.map((c, i) => <button key={i} onClick={() => { try { applyEmbeddedCandidate(c); setCandidates([]); } catch (err) { notify((err as Error).message); } }}>{c.label} <span>使用 →</span></button>)}</div>}
      <LyricsPanel project={project} commit={commit} selected={selected} select={select} clock={clock} paste={() => { setText(''); setModal('paste'); }} importFile={() => lyricsInput.current?.click()} openTimestamp={openTimestamp} notify={notify}/></aside>
      <main className="center-panel"><div className="workspace-title"><div><span className="eyebrow">YOUR WORDS, IN MOTION</span><h1>让每一句，都有画面。</h1></div><span className="local-badge"><span className="status-dot"/>本地创作</span></div><Stage project={project} peaks={peaks} clock={clock} fontBlob={fontBlob} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob} onError={notify}/><Timeline project={project} peaks={peaks} clock={clock} selected={selected} select={select}/></main><Inspector project={project} change={change} importFont={() => fontInput.current?.click()} installFont={applyLocalFont} importTemperaImages={() => temperaInput.current?.click()} removeTemperaImage={removeTemperaImage} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob} importMonetPortrait={() => monetInput.current?.click()} clearMonetPortrait={clearMonetPortrait}/></div>
    <footer className="statusbar"><span><Headphones size={12}/> 为歌词留一片舞台</span><span><kbd>Space</kbd> 播放 / 暂停 <span className="footer-gap"/><button className="footer-link" onClick={openTimestamp}>歌词打点工作台 →</button></span><span>Verse Studio <span className="dim">/</span> 0.1</span></footer>
    <input hidden ref={audioInput} aria-label="音频文件" type="file" accept="audio/*,.flac,.m4a" onChange={e => fileChanged(e.target)}/><input hidden ref={lyricsInput} aria-label="歌词文件" type="file" accept=".lrc,.txt" onChange={e => fileChanged(e.target)}/><input hidden ref={projectInput} aria-label="工程文件" type="file" accept=".lyricmv,.json" onChange={e => fileChanged(e.target)}/><input hidden ref={fontInput} aria-label="本地字体文件" type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const family = file.name.replace(/\.[^.]+$/, '').trim() || '本地字体'; void applyLocalFont(file, family).catch(error => notify(error instanceof Error ? error.message : '无法读取此字体文件。')); }}/><input hidden multiple ref={temperaInput} aria-label="凝彩图片池" type="file" accept="image/*,.svg" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addTemperaImages(files).catch(error => notify(error instanceof Error ? error.message : '无法加入凝彩图片。')); }}/><input hidden ref={monetInput} aria-label="莫奈人物图片" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { try { applyMonetPortrait(file); } catch (error) { notify(error instanceof Error ? error.message : '无法读取图片。'); } } }}/>
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>}
    {busy && <div className="busy-overlay" role="status"><Loader2 className="spin" size={24}/><p>{busy}</p></div>}
    {dragging && <div className="drop-overlay"><Upload size={32}/><strong>放下音频与歌词</strong><span>同时拖入歌曲和 LRC，即可开始创作</span></div>}
    {modal === 'paste' && <Modal title="添加歌词" close={() => setModal(null)} wide><p className="modal-description">粘贴纯文本、LRC 或增强逐字 LRC。纯文本可以在时间轴中逐行打点。</p><textarea autoFocus className="source-editor" aria-label="粘贴歌词内容" placeholder={'[00:02.00]风把远方写成了诗\n[00:07.00]落在你经过的城市\n\n也可以直接粘贴没有时间轴的歌词…'} value={text} onChange={e => setText(e.target.value)}/><div className="modal-actions"><button onClick={() => { setModal(null); lyricsInput.current?.click(); }}><FileUp size={15}/>选择文件</button><button className="primary" disabled={!text.trim()} onClick={() => { try { applyLyrics(text); setModal(null); } catch (err) { notify((err as Error).message); } }}>添加到时间轴</button></div></Modal>}
    {modal === 'export' && <ExportModal clock={clock} project={project} buffer={buffer} peaks={peaks} artifact={exportArtifact} setArtifact={setExportArtifact} close={() => setModal(null)}/>}
    {modal === 'save' && <Modal title="保存创作工程" close={() => setModal(null)}><p className="modal-description">下载可继续编辑的 .lyricmv 工程。画幅、动画参数、歌词校时、字体和图片素材都会保留。</p><label className="toggle-label package-toggle"><span>包含音频素材 <small>在其他设备上继续创作</small></span><input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)}/></label><div className="modal-actions"><button onClick={() => downloadBlob(new Blob([toLrc(project.lines, project.offset)], { type: 'text/plain;charset=utf-8' }), `${project.title}.lrc`)}>仅下载 LRC</button><button className="primary" onClick={() => { void downloadProject(project, audio, includeAudio, fontBlob, coverBlob, monetPortraitBlob).then(() => { setModal(null); notify('工程已下载。'); }).catch(e => notify(e.message)); }}><ArrowDownToLine size={15}/>下载工程</button></div></Modal>}
  </div>;
}
