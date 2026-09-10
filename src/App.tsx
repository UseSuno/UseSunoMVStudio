import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, AudioLines, ChevronDown, FileUp, Loader2, Music2, Upload, X } from 'lucide-react';
import { defaultProject, demoSource, type Project } from './domain/model';
import { contactUrl, feedbackUrl, homeUrl, sourceUrl as projectSourceUrl, privacyUrl, licensesUrl, studioVersion, upstreamFoliaUrl } from './domain/about';
import { applyPreferences, loadPreferences, savePreferences, type GlobalPreferences } from './domain/preferences';
import { isDemoSource, upgradeDemoLyrics } from './import/demo';
import { parseLyrics, toLrc } from './import/lyrics';
import { decodeAudio, demoAudio, embeddedLyrics, envelope, type EmbeddedCandidate } from './audio/media';
import { analyzeAudio, emptyAudioAnalysis, type AudioAnalysis } from './audio/analysis';
import { PlaybackClock } from './audio/clock';
import { useProject } from './hooks/useProject';
import { downloadBlob, downloadProject, loadLocal, readProject, saveLocal } from './persistence/project';
import { Stage } from './components/Stage';
import { Timeline } from './components/Timeline';
import { LyricsPanel } from './components/LyricsPanel';
import { Inspector } from './components/Inspector';
import { Modal } from './components/Modal';
import type { ExportArtifact } from './components/ExportModal';
import { WelcomeOverlay } from './components/WelcomeOverlay';
import { AppHeader } from './components/AppHeader';
import { OnboardingTour } from './components/OnboardingTour';
import { SettingsModal } from './components/SettingsModal';
import { ensureProjectFont, installLocalFont } from './fonts/fonts';
import { clearProjectDraft, recoverProjectDraft, writeProjectDraft } from './persistence/draft';
import type { SavedProject } from './persistence/project';
import { realignTimedLinesToPlain } from './import/embedded';
// The editor coordinates user operations; clocks and render loops live outside app state.
const sameAssets = (a: SavedProject, b: SavedProject) => a.audio === b.audio && a.font === b.font && a.cover === b.cover && a.monetPortrait === b.monetPortrait;
const initial = () => defaultProject(parseLyrics(demoSource, 46).lines);
const ExportModal = lazy(() => import('./components/ExportModal').then(module => ({ default: module.ExportModal })));
export default function App() {
  const { t } = useTranslation();
  const { project, assets, commit, replace, undo, redo, canUndo, canRedo } = useProject(initial());
  const { font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob } = assets;
  const [clock] = useState(() => new PlaybackClock());
  const [audio, setAudio] = useState<Blob | null>(null), [buffer, setBuffer] = useState<AudioBuffer | null>(null), [peaks, setPeaks] = useState<number[]>([]), [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis>(() => emptyAudioAnalysis());
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(t('app.restoring')), [saveStatus, setSaveStatus] = useState('restoring');
  const [selected, select] = useState<string | null>(null), [modal, setModal] = useState<'paste' | 'export' | 'save' | 'settings' | 'about' | 'contact' | 'feedback' | null>(null), [text, setText] = useState('');
  const [toast, setToast] = useState(''), [dragging, setDragging] = useState(false), [includeAudio, setIncludeAudio] = useState(true), [includeFont, setIncludeFont] = useState(false);
  const [candidates, setCandidates] = useState<EmbeddedCandidate[]>([]);
  const [exportArtifact, setExportArtifact] = useState<ExportArtifact | null>(null);
  const [showWelcome, setShowWelcome] = useState(false), [persistEnabled, setPersistEnabled] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [preferences, setPreferences] = useState<GlobalPreferences>(() => loadPreferences());
  const audioInput = useRef<HTMLInputElement>(null), lyricsInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), fontInput = useRef<HTMLInputElement>(null), temperaInput = useRef<HTMLInputElement>(null), monetInput = useRef<HTMLInputElement>(null);
  const translation = useRef(t); translation.current = t;
  const persisted = useRef<SavedProject | null>(null);
  const latestSaved = useRef<SavedProject>({ project, audio, font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob });
  latestSaved.current = { project, audio, font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob };
  const draftReady = useRef(false);
  const current = useRef(project); current.current = project;
  const sourceUrl = useRef(''), loadGeneration = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 7000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { applyPreferences(preferences); savePreferences(preferences); }, [preferences]);
  useEffect(() => { if (preferences.theme !== 'system') return; const query=matchMedia('(prefers-color-scheme: dark)'),sync=()=>applyPreferences(preferences); query.addEventListener('change',sync); return()=>query.removeEventListener('change',sync); }, [preferences]);
  const attach = useCallback((blob: Blob | null, decoded: AudioBuffer | null, duration: number) => {
    clock.pause(); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    setAudio(blob); setBuffer(decoded); setPeaks(decoded ? envelope(decoded) : []); setAudioAnalysis(decoded ? analyzeAudio(decoded) : emptyAudioAnalysis());
    if (blob && decoded) { sourceUrl.current = URL.createObjectURL(blob); clock.attach(sourceUrl.current, decoded.duration); }
    else { sourceUrl.current = ''; clock.audio.removeAttribute('src'); clock.duration = duration; clock.seek(0); }
  }, [clock]);
  useEffect(() => {
    let alive = true;
    const t = translation.current;
    void (async () => {
      let saved = null;
      try { saved = await loadLocal(); } catch { notify(t('notice.restoreLocalFailed')); }
      persisted.current = saved;
      const p = saved ? upgradeDemoLyrics(recoverProjectDraft(saved.project)) : initial(); const blob = saved ? saved.audio ?? (p.audioName ? null : demoAudio()) : demoAudio();
      try { const decoded = blob ? await decodeAudio(blob) : null; if (!alive) return; if (saved?.font) { await installLocalFont(saved.font, p.customFontName || 'Verse Local Font'); } replace(p, { font: saved?.font ?? null, cover: saved?.cover ?? null, monetPortrait: saved?.monetPortrait ?? null }); attach(blob, decoded, p.duration); if (!saved) { clock.seek(13.5); setShowWelcome(true); } else setPersistEnabled(true); select(p.lines[2]?.id ?? p.lines[0]?.id ?? null); }
      catch (err) { if (alive) { replace(p); notify(t('notice.audioRestoreFailed',{reason:err instanceof Error ? err.message : t('notice.reimport')})); } }
      finally { if (alive) { setBusy(''); setReady(true); } }
    })();
    return () => { alive = false; clock.dispose(); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); };
  }, [replace, attach, clock, notify]);
  useLayoutEffect(() => {
    if (!ready || !persistEnabled) return;
    const base = persisted.current, next = latestSaved.current;
    draftReady.current = !!base && sameAssets(base, next) && writeProjectDraft(base.project, next.project);
  }, [project, audio, fontBlob, coverBlob, monetPortraitBlob, ready, persistEnabled]);
  useEffect(() => {
    if (!ready || !persistEnabled) return;
    let alive = true;
    const snapshot = latestSaved.current;
    const flush = () => {
      setSaveStatus('saving');
      return saveLocal(snapshot).then(() => {
        persisted.current = snapshot;
        clearProjectDraft(snapshot.project);
        const latest = latestSaved.current;
        draftReady.current = sameAssets(snapshot, latest) && writeProjectDraft(snapshot.project, latest.project);
        if (alive) setSaveStatus('saved');
      }).catch(() => { if (alive) setSaveStatus('saveFailed'); });
    };
    const timer = setTimeout(() => { void flush(); }, persisted.current && sameAssets(persisted.current, snapshot) ? 650 : 0);
    const onHidden = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); void flush(); } };
    const onPageHide = () => { clearTimeout(timer); void flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (persisted.current?.project !== latestSaved.current.project && !draftReady.current) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', onPageHide); window.removeEventListener('beforeunload', beforeUnload); };
  }, [project, audio, fontBlob, coverBlob, monetPortraitBlob, ready, persistEnabled]);
  // Undoing a local font choice restores its binary as well as its metadata.
  useEffect(() => { if (project.font === 'local' && fontBlob) void installLocalFont(fontBlob, project.customFontName || 'Verse Local Font').catch(error => notify(error.message)); }, [fontBlob, project.font, project.customFontName, notify]);
  useEffect(() => { void ensureProjectFont(project).catch(() => notify(t('notice.googleFontFailed'))); }, [project.font, project.customFontName, project.fontWeight, notify, t]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,dialog,[contenteditable="true"]') || modal || showWelcome || showTour) return;
      if (e.code === 'Space' && (e.target as HTMLElement).closest('button,summary,a,[role="button"]')) return;
      if (e.code === 'Space') { e.preventDefault(); if (clock.playing) clock.pause(); else void clock.play().catch(err => notify(err.message)); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [clock, modal, showWelcome, showTour, undo, redo, notify]);
  const applyLyrics = (source: string, duration = current.current.duration) => {
    if (source.length > 1e6) throw new Error(t('notice.lyricsTooLarge'));
    const result = parseLyrics(source, duration); if (!result.lines.length) throw new Error(t('notice.noLyrics')); if (result.lines.length > 2000) throw new Error(t('notice.tooManyLyrics'));
    commit(p => ({ ...p, source, lines: result.lines })); select(result.lines[0].id); notify(t('notice.lyricsImported',{count:result.lines.length,warning:result.warnings[0] ?? ''}));
  };
  const applyEmbeddedCandidate = (candidate: EmbeddedCandidate) => {
    const aligned = realignTimedLinesToPlain(current.current.lines, candidate.text);
    if (!aligned) { applyLyrics(candidate.text); return; }
    const repaired = Math.max(0, current.current.lines.length - aligned.length);
    commit(p => ({ ...p, source: candidate.text, lines: aligned }));
    select(aligned[0]?.id ?? null); setCandidates([]);
    notify(repaired ? t('notice.embeddedRepaired',{count:repaired}) : t('notice.embeddedAligned'));
  };
  const importAudio = async (file: File) => {
    const generation = ++loadGeneration.current; setBusy(t('notice.readingAudio')); clock.pause();
    try {
      const [decoded, metadata] = await Promise.all([decodeAudio(file), embeddedLyrics(file).catch(() => null)]);
      if (generation !== loadGeneration.current) return current.current.duration;
      attach(file, decoded, decoded.duration); setCandidates(metadata?.candidates ?? []);
      const previous = current.current;
      replace({ ...previous, title: metadata?.title || file.name.replace(/\.[^.]+$/, ''), artist: metadata?.artist || '', duration: decoded.duration, audioName: file.name, coverMimeType: metadata?.cover?.type || undefined, ...(isDemoSource(previous.source) && !previous.audioName ? { lines: [], source: '' } : {}) }, { ...assets, cover: metadata?.cover ?? null });
      notify(metadata?.candidates.length ? t('notice.embeddedFound',{count:metadata.candidates.length}) : t('notice.audioImported')); return decoded.duration;
    } finally { setBusy(''); }
  };
  const handleFiles = async (files: File[]) => {
    try {
      const music = files.find(f => /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name));
      const lyrics = files.find(f => /\.(lrc|txt)$/i.test(f.name));
      const archive = files.find(f => /\.(lyricmv|json)$/i.test(f.name));
      if (archive) { setBusy(t('notice.openingProject')); const saved = await readProject(archive); const blob = saved.audio ?? (!saved.project.audioName ? demoAudio() : null); const decoded = blob ? await decodeAudio(blob) : null; if (saved.font) await installLocalFont(saved.font, saved.project.customFontName || 'Verse Local Font'); replace(saved.project, { font: saved.font ?? null, cover: saved.cover ?? null, monetPortrait: saved.monetPortrait ?? null }); attach(blob, decoded, saved.project.duration); setCandidates([]); notify(blob ? t('notice.projectRestored') : t('notice.projectNeedsAudio')); }
      else { const duration = music ? await importAudio(music) : current.current.duration; if (lyrics) { if (lyrics.size > 1e6) throw new Error(t('notice.lyricsFileTooLarge')); applyLyrics(await lyrics.text(), duration); } if (!music && !lyrics) throw new Error(t('notice.chooseFiles')); }
      setPersistEnabled(true); setShowWelcome(false); if (!localStorage.getItem('usesuno-mv-guide-complete')) setShowTour(true);
    } catch (err) { notify(err instanceof Error ? err.message : t('notice.importFailed')); } finally { setBusy(''); }
  };
  const change = (patch: Partial<Project>) => commit(p => ({ ...p, ...patch }));
  const applyLocalFont = async (blob: Blob, family: string) => {
    if (blob.size > 20 * 1024 * 1024) throw new Error(t('notice.fontTooLarge'));
    await installLocalFont(blob, family); commit(p => ({ ...p, font: 'local', customFontName: family, fontWeight: 400 }), { font: blob }); notify(t('notice.localFontReady'));
  };
  const openTimestamp = () => {
    clock.pause();
    void saveLocal({ project: current.current, audio, font: fontBlob, cover: coverBlob, monetPortrait: monetPortraitBlob })
      .then(() => { location.href = '/timestamp.html'; })
      .catch(() => notify(t('notice.timingOpenFailed')));
  };
  const addTemperaImages = async (files: File[]) => {
    const remaining = Math.max(0, 16 - current.current.temperaLayerImages.length), selectedFiles = files.slice(0, remaining);
    if (!selectedFiles.length) { notify(t('notice.temperaLimit')); return; }
    if (selectedFiles.some(file => file.size > 20 * 1024 * 1024)) throw new Error(t('notice.imageTooLarge'));
    const service = await import('./vendor/folia/services/temperaLayerImages');
    const stored = await Promise.all(selectedFiles.filter(service.isSupportedTemperaLayerImageFile).map(service.prepareTemperaLayerImage));
    await Promise.all(stored.map(service.saveTemperaLayerImage));
    change({ temperaLayerImages: [...current.current.temperaLayerImages, ...stored.map(image => ({ id: image.id, name: image.name, mimeType: image.mimeType, align: 'free' as const, verticalAlign: 'bottom' as const, scale: .7, opacity: 1 }))] });
    notify(t('notice.temperaAdded',{count:stored.length}));
  };
  const removeTemperaImage = async (id: string) => {
    // Keep the stored blob available to undo and previously saved local projects.
    change({ temperaLayerImages: current.current.temperaLayerImages.filter(image => image.id !== id) });
  };
  const applyMonetPortrait = (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error(t('notice.imageTooLarge'));
    commit(p => ({ ...p, monetPortraitSource: 'custom', monetPortraitName: file.name, monetPortraitMimeType: file.type }), { monetPortrait: file }); notify(t('notice.monetUpdated'));
  };
  const clearMonetPortrait = () => { commit(p => ({ ...p, monetPortraitSource: 'cover', monetPortraitName: undefined, monetPortraitMimeType: undefined }), { monetPortrait: null }); notify(coverBlob ? t('notice.coverRestored') : t('notice.customImageRemoved')); };
  const fileChanged = (input: HTMLInputElement) => { const files = Array.from(input.files ?? []); input.value = ''; void handleFiles(files); };
  return <div className="studio" onDragOver={e => { e.preventDefault(); if (!busy && !modal) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy && !modal) void handleFiles(Array.from(e.dataTransfer.files)); }}>
    <AppHeader title={project.title} saveStatus={t(`app.${persistEnabled ? saveStatus : 'restoring'}`)} canUndo={canUndo} canRedo={canRedo} disabled={!ready || !!busy} rename={title => change({ title })} openProject={() => projectInput.current?.click()} importAudio={() => audioInput.current?.click()} importLyrics={() => lyricsInput.current?.click()} saveProject={() => setModal('save')} undo={undo} redo={redo} openGuide={() => setShowTour(true)} openTiming={openTimestamp} openSettings={() => setModal('settings')} openAbout={() => setModal('about')} openContact={() => setModal('contact')} openFeedback={() => setModal('feedback')} exportVideo={() => { clock.pause(); setModal('export'); }}/>
    <div className="workspace"><aside className="left-panel"><div className="source-heading"><span><Music2 size={15}/>{t('editor.audioAssets')}</span><button className="icon-button" data-tooltip={t('editor.importAudio')} aria-label={t('editor.importAudio')} onClick={() => audioInput.current?.click()}><Upload size={14}/></button></div><button className="audio-card" data-tour="audio-import" onClick={() => audioInput.current?.click()}><span className="audio-cover"><AudioLines size={25}/></span><span><strong>{project.audioName || (audio ? project.title : t('editor.importSong'))}</strong><small>{audio ? `${Math.floor(project.duration / 60)}:${Math.floor(project.duration % 60).toString().padStart(2, '0')} · ${project.audioName ? t('editor.localAudio') : t('editor.demoAudio')}` : 'MP3 / WAV / M4A / FLAC'}</small></span><ChevronDown size={13}/></button>
      {audio && project.audioName && !candidates.length && <button className="reread-lyrics" onClick={() => { setBusy(t('editor.reread')); void embeddedLyrics(audio).then(m => { setCandidates(m.candidates); if (m.cover) { commit(p => ({ ...p, coverMimeType: m.cover!.type || undefined }), { cover: m.cover }); } if (!m.candidates.length) notify(m.cover ? t('notice.embeddedCoverOnly') : t('notice.noEmbeddedMedia')); }).catch(e => notify(e.message)).finally(() => setBusy('')); }}>{t('editor.reread')}</button>}
      {!!candidates.length && <div className="embedded"><span>{t('editor.embedded')}</span>{candidates.map((c, i) => <button key={i} onClick={() => { try { applyEmbeddedCandidate(c); setCandidates([]); } catch (err) { notify((err as Error).message); } }}>{c.label} <span>{t('editor.use')}</span></button>)}</div>}
      <LyricsPanel project={project} commit={commit} selected={selected} select={select} clock={clock} paste={() => { setText(''); setModal('paste'); }} importFile={() => lyricsInput.current?.click()} openTimestamp={openTimestamp} notify={notify}/></aside>
      <main className="center-panel"><Stage change={change} project={project} peaks={peaks} audioAnalysis={audioAnalysis} clock={clock} fontBlob={fontBlob} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob} onError={notify}/><Timeline project={project} peaks={peaks} clock={clock} selected={selected} select={select}/></main><Inspector project={project} change={change} importFont={() => fontInput.current?.click()} installFont={applyLocalFont} importTemperaImages={() => temperaInput.current?.click()} removeTemperaImage={removeTemperaImage} coverBlob={coverBlob} monetPortraitBlob={monetPortraitBlob} importMonetPortrait={() => monetInput.current?.click()} clearMonetPortrait={clearMonetPortrait}/></div>
    <footer className="statusbar"><span><span className="status-dot"/>{t('editor.localStatus')}</span><span><kbd>Space</kbd> {t('editor.playHint')}</span><span>UseSuno MV Studio <span className="dim">/</span> {studioVersion}</span></footer>
    <input hidden ref={audioInput} aria-label={t('aria.audioFile')} type="file" accept="audio/*,.flac,.m4a" onChange={e => fileChanged(e.target)}/><input hidden ref={lyricsInput} aria-label={t('aria.lyricsFile')} type="file" accept=".lrc,.txt" onChange={e => fileChanged(e.target)}/><input hidden ref={projectInput} aria-label={t('aria.projectFile')} type="file" accept=".lyricmv,.json" onChange={e => fileChanged(e.target)}/><input hidden ref={fontInput} aria-label={t('aria.localFontFile')} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const family = file.name.replace(/\.[^.]+$/, '').trim() || t('font.localFont'); void applyLocalFont(file, family).catch(error => notify(error instanceof Error ? error.message : t('notice.fontReadFailed'))); }}/><input hidden multiple ref={temperaInput} aria-label={t('aria.temperaPool')} type="file" accept="image/*,.svg" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addTemperaImages(files).catch(error => notify(error instanceof Error ? error.message : t('notice.temperaAddFailed'))); }}/><input hidden ref={monetInput} aria-label={t('aria.monetPortrait')} type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { try { applyMonetPortrait(file); } catch (error) { notify(error instanceof Error ? error.message : t('notice.imageReadFailed')); } } }}/>
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" data-tooltip={t('toast.close')} aria-label={t('toast.close')} onClick={() => setToast('')}><X size={15}/></button></div>}
    {busy && <div className="busy-overlay" role="status"><Loader2 className="spin" size={24}/><p>{busy}</p></div>}
    {dragging && <div className="drop-overlay"><Upload size={32}/><strong>{t('drop.title')}</strong><span>{t('drop.body')}</span></div>}
    {modal === 'paste' && <Modal title={t('modal.pasteTitle')} close={() => setModal(null)} wide><p className="modal-description">{t('modal.pasteDescription')}</p><textarea autoFocus className="source-editor" aria-label={t('modal.pasteTitle')} placeholder={t('modal.pastePlaceholder')} value={text} onChange={e => setText(e.target.value)}/><div className="modal-actions"><button onClick={() => { setModal(null); lyricsInput.current?.click(); }}><FileUp size={15}/>{t('modal.chooseFile')}</button><button className="primary" disabled={!text.trim()} onClick={() => { try { applyLyrics(text); setModal(null); } catch (err) { notify((err as Error).message); } }}>{t('modal.addTimeline')}</button></div></Modal>}
    {modal === 'export' && <Suspense fallback={<div className="busy-overlay"><Loader2 className="spin" size={24}/></div>}><ExportModal clock={clock} project={project} buffer={buffer} peaks={peaks} audioAnalysis={audioAnalysis} artifact={exportArtifact} setArtifact={setExportArtifact} confirmDiscard={preferences.confirmDiscardExport} close={() => setModal(null)}/></Suspense>}
    {modal === 'settings' && <SettingsModal value={preferences} change={patch => setPreferences(value => ({...value,...patch}))} close={() => setModal(null)}/>}
    {modal === 'about' && <Modal title={t('editor.aboutTitle')} close={() => setModal(null)}><p className="modal-description">{t('about.local')}</p><p className="modal-description">{t('about.licenseBefore')}<strong>AGPL-3.0-only</strong>{t('about.licenseAfter')} <a className="about-link" href={projectSourceUrl} target="_blank" rel="noreferrer">{t('about.sourceRepository')}</a>.</p><p className="modal-description">{t('about.foliaBefore')}<a className="about-link" href={upstreamFoliaUrl} target="_blank" rel="noreferrer">Folia (folia-major)</a>{t('about.foliaAfter')}</p><p className="modal-description"><a className="about-link" href={homeUrl} target="_blank" rel="noreferrer">{t('about.home')}</a> · <a className="about-link" href={privacyUrl} target="_blank" rel="noreferrer">{t('about.privacy')}</a> · <a className="about-link" href={licensesUrl} target="_blank" rel="noreferrer">{t('about.notices')}</a></p></Modal>}
    {modal === 'contact' && <Modal title={t('contact.title')} close={() => setModal(null)}><p className="modal-description">{t('contact.body')}</p><a className="contact-action" href={contactUrl}>{t('contact.email')}</a><p className="contact-note">contact@usesuno.com</p></Modal>}
    {modal === 'feedback' && <Modal title={t('feedback.title')} close={() => setModal(null)}><p className="modal-description">{t('feedback.body')}</p><a className="contact-action" href={feedbackUrl} target="_blank" rel="noreferrer">{t('feedback.github')}</a><p className="contact-note">contact@usesuno.com</p></Modal>}
    {modal === 'save' && <Modal title={t('modal.saveTitle')} close={() => setModal(null)}><p className="modal-description">{t('modal.saveDescription')}</p><label className="toggle-label package-toggle"><span>{t('modal.includeAudio')} <small>{t('modal.otherDevice')}</small></span><input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)}/></label>{project.font === 'local' && fontBlob && <label className="toggle-label package-toggle"><span>{t('modal.includeFont', { defaultValue: 'Include local font file' })}<small>{t('modal.includeFontNote', { defaultValue: 'Only include fonts you are allowed to share.' })}</small></span><input type="checkbox" checked={includeFont} onChange={e => setIncludeFont(e.target.checked)}/></label>}<p className="field-note">{t('modal.packageAssets', { defaultValue: 'The project includes its lyrics, settings, cover, and selected images.' })}</p><div className="modal-actions"><button onClick={() => downloadBlob(new Blob([toLrc(project.lines, project.offset)], { type: 'text/plain;charset=utf-8' }), `${project.title}.lrc`)}>{t('modal.lrcOnly')}</button><button className="primary" onClick={() => { void downloadProject(project, audio, includeAudio, includeFont ? fontBlob : null, coverBlob, monetPortraitBlob).then(() => { setModal(null); notify(t('app.saved')); }).catch(e => notify(e.message)); }}><ArrowDownToLine size={15}/>{t('modal.downloadProject')}</button></div></Modal>}
    {ready && showWelcome && <WelcomeOverlay close={() => { setShowWelcome(false); setPersistEnabled(true); }} chooseAudio={() => audioInput.current?.click()} openProject={() => projectInput.current?.click()} demo={() => { setPersistEnabled(true); setShowWelcome(false); if (!localStorage.getItem('usesuno-mv-guide-complete')) setShowTour(true); clock.seek(13.5); void clock.play().catch(error => notify(error.message)); }}/>}
    {showTour && !showWelcome && <OnboardingTour close={() => setShowTour(false)}/>}
  </div>;
}
