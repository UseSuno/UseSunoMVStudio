import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import type { BackgroundId } from '../domain/model';
import type { Theme } from '../vendor/folia/types';
import { curtainShader } from './curtainShader';
import { createNebulaCanvas } from './nebula';

export function StudioAuroraBackground({ mode, currentTime, theme, isDaylight = false }: { mode: Extract<BackgroundId, 'aurora-nebula' | 'aurora-curtain'>; currentTime: MotionValue<number>; theme: Theme; isDaylight?: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const container = host.current, target = canvas.current;
    if (!container || !target) return;
    const renderer = createNebulaCanvas({ canvas: target, container, fragmentSource: mode === 'aurora-curtain' ? curtainShader : undefined, autoStart: false, trackPointer: false, renderScale: .72,
      schemes: [isDaylight
        ? { deepBlue: [0.13,0.085,0.12], orange: [0.6,0.29,0.18], warmYellow: [1,0.78,0.51], cyanRim: [0.6,0.85,0.84] }
        : theme.backgroundColor === '#102d2c'
          ? { deepBlue: [0.025,0.09,0.1], orange: [0.12,0.38,0.28], warmYellow: [0.62,0.8,0.38], cyanRim: [0.3,0.95,0.82] }
          : { deepBlue: [0.025,0.07,0.13], orange: [0.08,0.48,0.30], warmYellow: [0.38,0.86,0.57], cyanRim: [0.26,0.73,0.79] }] });
    let frame = 0, smoothTime = currentTime.get(), previousStamp = performance.now();
    const resize = new ResizeObserver(() => renderer.resize()); resize.observe(container);
    const draw = (stamp: number) => {
      const targetTime = currentTime.get();
      const delta = Math.min(.05, Math.max(0, (stamp - previousStamp) / 1000));
      smoothTime += (targetTime - smoothTime) * (1 - Math.exp(-delta * 12));
      renderer.renderFrame(mode === 'aurora-curtain' ? smoothTime : smoothTime * .1 + 1.8);
      previousStamp = stamp; frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); renderer.dispose(); };
  }, [currentTime, isDaylight, mode, theme.backgroundColor]);
  return <div ref={host} className="absolute inset-0 overflow-hidden" style={{ background: '#080c19' }}><canvas ref={canvas} className="absolute inset-0 h-full w-full" /></div>;
}
