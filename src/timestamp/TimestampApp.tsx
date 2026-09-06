import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileAudio, RotateCcw, Save, Scissors, TimerReset } from 'lucide-react';
import type { Project } from '../domain/model';
import { loadLocal, saveLocal, type SavedProject } from '../persistence/project';
import { applyTokenTimes, tokensFromLines, type TimingToken } from './timing';
import { parseSegmentationDraft, segmentationDraft } from '../import/segmentation';

const label = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toFixed(3).padStart(6, '0')}`;

export function TimestampApp() {
  const audio = useRef<HTMLAudioElement>(null), objectUrl = useRef('');
  const [saved, setSaved] = useState<SavedProject | null>(null), [project, setProject] = useState<Project | null>(null);
  const [tokens, setTokens] = useState<TimingToken[]>([]), [cursor, setCursor] = useState(0), [history, setHistory] = useState<TimingToken[][]>([]);
  const [time, setTime] = useState(0), [speed, setSpeed] = useState(1), [message, setMessage] = useState('正在读取当前工程…');
  const [mode, setMode] = useState<'timing' | 'phrasing'>('timing'), [segments, setSegments] = useState<Record<string, string>>({});
  const currentLine = tokens[cursor]?.lineIndex ?? -1;
  const completed = useMemo(() => tokens.filter(token => token.time !== null).length, [tokens]);

  useEffect(() => {
    let alive = true;
    void loadLocal().then(value => {
      if (!alive || !value) { setMessage('没有可编辑的工程，请先返回 Studio 导入音频与歌词。'); return; }
      setSaved(value); setProject(value.project); const next = tokensFromLines(value.project.lines); setTokens(next); setSegments(Object.fromEntries(value.project.lines.map(line => [line.id, segmentationDraft(line.text, line.wordSegments)])));
      const firstUntimed = next.findIndex(token => token.time === null);
      setCursor(firstUntimed < 0 ? next.length : firstUntimed);
      if (value.audio && audio.current) { objectUrl.current = URL.createObjectURL(value.audio); audio.current.src = objectUrl.current; }
      setMessage(value.audio ? '按 Tab 记录当前字，空格播放或暂停。' : '工程没有音频，请在 Studio 重新关联音频。');
    }).catch(() => setMessage('无法读取当前工程。'));
    return () => { alive = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);

  const stamp = () => {
    if (!audio.current || !tokens[cursor]) return;
    const at = audio.current.currentTime;
    const previousTime = cursor > 0 ? tokens[cursor - 1]?.time : null;
    if (previousTime !== null && at <= previousTime) {
      setMessage('当前播放位置早于上一个字，请向后播放后再打点。');
      return;
    }
    setHistory(items => [...items.slice(-79), tokens]);
    setTokens(items => items.map((token, index) => index === cursor ? { ...token, time: at } : token));
    setCursor(index => Math.min(tokens.length, index + 1));
    setMessage('继续播放，在下一个字出现时按 Tab。');
  };
  const undo = () => setHistory(items => {
    const previous = items.at(-1); if (!previous) return items;
    const firstUntimed = previous.findIndex(token => token.time === null);
    setTokens(previous); setCursor(firstUntimed < 0 ? previous.length : firstUntimed); return items.slice(0, -1);
  });
  const save = async () => {
    if (!project || !saved) return;
    let lines = applyTokenTimes(project.lines, tokens, project.duration);
    try { lines = lines.map(line => ({ ...line, wordSegments: parseSegmentationDraft(segments[line.id] ?? segmentationDraft(line.text, line.wordSegments), line.text) })); }
    catch (error) { setMessage(error instanceof Error ? error.message : '短语编排无效。'); return; }
    const next = { ...project, lines };
    await saveLocal({ ...saved, project: next }); setProject(next); setMessage('时间轴已保存，可以返回 Studio 预览。');
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea')) return;
      if (event.code === 'Tab') { event.preventDefault(); stamp(); }
      if (event.code === 'Space') { event.preventDefault(); if (audio.current?.paused) void audio.current.play(); else audio.current?.pause(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  });
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

  return <main className="timestamp-page"><header className="timestamp-header"><a href="/"><ArrowLeft size={17}/>返回 MV Studio</a><div><span>VERSE / LYRIC LAB</span><h1>{mode === 'timing' ? '逐字歌词打点' : '歌词短语编排'}</h1></div><button className="primary" disabled={!project} onClick={() => void save()}><Save size={15}/>保存到工程</button></header>
    <nav className="timestamp-modes" aria-label="歌词工具"><button className={mode === 'timing' ? 'active' : ''} onClick={() => setMode('timing')}><TimerReset size={14}/>逐字打点</button><button className={mode === 'phrasing' ? 'active' : ''} onClick={() => setMode('phrasing')}><Scissors size={14}/>短语编排</button></nav>
    {mode === 'timing' ? <>
    <section className="timestamp-transport"><div className="timestamp-song"><FileAudio size={22}/><div><strong>{project?.title ?? '尚未载入工程'}</strong><span>{project?.audioName || '等待音频'}</span></div></div><audio ref={audio} controls onTimeUpdate={event => setTime(event.currentTarget.currentTime)}/><label>播放速度<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option></select></label></section>
    <section className="timestamp-now"><div><span>当前时间</span><strong>{label(time)}</strong></div><button className="stamp-main" disabled={!tokens[cursor] || !saved?.audio} onClick={stamp}><span className="stamp-dot"/><div><strong>打下一个字</strong><small>Tab</small></div><b>{tokens[cursor]?.text ?? '完成'}</b></button><div className="timestamp-progress"><span>{completed} / {tokens.length}</span><progress max={Math.max(1, tokens.length)} value={completed}/></div></section>
    <div className="timestamp-toolbar"><p>{message}</p><button disabled={!history.length} onClick={undo}><RotateCcw size={14}/>撤销</button><button onClick={() => { setHistory(items => [...items.slice(-79), tokens]); setTokens(items => items.map(token => ({ ...token, time: null }))); setCursor(0); }}><TimerReset size={14}/>清空时间</button></div>
    <section className="timing-sheet">{project?.lines.map((line, lineIndex) => <article key={line.id} className={lineIndex === currentLine ? 'active' : ''}><header><span>{String(lineIndex + 1).padStart(2, '0')}</span><strong>{line.text}</strong></header><div>{tokens.map((token, index) => token.lineIndex === lineIndex ? <button key={token.id} className={`${index === cursor ? 'current' : ''} ${token.time !== null ? 'timed' : ''}`} onClick={() => { setCursor(index); if (token.time !== null && audio.current) audio.current.currentTime = token.time; }}><span>{token.text}</span><small>{token.time === null ? '--:--' : label(token.time)}</small>{token.time !== null ? <Check size={11}/> : null}</button> : null)}</div></article>)}</section></> : <section className="phrasing-sheet"><header><div><strong>用斜杠划分视觉短语</strong><p>短语决定凝彩、商籁、云阶等模板如何组织画面，不会改变歌词和逐字时间。</p></div><button onClick={() => project && setSegments(Object.fromEntries(project.lines.map(line => [line.id, segmentationDraft(line.text)])))}><RotateCcw size={14}/>恢复自动分词</button></header>{project?.lines.map((line, index) => { const draft = segments[line.id] ?? segmentationDraft(line.text, line.wordSegments); const valid = draft.split('/').filter(Boolean).join('') === line.text; return <article key={line.id} className={valid ? '' : 'invalid'}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{line.text}</strong><input aria-label={`第 ${index + 1} 行短语划分`} value={draft} onChange={event => setSegments(current => ({ ...current, [line.id]: event.target.value }))}/><small>{valid ? `${draft.split('/').filter(Boolean).length} 个视觉短语` : '只能增删分隔符 /，不可改动歌词'}</small></div></article>; })}</section>}
  </main>;
}
