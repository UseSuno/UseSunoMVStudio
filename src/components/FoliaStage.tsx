import { useEffect, useMemo, useRef } from 'react';
import { dimensions, type Project } from '../domain/model';
import type { PlaybackClock } from '../audio/clock';
import { sampleAudioAnalysis, type AudioAnalysis } from '../audio/analysis';
import { useTranslation } from 'react-i18next';
// Keep source renderers isolated from the editor's CSS and physical viewport dimensions.
export function FoliaStage({ project, audioAnalysis, clock, fontBlob, coverBlob, monetPortraitBlob }: { project: Project; audioAnalysis: AudioAnalysis; clock: PlaybackClock; fontBlob: Blob | null; coverBlob: Blob | null; monetPortraitBlob: Blob | null }) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null), ready = useRef(false);
  const latest = useRef({ project, audioAnalysis }); latest.current = { project, audioAnalysis };
  const [w, h] = dimensions(project.ratio, 720);
  const artwork = useMemo(() => ({ coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : null, portraitUrl: monetPortraitBlob ? URL.createObjectURL(monetPortraitBlob) : null }), [coverBlob, monetPortraitBlob]);
  useEffect(() => () => { if (artwork.coverUrl) URL.revokeObjectURL(artwork.coverUrl); if (artwork.portraitUrl) URL.revokeObjectURL(artwork.portraitUrl); }, [artwork]);
  useEffect(() => {
    const resize = () => { if (!host.current || !frame.current) return; const r = host.current.getBoundingClientRect(); frame.current.style.transform = `translate(-50%,-50%) scale(${Math.min(r.width / w, r.height / h)})`; };
    const observer = new ResizeObserver(resize); if (host.current) observer.observe(host.current); resize(); return () => observer.disconnect();
  }, [w, h]);
  useEffect(() => { if (ready.current) frame.current?.contentWindow?.postMessage({ type: 'verse:project', project }, location.origin); }, [project]);
  useEffect(() => { if (ready.current) frame.current?.contentWindow?.postMessage({ type: 'verse:artwork', ...artwork }, location.origin); }, [artwork]);
  useEffect(() => {
    if (!fontBlob || project.font !== 'local' || !ready.current) return;
    void fontBlob.arrayBuffer().then(buffer => frame.current?.contentWindow?.postMessage({ type: 'verse:font', family: project.customFontName || 'Verse Local Font', buffer }, location.origin, [buffer]));
  }, [fontBlob, project.font, project.customFontName]);
  useEffect(() => {
    const listener = (e: MessageEvent) => { if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'verse:ready') { ready.current = true; if (frame.current) delete frame.current.dataset.exportReloading; frame.current?.contentWindow?.postMessage({ type: 'verse:project', project: latest.current.project }, location.origin); frame.current?.contentWindow?.postMessage({ type: 'verse:artwork', ...artwork }, location.origin); if (fontBlob && latest.current.project.font === 'local') void fontBlob.arrayBuffer().then(buffer => frame.current?.contentWindow?.postMessage({ type: 'verse:font', family: latest.current.project.customFontName || 'Verse Local Font', buffer }, location.origin, [buffer])); }
      if (e.data?.type === 'verse:seek' && Number.isFinite(e.data.time)) clock.seek(e.data.time);
    };
    window.addEventListener('message', listener); let id = 0;
    const tick = () => { const { audioAnalysis } = latest.current, t = clock.tick(); if (ready.current && !clock.exporting) frame.current?.contentWindow?.postMessage({ type: 'verse:tick', time: t, playing: clock.playing, audio: sampleAudioAnalysis(audioAnalysis, t) }, location.origin); id = requestAnimationFrame(tick); }; tick();
    return () => { cancelAnimationFrame(id); window.removeEventListener('message', listener); };
  }, [clock, fontBlob, artwork]);
  return <div className="folia-stage-host" ref={host}><iframe ref={frame} src="/folia.html" title={t('folia.frameTitle')} className="folia-stage-frame" style={{ width: w, height: h }} /></div>;
}
