import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FolderOpen, Monitor, Search, Type } from 'lucide-react';
import type { Project } from '../domain/model';
import { ensureGoogleFont, fallbackGoogleFonts, fontFamily, preferredFontWeight } from '../fonts/fonts';

const DIRECTORY_URL = 'https://raw.githubusercontent.com/jonathantneal/google-fonts-complete/master/google-fonts.json';
const CACHE_KEY = 'verse-google-fonts-v1';
const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
type LocalFont = { family: string; blob?: Blob; fontData?: FontData };
type FontData = { family?: string; fullName?: string; blob: () => Promise<Blob> };

function FontRow({ family, source, selected, choose }: { family: string; source: 'google' | 'local'; selected: boolean; choose: () => void }) {
  const row = useRef<HTMLButtonElement>(null), [ready, setReady] = useState(source === 'local');
  useEffect(() => {
    if (source !== 'google' || !row.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect(); void ensureGoogleFont(family, preferredFontWeight(family), true).then(() => setReady(true)).catch(() => undefined);
    }, { threshold: .05 });
    observer.observe(row.current); return () => observer.disconnect();
  }, [family, source]);
  return <button ref={row} className={`font-picker-item ${selected ? 'selected' : ''}`} onClick={choose}>
    <span className="font-source">{source === 'google' ? 'G' : '本地'}</span>
    <span className="font-name" style={ready ? { fontFamily: `"${family}", "Noto Sans SC", sans-serif`, fontWeight: source === 'google' ? preferredFontWeight(family) : 400 } : undefined}>{family}</span>
    <Check size={14}/>
  </button>;
}

export function FontPicker({ project, change, importFont, installFont }: { project: Project; change: (patch: Partial<Project>) => void; importFont: () => void; installFont: (blob: Blob, family: string) => Promise<void> }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'google' | 'local'>('google'), [query, setQuery] = useState('');
  const [families, setFamilies] = useState(fallbackGoogleFonts), [limit, setLimit] = useState(50), [locals, setLocals] = useState<LocalFont[]>([]), [status, setStatus] = useState('');
  const previousFont = useRef(`${project.font}:${project.customFontName || ''}`);
  const currentFamily = project.font === 'local' ? project.customFontName || '本地字体' : fontFamily(project);
  useEffect(() => {
    const identity = `${project.font}:${project.customFontName || ''}`;
    if (project.font === 'local' && project.customFontName) {
      setLocals(items => items.some(item => item.family === project.customFontName) ? items : [{ family: project.customFontName! }, ...items]);
      if (identity !== previousFont.current) setOpen(false);
    }
    previousFont.current = identity;
  }, [project.font, project.customFontName]);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached?.fonts?.length && Date.now() - cached.savedAt < CACHE_AGE) return cached.fonts as string[]; } catch { /* ignore cache */ }
      try {
        const response = await fetch(DIRECTORY_URL); if (!response.ok) throw new Error();
        const data = await response.json() as Record<string, unknown>; const names = Object.keys(data).sort((a, b) => a.localeCompare(b));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), fonts: names })); } catch { /* storage may be full */ }
        return names;
      } catch { setStatus('无法刷新在线字体，已显示热门字体。'); return fallbackGoogleFonts; }
    };
    void read().then(names => { if (alive) setFamilies([...new Set([...fallbackGoogleFonts, ...names])].sort((a, b) => a.localeCompare(b))); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
  const visible = useMemo(() => {
    const source = tab === 'google' ? families.map(family => ({ family } as LocalFont)) : locals;
    const filtered = query ? source.filter(item => item.family.toLowerCase().includes(query.toLowerCase())) : source;
    return filtered.slice(0, limit);
  }, [families, locals, query, tab, limit]);
  const chooseGoogle = async (family: string) => {
    const weight = preferredFontWeight(family); setStatus(`正在加载 ${family}…`);
    try { await ensureGoogleFont(family, weight); change({ font: 'google', customFontName: family, fontWeight: weight }); setStatus('在线字体已就绪'); setOpen(false); }
    catch { setStatus(`无法加载 ${family}，请换一种字体。`); }
  };
  const chooseLocal = async (font: LocalFont) => {
    if (font.blob || font.fontData) await installFont(font.blob ?? await font.fontData!.blob(), font.family);
    else if (project.font !== 'local' || project.customFontName !== font.family) { setStatus('此字体文件需要重新选择。'); return; }
    setOpen(false); setStatus('本地字体已就绪');
  };
  const discover = async () => {
    const queryLocalFonts = (window as Window & { queryLocalFonts?: () => Promise<FontData[]> }).queryLocalFonts;
    if (!queryLocalFonts) { setStatus('此浏览器不支持读取已安装字体，请选择字体文件。'); return; }
    setStatus('正在请求读取已安装字体的权限…');
    try {
      const available = await queryLocalFonts(); const map = new Map<string, LocalFont>();
      for (const data of available) { const family = data.family || data.fullName; if (family && !map.has(family)) map.set(family, { family, fontData: data }); }
      setLocals([...map.values()].sort((a, b) => a.family.localeCompare(b.family))); setStatus(`找到 ${map.size} 个已安装字体`);
    } catch (error) { setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '未允许访问已安装字体。' : '无法读取已安装字体。'); }
  };
  return <div className="font-picker">
    <button className="font-picker-current" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ fontFamily: `"${fontFamily(project)}", "Noto Sans SC", sans-serif` }}><span>{currentFamily}</span><ChevronDown size={14}/></button>
    {open && <><button className="font-picker-overlay" aria-label="关闭字体选择器" onClick={() => setOpen(false)}/><div className="font-picker-menu">
      <header><label><Search size={15}/><input autoFocus type="search" value={query} placeholder="搜索字体…" onChange={event => { setQuery(event.target.value); setLimit(50); }}/></label><div><button className={tab === 'google' ? 'active' : ''} onClick={() => { setTab('google'); setQuery(''); setLimit(50); }}>在线</button><button className={tab === 'local' ? 'active' : ''} onClick={() => { setTab('local'); setQuery(''); setLimit(50); }}>本地</button></div></header>
      {tab === 'local' && <section className="font-local-actions"><button onClick={importFont}><FolderOpen size={14}/>选择字体文件</button><button onClick={() => void discover()}><Monitor size={14}/>已安装的字体</button></section>}
      <div className="font-picker-list" onScroll={event => { const el = event.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) setLimit(value => value + 50); }}>
        {visible.length ? visible.map(item => <FontRow key={`${tab}:${item.family}`} family={item.family} source={tab} selected={currentFamily === item.family} choose={() => void (tab === 'google' ? chooseGoogle(item.family) : chooseLocal(item))}/>) : <p>{tab === 'local' ? '暂无本地字体。选择字体文件或允许访问已安装的字体。' : '未找到字体。'}</p>}
      </div>
    </div></>}
    <span className="font-picker-status"><Type size={11}/>{status || (project.font === 'local' ? '字体文件保存在当前工程中' : '字体仅在选择或预览时加载')}</span>
  </div>;
}
