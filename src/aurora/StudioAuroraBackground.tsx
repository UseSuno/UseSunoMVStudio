import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import type { BackgroundId } from '../domain/model';
import type { AudioBands, Theme } from '../vendor/folia/types';
import { curtainShader } from './curtainShader';
import { createNebulaCanvas } from './nebula';

export function StudioAuroraBackground({ mode, currentTime, audioBands, theme, isDaylight = false }: { mode: Extract<BackgroundId, 'aurora-nebula' | 'aurora-curtain'>; currentTime: MotionValue<number>; audioBands: AudioBands; theme: Theme; isDaylight?: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const container = host.current, target = canvas.current;
    if (!container || !target) return;
    const schemes = isDaylight
      ? [
          { deepBlue: [0.13,0.085,0.12], orange: [0.6,0.29,0.18], warmYellow: [1,0.78,0.51], cyanRim: [0.6,0.85,0.84] },
          { deepBlue: [0.105,0.09,0.145], orange: [0.55,0.25,0.27], warmYellow: [0.97,0.68,0.54], cyanRim: [0.57,0.83,0.9] },
          { deepBlue: [0.12,0.08,0.16], orange: [0.52,0.24,0.37], warmYellow: [0.93,0.63,0.58], cyanRim: [0.66,0.8,0.92] },
          { deepBlue: [0.08,0.105,0.16], orange: [0.42,0.3,0.31], warmYellow: [0.88,0.72,0.48], cyanRim: [0.52,0.88,0.84] },
          { deepBlue: [0.09,0.11,0.14], orange: [0.43,0.36,0.2], warmYellow: [0.94,0.82,0.48], cyanRim: [0.58,0.88,0.77] },
        ]
      : theme.backgroundColor === '#102d2c'
        ? [
            { deepBlue: [0.025,0.09,0.1], orange: [0.12,0.38,0.28], warmYellow: [0.62,0.8,0.38], cyanRim: [0.3,0.95,0.82] },
            { deepBlue: [0.02,0.075,0.12], orange: [0.08,0.34,0.36], warmYellow: [0.46,0.78,0.56], cyanRim: [0.28,0.88,0.94] },
            { deepBlue: [0.025,0.065,0.13], orange: [0.08,0.3,0.42], warmYellow: [0.36,0.74,0.68], cyanRim: [0.31,0.72,1] },
            { deepBlue: [0.05,0.045,0.145], orange: [0.17,0.23,0.44], warmYellow: [0.44,0.61,0.78], cyanRim: [0.37,0.82,0.96] },
            { deepBlue: [0.07,0.035,0.14], orange: [0.25,0.17,0.43], warmYellow: [0.55,0.52,0.86], cyanRim: [0.42,0.9,0.84] },
          ]
        : [
            { deepBlue: [0.025,0.07,0.13], orange: [0.08,0.48,0.30], warmYellow: [0.38,0.86,0.57], cyanRim: [0.26,0.73,0.79] },
            { deepBlue: [0.018,0.055,0.155], orange: [0.055,0.37,0.46], warmYellow: [0.31,0.75,0.76], cyanRim: [0.27,0.84,0.91] },
            { deepBlue: [0.025,0.045,0.16], orange: [0.07,0.27,0.55], warmYellow: [0.28,0.66,0.91], cyanRim: [0.32,0.9,0.94] },
            { deepBlue: [0.05,0.024,0.18], orange: [0.24,0.13,0.58], warmYellow: [0.56,0.46,0.92], cyanRim: [0.53,0.55,1] },
            { deepBlue: [0.075,0.012,0.18], orange: [0.42,0.08,0.6], warmYellow: [0.78,0.32,0.88], cyanRim: [0.68,0.34,1] },
          ];
    const renderer = createNebulaCanvas({ canvas: target, container, fragmentSource: mode === 'aurora-curtain' ? curtainShader : undefined, autoStart: false, trackPointer: false, renderScale: mode === 'aurora-nebula' ? .64 : .72, schemes });
    let frame = 0, smoothTime = currentTime.get(), previousStamp = performance.now();
    const resize = new ResizeObserver(() => renderer.resize()); resize.observe(container);
    const draw = (stamp: number) => {
      const targetTime = currentTime.get();
      const delta = Math.min(.05, Math.max(0, (stamp - previousStamp) / 1000));
      smoothTime += (targetTime - smoothTime) * (1 - Math.exp(-delta * 12));
      if (mode === 'aurora-nebula') {
        const cyclePosition = ((smoothTime % 144) + 144) % 144 / 144 * 8;
        renderer.setSchemeProgress(cyclePosition <= 4 ? cyclePosition : 8 - cyclePosition);
      }
      renderer.setAudioResponse({ bass: audioBands.bass.get() / 255, vocal: audioBands.vocal.get() / 255, treble: audioBands.treble.get() / 255 });
      renderer.renderFrame(mode === 'aurora-curtain' ? smoothTime : smoothTime * .55 + 1.8);
      previousStamp = stamp; frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); renderer.dispose(); };
  }, [audioBands, currentTime, isDaylight, mode, theme.backgroundColor]);
  return <div ref={host} data-capture-solid className="absolute inset-0 overflow-hidden" style={{ background: '#080c19' }}><canvas ref={canvas} className="absolute inset-0 h-full w-full" /></div>;
}
