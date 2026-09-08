import { useEffect, useMemo, useRef } from 'react';
import type { PlaybackClock } from '../audio/clock';
import type { Project } from '../domain/model';
import { compileProject } from '../renderer/compile';
import { drawFrame } from '../renderer/draw';
import { useTranslation } from 'react-i18next';

export default function LegacyCanvas({ project, peaks, clock }: { project: Project; peaks: number[]; clock: PlaybackClock }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const plan = useMemo(() => compileProject(project, peaks), [project, peaks]);
  useEffect(() => { let id = 0, alive = true, previous = -1; const draw = () => { if (!alive) return; const time = clock.tick(); const context = canvas.current?.getContext('2d'); if (context && time !== previous) { drawFrame(context, plan, time); previous = time; } id = requestAnimationFrame(draw); }; void document.fonts.ready.then(draw); return () => { alive = false; cancelAnimationFrame(id); }; }, [plan, clock]);
  return <canvas ref={canvas} width={plan.width} height={plan.height} aria-label={t('aria.animationPreview',{title:project.title})}/>;
}
