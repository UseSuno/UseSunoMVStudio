import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import { createNebulaCanvas } from '../aurora/nebula';
import type { AudioBands, Theme } from '../vendor/folia/types';
import { lightTideShader } from './lightTideShader';

interface ColorScheme {
  deepBlue: [number, number, number];
  orange: [number, number, number];
  warmYellow: [number, number, number];
  cyanRim: [number, number, number];
}

const parseHex = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
  }
  return [0.05, 0.1, 0.2];
};

const getOceanicSchemes = (theme: Theme, isDaylight: boolean): ColorScheme[] => {
  const baseRgb = parseHex(theme.backgroundColor);
  const secRgb = parseHex(theme.secondaryColor);
  const accRgb = parseHex(theme.accentColor);
  const bgLuma = baseRgb[0] * 0.299 + baseRgb[1] * 0.587 + baseRgb[2] * 0.114;

  if (isDaylight || bgLuma > 0.42) {
    // Serene Light / Paper Mode: anchors directly to the theme's background color
    // with gentle muted mineral rim tones (celadon sage & terracotta amber)
    const rim: [number, number, number] = [
      secRgb[0] * 0.88 + 0.04,
      secRgb[1] * 0.96 + 0.04,
      secRgb[2] * 0.90 + 0.04,
    ];
    return [
      { deepBlue: baseRgb, orange: [secRgb[0] * 0.75, secRgb[1] * 0.75, secRgb[2] * 0.75], warmYellow: accRgb, cyanRim: rim },
      { deepBlue: [baseRgb[0] * 0.98, baseRgb[1] * 0.98, baseRgb[2] * 0.96], orange: secRgb, warmYellow: accRgb, cyanRim: rim },
      { deepBlue: baseRgb, orange: secRgb, warmYellow: [accRgb[0] * 0.9, accRgb[1] * 0.9, accRgb[2] * 0.9], cyanRim: rim },
      { deepBlue: [baseRgb[0] * 0.99, baseRgb[1] * 0.98, baseRgb[2] * 0.97], orange: secRgb, warmYellow: accRgb, cyanRim: rim },
      { deepBlue: baseRgb, orange: secRgb, warmYellow: accRgb, cyanRim: rim },
    ];
  }

  const bg = theme.backgroundColor.toLowerCase();
  if (bg === '#102d2c' || bg === '#233e36') {
    // Emerald Marine Lagoon
    return [
      { deepBlue: [0.012, 0.055, 0.065], orange: [0.06, 0.28, 0.24], warmYellow: [0.65, 0.92, 0.60], cyanRim: [0.25, 0.88, 0.82] },
      { deepBlue: [0.015, 0.062, 0.070], orange: [0.08, 0.32, 0.22], warmYellow: [0.72, 0.89, 0.52], cyanRim: [0.28, 0.92, 0.78] },
      { deepBlue: [0.010, 0.050, 0.068], orange: [0.05, 0.26, 0.28], warmYellow: [0.58, 0.94, 0.68], cyanRim: [0.22, 0.85, 0.88] },
      { deepBlue: [0.014, 0.058, 0.062], orange: [0.07, 0.30, 0.20], warmYellow: [0.78, 0.95, 0.58], cyanRim: [0.30, 0.90, 0.80] },
      { deepBlue: [0.012, 0.054, 0.066], orange: [0.06, 0.27, 0.25], warmYellow: [0.66, 0.91, 0.62], cyanRim: [0.26, 0.87, 0.84] },
    ];
  }

  if (bg === '#191e24' || bg === '#060b19' || bg === '#080c19' || bg.startsWith('#0') || bg.startsWith('#1')) {
    // Pelagic Oceanic Abyss
    return [
      { deepBlue: [0.015, 0.035, 0.085], orange: [0.05, 0.12, 0.28], warmYellow: [0.72, 0.94, 0.98], cyanRim: [0.32, 0.85, 0.96] },
      { deepBlue: [0.012, 0.040, 0.095], orange: [0.04, 0.14, 0.32], warmYellow: [0.82, 0.96, 0.92], cyanRim: [0.28, 0.90, 0.98] },
      { deepBlue: [0.018, 0.032, 0.080], orange: [0.06, 0.10, 0.25], warmYellow: [0.88, 0.92, 0.82], cyanRim: [0.35, 0.82, 0.92] },
      { deepBlue: [0.014, 0.038, 0.090], orange: [0.05, 0.13, 0.30], warmYellow: [0.75, 0.95, 0.95], cyanRim: [0.30, 0.88, 0.95] },
      { deepBlue: [0.016, 0.036, 0.088], orange: [0.05, 0.12, 0.27], warmYellow: [0.78, 0.93, 0.90], cyanRim: [0.33, 0.86, 0.96] },
    ];
  }

  // Adaptive palette derived from custom theme
  return [
    { deepBlue: [baseRgb[0] * 0.9, baseRgb[1] * 0.9, baseRgb[2] * 0.9], orange: secRgb, warmYellow: accRgb, cyanRim: [accRgb[0] * 0.4 + 0.2, accRgb[1] * 0.8 + 0.1, accRgb[2] * 0.9 + 0.1] },
    { deepBlue: [baseRgb[0] * 0.8, baseRgb[1] * 0.85, baseRgb[2] * 0.95], orange: [secRgb[0] * 0.9, secRgb[1] * 1.1, secRgb[2] * 1.1], warmYellow: [accRgb[0] * 1.1, accRgb[1] * 1.0, accRgb[2] * 0.9], cyanRim: [accRgb[0] * 0.3 + 0.2, accRgb[1] * 0.9 + 0.1, accRgb[2] + 0.05] },
    { deepBlue: [baseRgb[0] * 1.0, baseRgb[1] * 0.95, baseRgb[2] * 0.85], orange: secRgb, warmYellow: accRgb, cyanRim: [accRgb[0] * 0.5 + 0.1, accRgb[1] * 0.7 + 0.2, accRgb[2] * 0.8 + 0.2] },
    { deepBlue: [baseRgb[0] * 0.85, baseRgb[1] * 0.9, baseRgb[2] * 0.9], orange: secRgb, warmYellow: accRgb, cyanRim: [accRgb[0] * 0.35 + 0.2, accRgb[1] * 0.85 + 0.1, accRgb[2] * 0.95 + 0.05] },
    { deepBlue: [baseRgb[0] * 0.9, baseRgb[1] * 0.9, baseRgb[2] * 0.9], orange: secRgb, warmYellow: accRgb, cyanRim: [accRgb[0] * 0.4 + 0.2, accRgb[1] * 0.8 + 0.1, accRgb[2] * 0.9 + 0.1] },
  ];
};

