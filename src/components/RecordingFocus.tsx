import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const stamp = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};

/** These masks and controls stay outside the captured stage, including tab-region capture. */
export function RecordingFocus({ progress, duration, status, cancel }: { progress: number; duration: number; status: string; cancel: () => void }) {
  const { t } = useTranslation();
  const [rect, setRect] = useState<{ left: number; top: number; right: number; bottom: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const stage = document.querySelector<HTMLElement>('.folia-stage-host') ?? document.querySelector<HTMLCanvasElement>('.stage-surround > canvas') ?? document.querySelector<HTMLElement>('.stage-surround');
    document.body.classList.add('realtime-recording');
    const measure = () => {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure); if (stage) observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); document.body.classList.remove('realtime-recording'); };
  }, []);
  const amount = Math.max(0, Math.min(1, progress));
  return <div className="recording-focus">
    {rect ? <>
      <div className="recording-mask" style={{ inset: `0 0 auto 0`, height: rect.top }}/>
      <div className="recording-mask" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}/>
      <div className="recording-mask" style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }}/>
      <div className="recording-mask" style={{ top: rect.bottom, left: 0, right: 0, bottom: 0 }}/>
      <div className="recording-outline" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}/>
    </> : <div className="recording-mask" style={{ inset: 0 }}/>}
    <section className="recording-hud" aria-label={t('export.realtimeLabel')} style={{ top: rect ? rect.bottom + 14 : '50%' }}>
      <div className="recording-hud-row"><strong><i aria-hidden="true"/>{status || t('export.preparing')}</strong><button autoFocus onClick={cancel}>{t('export.cancel')}</button></div>
      <div className="recording-hud-time"><span>{stamp(amount * duration)} / {stamp(duration)}</span><span>{Math.round(amount * 100)}%</span></div>
      <progress value={amount} max={1} aria-label={t('export.realtimeLabel')}/>
      <p>{t('export.limitRealtime')}</p>
    </section>
  </div>;
}
