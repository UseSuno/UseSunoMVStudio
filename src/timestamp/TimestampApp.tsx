import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, FileAudio, Pause, Play, RotateCcw, Save, Scissors, TimerReset, Undo2, Sun, Moon, X, SlidersHorizontal } from 'lucide-react';
import type { Project } from '../domain/model';
import { toLrc } from '../import/lyrics';
import { downloadBlob, loadLocal, saveLocal, type SavedProject } from '../persistence/project';
import { applyTokenTimes, tokensFromLines, previewTimes, parseTimingInput, timingTimeError, toLyricTime, toMediaTime, type TimingToken } from './timing';
import { parseSegmentationDraft, segmentationDraft } from '../import/segmentation';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '../components/LanguagePicker';
import { applyPreferences, loadPreferences, savePreferences } from '../domain/preferences';
import { readTimingDraft, writeTimingDraft } from './draft';

const label = (time: number) => {
  const ms = Math.round(Math.abs(time) * 1000);
  return `${time < 0 ? '−' : ''}${Math.floor(ms / 60000).toString().padStart(2, '0')}:${(Math.floor(ms / 1000) % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}`;
};
const parseTime = parseTimingInput;

export function TimestampApp() {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement>(null), sheet = useRef<HTMLElement>(null), objectUrl = useRef(''), persistTimer = useRef<number | null>(null);
  const savedRef = useRef<SavedProject | null>(null), projectRef = useRef<Project | null>(null);
  const [saved, setSaved] = useState<SavedProject | null>(null), [project, setProject] = useState<Project | null>(null);
  const [tokens, setTokens] = useState<TimingToken[]>([]), [cursor, setCursor] = useState(0), [history, setHistory] = useState<{ tokens: TimingToken[]; cursor: number }[]>([]);
  const [time, setTime] = useState(0), [speed, setSpeed] = useState(1), [message, setMessage] = useState(t('timestamp.loading'));
  const [mode, setMode] = useState<'timing' | 'phrasing'>('timing'), [segments, setSegments] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false), [playing, setPlaying] = useState(false), [timeInput, setTimeInput] = useState(''), [offsetInput, setOffsetInput] = useState('0');
  const saveQueue = useRef(Promise.resolve());
  const [adjustments, setAdjustments] = useState(false);
  const [saving, setSaving] = useState(false), [light, setLight] = useState(document.documentElement.dataset.uiTheme === 'light');
  const clockLabel = useRef<HTMLElement>(null);
  const current = tokens[cursor], currentLine = current?.lineIndex ?? -1;
  const lyricOffset = project?.offset ?? 0;
  const mediaTime = (lyricTime: number) => toMediaTime(lyricTime, lyricOffset);
  const tokenLabel = (lyricTime: number) => label(mediaTime(lyricTime));
  const tokenRows = useMemo(() => {
    const rows: { token: TimingToken; index: number; outOfOrder: boolean }[][] = [];
    let previous: number | null = null;
    tokens.forEach((token, index) => {
      const outOfOrder = token.time !== null && previous !== null && token.time < previous;
      (rows[token.lineIndex] ??= []).push({ token, index, outOfOrder });
      if (token.time !== null) previous = token.time;
    });
    return rows;
  }, [tokens]);
  const completed = useMemo(() => tokens.filter(token => token.time !== null).length, [tokens]);
  const effectiveTimes = useMemo(() => project ? previewTimes(project.lines, tokens, project.duration, project.offset) : [], [project, tokens]);
  const previewCursor = useMemo(() => {
    let found = -1;
    effectiveTimes.forEach((stamp, index) => { if (stamp !== null && stamp <= time) found = index; });
    const line = project?.lines[tokens[found]?.lineIndex];
    return line?.end != null && time >= toMediaTime(line.end, project!.offset) ? -1 : found;
  }, [time, effectiveTimes, tokens, project]);
  const previewLine = tokens[previewCursor]?.lineIndex ?? -1;

  useEffect(() => {
    let alive = true;
    void loadLocal().then(value => {
      if (!alive) return;
      if (!value) { setMessage(t('timestamp.missing')); return; }
      savedRef.current = value; projectRef.current = value.project; setSaved(value); setProject(value.project);
      const initial = tokensFromLines(value.project.lines), draft = readTimingDraft(value.project, initial);
      const next = draft?.tokens ?? initial; setTokens(next);
      setSegments(Object.fromEntries(value.project.lines.map(line => [line.id, draft?.segments[line.id] ?? segmentationDraft(line.text, line.wordSegments)])));
      const firstUntimed = next.findIndex(token => token.time === null); setCursor(draft?.cursor ?? (firstUntimed < 0 ? 0 : firstUntimed));
      if (value.audio && audio.current) { objectUrl.current = URL.createObjectURL(value.audio); audio.current.src = objectUrl.current; }
      setMessage(value.audio ? t('timestamp.readyMessage') : t('timestamp.noAudio'));
    }).catch(() => setMessage(t('timestamp.readFailed')));
    return () => {
      alive = false;
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  useEffect(() => {
    const sync = () => { applyPreferences(loadPreferences()); setLight(document.documentElement.dataset.uiTheme === 'light'); };
    const media = matchMedia('(prefers-color-scheme: dark)');
    sync(); window.addEventListener('storage', sync); media.addEventListener('change', sync);
    return () => { window.removeEventListener('storage', sync); media.removeEventListener('change', sync); };
  }, []);
  useEffect(() => {
    let id = 0;
    const draw = () => { if (clockLabel.current && audio.current) clockLabel.current.textContent = label(audio.current.currentTime); id = requestAnimationFrame(draw); };
    if (playing) draw();
    return () => cancelAnimationFrame(id);
  }, [playing]);
  const toggleTheme = () => { const prefs = { ...loadPreferences(), theme: light ? 'dark' as const : 'light' as const }; savePreferences(prefs); applyPreferences(prefs); setLight(!light); };

  useEffect(() => { setTimeInput(current?.time === null || !current ? '' : label(toMediaTime(current.time, lyricOffset))); }, [current, lyricOffset]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useEffect(() => {
    const host = sheet.current;
    const target = host?.querySelector<HTMLElement>(preview ? 'article.active' : '.timing-token.current');
    if (!host || !target) return;
    const box = host.getBoundingClientRect(), rect = target.getBoundingClientRect();
    const behavior = document.documentElement.dataset.reduceMotion === 'true' ? 'auto' : 'smooth';
    if (preview || rect.top < box.top + 16 || rect.bottom > box.bottom - 16) {
      host.scrollTo({ top: Math.max(0, host.scrollTop + rect.top - box.top - (host.clientHeight - rect.height) / 2), behavior });
    }
  }, [cursor, preview, previewLine, mode]);

  const persistTiming = (nextTokens: TimingToken[], immediate = false, nextCursor = cursor, nextSegments = segments) => {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    const base = projectRef.current, stored = savedRef.current;
    if (!base || !stored) return Promise.resolve();
    const nextProject = { ...base, lines: applyTokenTimes(base.lines, nextTokens, base.duration, base.offset) };
    // Valid phrase edits travel with timing; invalid text stays in the recovery draft.
    nextProject.lines = nextProject.lines.map(line => {
      try { return { ...line, wordSegments: parseSegmentationDraft(nextSegments[line.id] ?? segmentationDraft(line.text, line.wordSegments), line.text) }; }
      catch { return line; }
    });
    try { writeTimingDraft(base, nextProject, nextTokens, nextCursor, nextSegments); }
    catch { setMessage(t('timestamp.draftFailed')); }
    const run = () => {
      setSaving(true);
      const operation = saveQueue.current.then(async () => {
        const nextSaved = { ...stored, project: nextProject };
        await saveLocal(nextSaved);
        projectRef.current = nextProject; savedRef.current = nextSaved;
        setProject(nextProject); setSaved(nextSaved); setMessage(nextTokens.some((_, index) => orderIssue(nextTokens, index)) ? t('timestamp.orderWarning') : t('timestamp.saved'));
      });
      saveQueue.current = operation.catch(() => { setMessage(t('timestamp.saveFailed')); }).finally(() => setSaving(false));
      return operation;
    };
    if (immediate) return run();
    persistTimer.current = window.setTimeout(() => { void run().catch(() => {}); }, 300);
    return Promise.resolve();
  };
  const replaceTokens = (next: TimingToken[], nextCursor = cursor, text?: string) => {
    setHistory(items => [...items.slice(-299), { tokens, cursor }]); setTokens(next); setCursor(Math.max(0, Math.min(nextCursor, next.length)));
    if (text) setMessage(text); void persistTiming(next, false, nextCursor);
  };
  const orderIssue = (list: TimingToken[], index: number) => {
    if (list[index]?.time === null) return false;
    for (let previous = index - 1; previous >= 0; previous--) if (list[previous].time !== null) return list[index].time! < list[previous].time!;
    return false;
  };
  const stamp = () => {
    if (!audio.current || !saved?.audio || !tokens[cursor] || preview) return;
    const error = timingTimeError(audio.current.currentTime, project?.duration ?? Infinity, lyricOffset);
    if (error) { setMessage(t(`timestamp.${error}`)); return; }
    const next = tokens.map((token, index) => index === cursor ? { ...token, time: toLyricTime(audio.current!.currentTime, lyricOffset) } : token);
    const issue = orderIssue(next, cursor); replaceTokens(next, Math.min(tokens.length, cursor + 1), issue ? t('timestamp.orderWarning') : t('timestamp.stamped'));
  };
  const undo = () => {
    const previous = history.at(-1); if (!previous) return;
    setHistory(history.slice(0, -1)); setTokens(previous.tokens); setCursor(previous.cursor);
    void persistTiming(previous.tokens, false, previous.cursor); setMessage(t('timestamp.undone'));
  };
  const setTokenTime = (value: number | null) => {
    if (!current) return;
    const error = value === null ? null : timingTimeError(value, project?.duration ?? Infinity, lyricOffset);
    if (error) { setMessage(t(`timestamp.${error}`)); setTimeInput(current.time === null ? '' : tokenLabel(current.time)); return; }
    const next = tokens.map((token, index) => index === cursor ? { ...token, time: value === null ? null : toLyricTime(value, lyricOffset) } : token);
    replaceTokens(next, cursor, value === null ? t('timestamp.cleared') : orderIssue(next, cursor) ? t('timestamp.orderWarning') : t('timestamp.corrected'));
  };
  const nudge = (delta: number) => { if (current?.time !== null && current) setTokenTime(mediaTime(current.time) + delta); };
  const applyOffset = () => {
    const delta = Number(offsetInput); if (!Number.isFinite(delta) || delta === 0) { setMessage(t('timestamp.offsetInvalid')); return; }
    const next = tokens.map(token => ({ ...token, time: token.time === null ? null : token.time + delta }));
    const invalid = next.find(token => token.time !== null && timingTimeError(mediaTime(token.time), project?.duration ?? Infinity, lyricOffset));
    if (invalid?.time != null) { setMessage(t(`timestamp.${timingTimeError(mediaTime(invalid.time), project?.duration ?? Infinity, lyricOffset)}`)); return; }
    replaceTokens(next, cursor, t('timestamp.offsetDone', { seconds: delta.toFixed(1) })); setOffsetInput('0');
  };
  const resetLine = (lineIndex: number) => {
    const first = tokens.findIndex(token => token.lineIndex === lineIndex);
    const next = tokens.map(token => token.lineIndex === lineIndex ? { ...token, time: null } : token);
    replaceTokens(next, Math.max(0, first), t('timestamp.lineCleared', { line: lineIndex + 1 }));
  };
  const save = async () => {
    if (!projectRef.current) return false;
    try {
      projectRef.current.lines.forEach(line => parseSegmentationDraft(segments[line.id] ?? segmentationDraft(line.text, line.wordSegments), line.text));
      await persistTiming(tokens, true);
      setMessage(t('timestamp.saveDone')); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : t('timestamp.saveFailed')); return false; }
  };
  const exportLrc = () => {
    if (!project) return;
    const lines = applyTokenTimes(project.lines, tokens, project.duration, project.offset);
    downloadBlob(new Blob([toLrc(lines, project.offset, true)], { type: 'text/plain;charset=utf-8' }), `${project.title || 'lyrics'}.lrc`);
  };
  const play = () => { if (audio.current && saved?.audio) void audio.current.play().catch(() => { setPlaying(false); setPreview(false); setMessage(t('timestamp.playFailed')); }); };
  const togglePlayback = () => { if (!audio.current) return; if (audio.current.paused) play(); else audio.current.pause(); };
  const togglePreview = () => {
    const next = !preview; setPreview(next);
    if (next && audio.current) { const first = effectiveTimes.find(value => value !== null); if (first != null && (audio.current.currentTime < first || audio.current.ended)) audio.current.currentTime = first; play(); }
    else audio.current?.pause();
  };
  const switchMode = (next: 'timing' | 'phrasing') => { audio.current?.pause(); setPreview(false); setMode(next); };
  const updateSegments = (next: Record<string, string>) => { setSegments(next); void persistTiming(tokens, false, cursor, next); };
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandler.current = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
      if (mode !== 'timing') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
      if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
      if (mode !== 'timing') return;
      if (event.code === 'Space') {
        if ((event.target as HTMLElement).closest('button,summary,a[href],[role="button"]')) return;
        event.preventDefault(); togglePlayback(); return;
      }
      if (preview) { if (event.key === 'Escape') { event.preventDefault(); setPreview(false); audio.current?.pause(); } return; }
      if (event.code === 'Tab' && playing && !event.shiftKey) { event.preventDefault(); stamp(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(index => Math.min(tokens.length - 1, index + 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(index => Math.max(0, index - 1)); }
      else if (event.key === '[') { event.preventDefault(); nudge(-0.1); }
      else if (event.key === ']') { event.preventDefault(); nudge(0.1); }
    };
  useEffect(() => { const key = (event: KeyboardEvent) => keyHandler.current(event); window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, []);

  const visibleCursor = preview ? previewCursor : cursor;
  return <main className="timestamp-page"><header className="timestamp-header"><a href="/" onClick={event => { if (!project) return; event.preventDefault(); audio.current?.pause(); void save().then(ok => { if (ok) location.assign('/'); }); }}><ArrowLeft size={17}/>{t('timestamp.back')}</a><div><span>USESUNO MV / TIMING LAB</span><h1>{mode === 'timing'?t('timestamp.timingTitle'):t('timestamp.phrasingTitle')}</h1></div><div className="timestamp-header-actions"><button className="theme-toggle" aria-label={light ? t('timestamp.darkMode') : t('timestamp.lightMode')} onClick={toggleTheme}>{light ? <Moon size={17}/> : <Sun size={17}/>}</button><LanguagePicker/><button className="timestamp-lrc" aria-label={t('modal.lrcOnly')} disabled={!project} onClick={exportLrc}><Download size={15}/><span>{t('modal.lrcOnly')}</span></button><button className="primary" disabled={!project || saving} onClick={() => void save()}><Save size={15}/>{t('timestamp.save')}</button></div></header>
    <nav className="timestamp-modes" aria-label={t('timestamp.tools')}><button className={mode === 'timing' ? 'active' : ''} onClick={() => { switchMode('timing'); }}><TimerReset size={14}/>{t('timestamp.timing')}</button><button className={mode === 'phrasing' ? 'active' : ''} onClick={() => { switchMode('phrasing'); }}><Scissors size={14}/>{t('timestamp.phrasing')}</button></nav>
    <section className="timestamp-sticky"><div className="timestamp-transport"><div className="timestamp-song"><FileAudio size={22}/><div><strong>{project?.title ?? t('timestamp.noProject')}</strong><span>{project?.audioName || t(saved?.audio ? 'timestamp.audioLoaded' : 'timestamp.waitAudio')}</span></div></div><audio ref={audio} controls onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={() => { if (audio.current) audio.current.playbackRate = speed; }} onPlay={() => { setPlaying(true); audio.current?.blur(); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPreview(false); }}/></div>
        <div hidden={mode !== 'timing'} className={`timestamp-now ${preview ? 'preview' : ''}`}><div className="timestamp-current"><span>{t('timestamp.currentTime')}</span><strong ref={clockLabel}>{label(time)}</strong></div><div className="timestamp-next"><span>{preview?t('timestamp.previewing'):t('timestamp.nextWord')}</span><strong>{tokens[visibleCursor]?.text ?? (preview ? '—' : t('timestamp.complete'))}</strong></div><div className="timestamp-now-actions"><button className="play-button" aria-label={playing ? t('timestamp.pause') : t('timestamp.play')} disabled={!saved?.audio} onClick={togglePlayback}>{playing ? <Pause size={16}/> : <Play size={16}/>}<span>{playing?t('timestamp.pause'):t('timestamp.play')}</span></button>{!preview && <><button className="stamp-main" disabled={!current || !saved?.audio} onClick={stamp}><span className="stamp-dot"/><strong>{t('timestamp.tap')}</strong><kbd>Tab</kbd></button><button disabled={!history.length} onClick={undo}><Undo2 size={15}/>{t('timestamp.undo')}</button></>}</div></div>
      </section>
      {mode === 'timing' ? <section className={`timestamp-workspace ${preview ? 'preview' : ''}`}><div className="timestamp-controls"><label>{t('timestamp.speed')}<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label>{!preview && <><button className="adjust-toggle" aria-label={t('timestamp.adjustments')} aria-expanded={adjustments} onClick={() => setAdjustments(value => !value)}><SlidersHorizontal size={16}/></button><div className={`timestamp-edit-tools ${adjustments ? 'expanded' : ''}`}><div className="time-editor"><span>{t('timestamp.wordTime')}</span><button aria-label={t('timestamp.earlier')} disabled={current?.time === null || !current} onClick={() => nudge(-0.1)}>−</button><input aria-label={t('timestamp.wordTime')} value={timeInput} placeholder="--:--.---" onChange={event => setTimeInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={() => { const value = parseTime(timeInput); if (Number.isNaN(value)) { setMessage(t('timestamp.invalidTime')); setTimeInput(current?.time === null || !current ? '' : tokenLabel(current.time)); } else if ((value === null) !== (current?.time === null) || (value !== null && (current?.time == null || Math.abs(value - mediaTime(current.time)) > .0005))) setTokenTime(value); }}/><button aria-label={t('timestamp.later')} disabled={current?.time === null || !current} onClick={() => nudge(0.1)}>+</button><button aria-label={t('timestamp.clear')} disabled={!current || current.time === null} onClick={() => setTokenTime(null)}><X size={14}/></button></div><div className="offset-editor"><span>{t('timestamp.offset')}</span><input aria-label={t('timestamp.offset')} type="number" step="0.1" value={offsetInput} onChange={event => setOffsetInput(event.target.value)}/><i>{t('timestamp.seconds')}</i><button onClick={applyOffset}>{t('timestamp.apply')}</button></div></div></>}<button className={`preview-button ${preview ? 'active' : ''}`} disabled={!completed || !saved?.audio} onClick={togglePreview}>{preview?t('timestamp.exitPreview'):t('timestamp.karaoke')}</button></div>
        {!preview && <div className="timestamp-guide"><p role="status">{message}</p><span><kbd>Space</kbd> {t('timestamp.playPause')}　<kbd>Tab</kbd> {t('timestamp.tap')}　<kbd>↑</kbd><kbd>↓</kbd> {t('timestamp.select')}　<kbd>[</kbd><kbd>]</kbd> {t('timestamp.nudge')}</span></div>}
        <div className="timestamp-progress"><span>{t('timestamp.progress',{done:completed,total:tokens.length})}</span><progress max={Math.max(1, tokens.length)} value={completed}/></div>
        <section ref={sheet} className={`timing-sheet ${preview ? 'karaoke' : ''}`}>{project?.lines.map((line, lineIndex) => {
          const lineTokens = tokenRows[lineIndex] ?? []; const lineStart = lineTokens.find(item => item.token.time !== null)?.token.time;
          return <article key={line.id} className={lineIndex === (preview ? previewLine : currentLine) ? 'active' : ''}><aside><button className="line-time" disabled={lineStart == null} onClick={() => { if (lineStart != null && audio.current) audio.current.currentTime = Math.max(0, Math.min(project.duration, mediaTime(lineStart))); }}>{lineStart == null ? '--:--.---' : tokenLabel(lineStart)}</button>{!preview && <button className="restamp" onClick={() => resetLine(lineIndex)}><span/>{t('timestamp.restamp')}</button>}</aside><div className="timing-line"><header><span>{String(lineIndex + 1).padStart(2, '0')}</span><strong>{line.text}</strong></header><div>{lineTokens.map(({ token, index, outOfOrder }) => { const sung = preview && effectiveTimes[index] !== null && effectiveTimes[index]! <= time; return <button key={token.id} className={`timing-token ${index === visibleCursor ? 'current' : ''} ${token.time !== null ? 'timed' : ''} ${sung ? 'sung' : ''} ${outOfOrder ? 'invalid' : ''}`} aria-label={`${token.text} · ${token.time === null ? t('timestamp.untimed') : tokenLabel(token.time)}`} aria-current={index === visibleCursor ? 'step' : undefined} onClick={() => { if (preview) { setPreview(false); audio.current?.pause(); } setCursor(index); }}><span>{token.text}</span>{!preview && <small>{token.time === null ? '--:--' : tokenLabel(token.time)}</small>}{token.time !== null && !preview ? <Check size={11}/> : null}</button>; })}</div></div></article>; })}</section>
      </section> : <section className="phrasing-sheet"><header><div><strong>{t('phrasing.title')}</strong><p>{t('phrasing.body')}</p></div><button onClick={() => project && updateSegments(Object.fromEntries(project.lines.map(line => [line.id, segmentationDraft(line.text)])))}><RotateCcw size={14}/>{t('phrasing.restore')}</button></header>{project?.lines.map((line, index) => { const draft = segments[line.id] ?? segmentationDraft(line.text, line.wordSegments); const valid = draft.split('/').filter(Boolean).join('') === line.text; return <article key={line.id} className={valid ? '' : 'invalid'}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{line.text}</strong><input aria-label={t('phrasing.line',{line:index+1})} value={draft} onChange={event => updateSegments({ ...segments, [line.id]: event.target.value })}/><small>{valid ? t('phrasing.count',{count:draft.split('/').filter(Boolean).length}) : t('phrasing.invalid')}</small></div></article>; })}</section>}
    {mode === 'phrasing' && <p role="status" className="phrasing-status">{message}</p>}
  </main>;
}
