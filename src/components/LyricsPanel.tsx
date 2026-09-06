import { useEffect, useState } from 'react';
import { Clipboard, FileUp, Plus, Scissors, Merge, Trash2, Timer, RotateCcw } from 'lucide-react';
import { activeLine, timeLabel, type LyricLine, type Project } from '../domain/model';
import { estimateTiming, parseLyrics } from '../import/lyrics';
import type { PlaybackClock } from '../audio/clock';
// Edits invalidate word timings when their text or interval changes.
export function LyricsPanel({ project, commit, selected, select, clock, paste, importFile, openTimestamp, notify }: { project: Project; commit: (p: Project | ((p: Project) => Project)) => void; selected: string | null; select: (id: string) => void; clock: PlaybackClock; paste: () => void; importFile: () => void; openTimestamp: () => void; notify: (s: string) => void }) {
  const [active, setActive] = useState(-1);
  useEffect(() => { const id = setInterval(() => setActive(activeLine(project.lines, clock.time - project.offset)), 100); return () => clearInterval(id); }, [project.lines, project.offset, clock]);
  const update = (id: string, patch: Partial<LyricLine>) => commit(p => ({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, ...patch, words: [], precision: patch.text !== undefined ? l.precision : 'manual' } : l) }));
  const selectedLine = project.lines.find(l => l.id === selected);
  const split = () => {
    if (!selectedLine || Array.from(selectedLine.text).length < 2) return;
    const chars = Array.from(selectedLine.text), half = Math.ceil(chars.length / 2), middle = selectedLine.start !== null && selectedLine.end !== null ? (selectedLine.start + selectedLine.end) / 2 : null;
    const second = { ...selectedLine, id: crypto.randomUUID(), text: chars.slice(half).join(''), start: middle, words: [] };
    commit(p => ({ ...p, lines: p.lines.flatMap(l => l.id === selected ? [{ ...l, text: chars.slice(0, half).join(''), end: middle, words: [] }, second] : [l]) }));
  };
  const merge = () => { const index = project.lines.findIndex(l => l.id === selected); if (index < 0 || index === project.lines.length - 1) return;
    commit(p => ({ ...p, lines: p.lines.flatMap((l, i) => i === index ? [{ ...l, text: `${l.text} ${p.lines[i + 1].text}`, end: p.lines[i + 1].end, words: [] }] : i === index + 1 ? [] : [l]) })); };
  return <div className="lyrics-panel"><div className="panel-title"><h2>歌词</h2><span>{project.lines.length} 行</span></div><div className="import-actions"><button onClick={paste}><Clipboard size={14}/>粘贴歌词</button><button onClick={importFile}><FileUp size={14}/>导入 LRC</button></div>
    <div className="lyrics-meta"><span>{!project.lines.length ? '尚未添加歌词' : project.lines.some(l => l.start === null) ? '有未校时歌词' : project.lines.some(l => l.precision === 'estimated') ? '估算时间轴' : '已加载时间轴'}</span><button title="从原始内容恢复歌词" aria-label="恢复原始歌词" onClick={() => commit(p => ({ ...p, lines: parseLyrics(p.source, p.duration).lines }))}><RotateCcw size={13}/></button></div>
    {project.lines.some(l => l.start === null) && <button className="estimate-button" onClick={() => { commit(p => ({ ...p, lines: estimateTiming(p.lines, p.duration) })); notify('已生成均分草稿时间，请按实际演唱校时。'); }}>生成估算时间</button>}
    <div className="lyric-list">{project.lines.length ? project.lines.map((l, i) => <div key={l.id} className={`lyric-row ${selected === l.id ? 'selected' : ''} ${active === i ? 'singing' : ''}`} onClick={() => select(l.id)}><div className="lyric-row-meta"><span>{String(i + 1).padStart(2, '0')}</span><button title="跳到此句" onClick={e => { e.stopPropagation(); select(l.id); if (l.start !== null) clock.seek(l.start + project.offset); }}>{l.start === null ? '待校时' : timeLabel(l.start)}</button>{l.words.length > 0 ? <small>逐字</small> : l.precision === 'estimated' ? <small>估算</small> : null}</div><textarea aria-label={`第 ${i + 1} 行歌词`} key={`${l.id}-${l.text}`} defaultValue={l.text} rows={1} onFocus={() => select(l.id)} onBlur={e => { if (e.target.value !== l.text) update(l.id, { text: e.target.value }); }}/></div>) : <p className="empty-note">粘贴歌词或导入 LRC，开始你的第一部歌词影片。</p>}</div>
    <div className="lyric-tools"><button title="添加歌词" aria-label="添加歌词" onClick={() => { const id = crypto.randomUUID(); commit(p => ({ ...p, lines: [...p.lines, { id, text: '新的歌词', start: null, end: null, precision: 'untimed', words: [] }] })); select(id); }}><Plus size={15}/></button><button title="居中拆分选中句" aria-label="拆分歌词" disabled={!selectedLine} onClick={split}><Scissors size={15}/></button><button title="合并下一句" aria-label="合并下一句" disabled={!selectedLine} onClick={merge}><Merge size={15}/></button><button title="删除选中句" aria-label="删除歌词" disabled={!selectedLine} onClick={() => commit(p => ({ ...p, lines: p.lines.filter(l => l.id !== selected) }))}><Trash2 size={15}/></button><span/><button className="stamp-button" onClick={openTimestamp}><Timer size={14}/>打开打点工作台</button></div>
  </div>;
}