export function LightTideBackground({
  currentTime,
  theme,
  audioBands,
  isDaylight = false,
}: {
  currentTime: MotionValue<number>;
  theme: Theme;
  audioBands: AudioBands;
  isDaylight?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = host.current;
    const target = canvas.current;
    if (!container || !target) return;

    const schemes = getOceanicSchemes(theme, isDaylight);
    const renderer = createNebulaCanvas({
      canvas: target,
      container,
      fragmentSource: lightTideShader,
      autoStart: false,
      trackPointer: true,
      renderScale: 0.72,
      schemes,
    });

    let frame = 0;
    let smoothTime = currentTime.get();
    let previousStamp = performance.now();
    let prevBass = 0;
    let onsetPulse = 0;

    const isSupported = Boolean((renderer as unknown as { isSupported?: boolean }).isSupported);

    // Dynamic rhythm response: detects beat attack transients so wave rings surge on every beat
    const computeAudioResponse = () => {
      const rawBass = Math.max(0, Math.min(1, audioBands.bass.get() / 255));
      const rawVocal = Math.max(0, Math.min(1, audioBands.vocal.get() / 255));
      const rawTreble = Math.max(0, Math.min(1, audioBands.treble.get() / 255));

      const delta = Math.max(0, rawBass - prevBass);
      onsetPulse = Math.max(onsetPulse * 0.82, delta * 4.2);
      prevBass = rawBass;

      return {
        bass: Math.min(1.85, rawBass * 1.15 + onsetPulse * 0.95),
        vocal: Math.min(1.5, rawVocal * 1.2),
        treble: Math.min(1.5, rawTreble * 1.3),
      };
    };

    // Deterministic render for export & exact seeking
    const renderClockFrame = (time: number) => {
      if (isSupported) {
        const cyclePosition = (((time % 144) + 144) % 144) / 144 * 8;
        renderer.setSchemeProgress(cyclePosition <= 4 ? cyclePosition : 8 - cyclePosition);
        renderer.setAudioResponse(computeAudioResponse());
        renderer.renderFrame(time);
      } else {
        draw2DFallback();
      }
    };

    // Fallback 2D render for headless / non-WebGL environments (e.g. test suites)
    const draw2DFallback = () => {
      const ctx = target.getContext('2d');
      if (!ctx) return;
      const w = target.width;
      const h = target.height;
      const t = currentTime.get();
      const bass = Math.max(0, Math.min(1, audioBands.bass.get() / 255));

      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.backgroundColor;
      ctx.fillRect(0, 0, w, h);

      // Ambient oceanic swells
      for (let i = 0; i < 3; i++) {
        const x = w * (0.18 + i * 0.32 + Math.sin(t * 0.09 + i * 2) * 0.1);
        const y = h * (0.5 + Math.cos(t * 0.12 + i * 2.4) * 0.38);
        const radius = Math.max(w, h) * 0.65;
        const color = i % 2 ? theme.accentColor : theme.secondaryColor;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, color + '55');
        glow.addColorStop(1, color + '00');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }

      // Concentric tidal wave rings fallback
      const cx = w * 0.5;
      const cy = h * 0.68;
      const maxR = Math.max(w, h) * 0.85;
      const ringCount = 6;
      for (let i = 0; i < ringCount; i++) {
        const ringPhase = ((t * 0.5 + i * 1.0 + bass * 0.5) % ringCount) / ringCount;
        const r = ringPhase * maxR;
        const alpha = (1 - ringPhase) * (0.18 + bass * 0.32);
        ctx.strokeStyle = i % 2 === 0 ? theme.accentColor : theme.secondaryColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.lineWidth = Math.max(1.5, (1 - ringPhase) * 3.5);
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    if (!isSupported) {
      const resize2D = () => {
        const rect = target.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 1.5);
        target.width = Math.max(1, Math.round(rect.width * scale));
        target.height = Math.max(1, Math.round(rect.height * scale));
        draw2DFallback();
      };
      const observer = new ResizeObserver(resize2D);
      observer.observe(target);
      resize2D();
      const off = currentTime.on('change', draw2DFallback);
      const offBass = audioBands.bass.on('change', draw2DFallback);
      return () => {
        observer.disconnect();
        off();
        offBass();
      };
    }

    const resize = new ResizeObserver(() => {
      renderer.resize();
    });
    resize.observe(container);

    const draw = (stamp: number) => {
      const targetTime = currentTime.get();
      const delta = Math.min(0.05, Math.max(0, (stamp - previousStamp) / 1000));
      smoothTime += (targetTime - smoothTime) * (1 - Math.exp(-delta * 12));

      renderClockFrame(smoothTime);

      previousStamp = stamp;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    // Synchronous deterministic seek / export updates
    const offTime = currentTime.on('change', (latest) => {
      smoothTime = latest;
      renderClockFrame(latest);
    });
    const offBass = audioBands.bass.on('change', () => renderClockFrame(smoothTime));

    return () => {
      cancelAnimationFrame(frame);
      offTime();
      offBass();
      resize.disconnect();
      renderer.dispose();
    };
  }, [audioBands, currentTime, isDaylight, theme]);

  return (
    <div
      ref={host}
      data-capture-solid
      className="absolute inset-0 overflow-hidden"
      style={{ position: 'absolute', inset: 0, background: theme.backgroundColor }}
    >
      <canvas
        ref={canvas}
        data-light-tide
        className="absolute inset-0 h-full w-full"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {/* Soft theme veil overlay (学习流体织光 Overlay 机制，在背景上覆盖半透明主题色，压制高频刺眼对比，保护歌词纯净度) */}
      <div
        data-capture-solid
        className="pointer-events-none absolute inset-0"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: theme.backgroundColor,
          opacity: isDaylight ? 0.42 : 0.22,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
