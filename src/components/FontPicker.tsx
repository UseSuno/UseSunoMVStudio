import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FolderOpen, Monitor, Search, Type } from 'lucide-react';
import type { Project } from '../domain/model';
import { ensureGoogleFont, fallbackGoogleFonts, fontFamily, preferredFontWeight } from '../fonts/fonts';
import { useTranslation } from 'react-i18next';
import { privacyUrl } from '../domain/about';

const DIRECTORY_URL = 'https://raw.githubusercontent.com/jonathantneal/google-fonts-complete/master/google-fonts.json';
const CACHE_KEY = 'verse-google-fonts-v1';
const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
type LocalFont = { family: string; blob?: Blob; fontData?: FontData };
type FontData = { family?: string; fullName?: string; blob: () => Promise<Blob> };

function FontRow({ family, source, selected, choose, localLabel }: { family: string; source: 'google' | 'local'; selected: boolean; choose: () => void; localLabel:string }) {
  const row = useRef<HTMLButtonElement>(null), [ready, setReady] = useState(source === 'local');
  useEffect(() => {
    if (source !== 'google' || !row.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect(); void ensureGoogleFont(family, preferredFontWeight(family), true).then(() => setReady(true)).catch(() => undefined);
    }, { threshold: .05 });
    observer.observe(row.current); return () => observer.disconnect();
  }, [family, source]);
  const sampleStyle = { fontFamily: `"${family.replace(/["\\]/g, '\\$&')}", "Noto Sans SC", sans-serif`, fontWeight: source === 'google' ? preferredFontWeight(family) : 400 };
  return <button ref={row} className={`font-picker-item ${selected ? 'selected' : ''}`} onClick={choose} style={sampleStyle}>
    <span className="font-source">{source === 'google' ? 'G' : localLabel}</span>
    <span className="font-name" style={ready ? sampleStyle : undefined}>{family}</span>
    <Check size={14}/>
  </button>;
}

export function FontPicker({ project, change, importFont, installFont }: { project: Project; change: (patch: Partial<Project>) => void; importFont: () => void; installFont: (blob: Blob, family: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'google' | 'local'>('google'), [query, setQuery] = useState('');
  const [families, setFamilies] = useState(fallbackGoogleFonts), [limit, setLimit] = useState(50), [locals, setLocals] = useState<LocalFont[]>([]), [status, setStatus] = useState('');
  const previousFont = useRef(`${project.font}:${project.customFontName || ''}`);
  const currentFamily = project.font === 'local' ? project.customFontName || t('font.localFont') : fontFamily(project);
  useEffect(() => {
    const identity = `${project.font}:${project.customFontName || ''}`;
    if (project.font === 'local' && project.customFontName) {
      setLocals(items => items.some(item => item.family === project.customFontName) ? items : [{ family: project.customFontName! }, ...items]);
      if (identity !== previousFont.current) setOpen(false);
    }
    previousFont.current = identity;
  }, [project.font, project.customFontName]);
  useEffect(() => {
    if (!open || tab !== 'google') return;
    let alive = true;
    const controller = new AbortController();
    const read = async () => {
      try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached?.fonts?.length && Date.now() - cached.savedAt < CACHE_AGE) return cached.fonts as string[]; } catch { /* ignore cache */ }
      try {
        const response = await fetch(DIRECTORY_URL, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!response.ok) throw new Error();
        const data = await response.json() as Record<string, unknown>; const names = Object.keys(data).sort((a, b) => a.localeCompare(b));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), fonts: names })); } catch { /* storage may be full */ }
        return names;
      } catch { if (alive && !controller.signal.aborted) setStatus(t('font.refreshFailed')); return fallbackGoogleFonts; }
    };
    void read().then(names => { if (alive) setFamilies([...new Set([...fallbackGoogleFonts, ...names])].sort((a, b) => a.localeCompare(b))); });
    return () => { alive = false; controller.abort(); };
  }, [open, tab, t]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
  const visible = useMemo(() => {
    const source = tab === 'google' ? families.map(family => ({ family } as LocalFont)) : locals;
    const filtered = query ? source.filter(item => item.family.toLowerCase().includes(query.toLowerCase())) : source;
    return filtered.slice(0, limit);
  }, [families, locals, query, tab, limit]);
  const chooseGoogle = async (family: string) => {
    const weight = preferredFontWeight(family); setStatus(t('font.loading',{family}));
    try { await ensureGoogleFont(family, weight); change({ font: 'google', customFontName: family, fontWeight: weight }); setStatus(t('font.onlineReady')); setOpen(false); }
    catch { setStatus(t('font.loadFailed',{family})); }
  };
  const chooseLocal = async (font: LocalFont) => {
    if (font.blob || font.fontData) await installFont(font.blob ?? await font.fontData!.blob(), font.family);
    else if (project.font !== 'local' || project.customFontName !== font.family) { setStatus(t('font.reselect')); return; }
    setOpen(false); setStatus(t('font.localReady'));
  };
  const discover = async () => {
    const queryLocalFonts = (window as Window & { queryLocalFonts?: () => Promise<FontData[]> }).queryLocalFonts;
    if (!queryLocalFonts) { setStatus(t('font.unsupported')); return; }
    setStatus(t('font.permission'));
    try {
      const available = await queryLocalFonts(); const map = new Map<string, LocalFont>();
      for (const data of available) { const family = data.family || data.fullName; if (family && !map.has(family)) map.set(family, { family, fontData: data }); }
      setLocals([...map.values()].sort((a, b) => a.family.localeCompare(b.family))); setStatus(t('font.found',{count:map.size}));
    } catch (error) { setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? t('font.denied') : t('font.readFailed')); }
  };
  return <div className="font-picker">
    <button className="font-picker-current" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ fontFamily: `"${fontFamily(project)}", "Noto Sans SC", sans-serif` }}><span>{currentFamily}</span><ChevronDown size={14}/></button>
    {open && <><button className="font-picker-overlay" aria-label={t('font.close')} onClick={() => setOpen(false)}/><div className="font-picker-menu">
      <header><label><Search size={15}/><input autoFocus type="search" value={query} placeholder={t('font.search')} onChange={event => { setQuery(event.target.value); setLimit(50); }}/></label><div><button className={tab === 'google' ? 'active' : ''} onClick={() => { setTab('google'); setQuery(''); setLimit(50); }}>{t('font.online')}</button><button className={tab === 'local' ? 'active' : ''} onClick={() => { setTab('local'); setQuery(''); setLimit(50); }}>{t('font.local')}</button></div></header>
      {tab === 'google' && <p className="font-picker-status">{t('font.onlinePrivacy')} <a href={privacyUrl} target="_blank" rel="noreferrer">{t('font.privacy')}</a></p>}
      {tab === 'local' && <section className="font-local-actions"><button onClick={importFont}><FolderOpen size={14}/>{t('font.chooseFile')}</button><button onClick={() => void discover()}><Monitor size={14}/>{t('font.installed')}</button></section>}
      <div className="font-picker-list" onScroll={event => { const el = event.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) setLimit(value => value + 50); }}>
        {visible.length ? visible.map(item => <FontRow key={`${tab}:${item.family}`} family={item.family} source={tab} localLabel={t('font.local')} selected={currentFamily === item.family} choose={() => void (tab === 'google' ? chooseGoogle(item.family) : chooseLocal(item))}/>) : <p>{tab === 'local' ? t('font.emptyLocal') : t('font.empty')}</p>}
      </div>
    </div></>}
    <span className="font-picker-status"><Type size={11}/>{status || (project.font === 'local' ? t('font.saved') : t('font.lazy'))}</span>
  </div>;
}
