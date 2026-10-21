import { useEffect, useMemo, useRef } from 'react';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import VisualizerShell from '../vendor/folia/components/visualizer/VisualizerShell';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../vendor/folia/utils/fontStacks';
import {
  compileAstralShots,
  clamp01,
  easeOutExpo,
  easeInOutCubic,
  easeSoftBack,
  resolveAstralCameraFrame,
  type AstralShot,
} from './director';

export default function AstralLyrics(props: VisualizerSharedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shots = useMemo(() => compileAstralShots(props.lines), [props.lines]);

  const {
    currentTime,
    theme,
    audioPower,
    audioBands,
    showText = true,
    lyricsFontScale = 1,
    staticMode = false,
  } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;
    let disposed = false;

    // Deterministic pseudo-random
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed * 43.123 + 19.876) * 65432.1234;
      return x - Math.floor(x);
    };

    // Pre-generate cosmic starfield
    const starCount = 85;
    const stars = Array.from({ length: starCount }, (_, i) => ({
      x: pseudoRandom(i * 4 + 1),
      y: pseudoRandom(i * 4 + 2),
      z: 0.2 + pseudoRandom(i * 4 + 3) * 0.8,
      size: 0.8 + pseudoRandom(i * 4 + 4) * 2,
      twinkleSpeed: 0.5 + pseudoRandom(i * 7 + 1) * 1.5,
      phase: pseudoRandom(i * 13 + 3) * Math.PI * 2,
    }));

    const render = () => {
      if (disposed || !canvas || !ctx) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const time = currentTime.get();
      const bassEnergy = audioBands ? (audioBands.bass.get() / 255) : 0;
      const trebleEnergy = audioBands ? (audioBands.treble.get() / 255) : 0;
      const power = audioPower ? (audioPower.get() / 255) : 0;
      const intensity = staticMode ? 0 : 1;

      // 1. Rock-solid active shot lookup (continuous span, NEVER jumping to the end of the song)
      let shotIndex = 0;
      for (let i = shots.length - 1; i >= 0; i--) {
        if (time >= shots[i].start) {
          shotIndex = i;
          break;
        }
      }
      const activeShot: AstralShot = shots[shotIndex];

      const baseFontFamily = resolveThemeFontStack(theme);
      const baseFontWeight = resolveThemeFontWeight(theme, 600);

      // 2. Camera keyframing & continuous 3D celestial drift
      const shotSpan = Math.max(0.1, activeShot.end - activeShot.start);
      const progress = (time - activeShot.start) / shotSpan;
      const camFrame = resolveAstralCameraFrame(activeShot, progress);

      const tau = time * Math.PI * 2;
      const breathX = (Math.sin(tau * 0.13) * 0.65 + Math.sin(tau * 0.31) * 0.35) * (width * 0.005) * intensity;
      const breathY = (Math.cos(tau * 0.11) * 0.65 + Math.sin(tau * 0.29) * 0.35) * (height * 0.005) * intensity;
      const breathRot = Math.sin(tau * 0.07) * 0.0015 * intensity;

      const camX = camFrame.x * width * 0.45 * intensity + breathX;
      const camY = camFrame.y * height * 0.45 * intensity + breathY;
      const camZoom = 1 + (camFrame.zoom - 1) * intensity;
      const camRot = camFrame.rotation * intensity + breathRot;

      ctx.save();
      ctx.translate(width / 2 + camX, height / 2 + camY);
      ctx.scale(camZoom, camZoom);
      ctx.rotate(camRot);

      // 1. Draw 3D Cosmic Starfield
      ctx.save();
      stars.forEach((star) => {
        const sx = (star.x - 0.5) * width * 1.3;
        const sy = (star.y - 0.5) * height * 1.3;
        const twinkle = Math.sin(time * star.twinkleSpeed + star.phase);
        const alpha = (0.2 + (twinkle * 0.5 + 0.5) * 0.5 + trebleEnergy * 0.3 + power * 0.15) * star.z;

        ctx.fillStyle = star.z > 0.6 ? theme.accentColor : theme.primaryColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.beginPath();
        ctx.arc(sx, sy, star.size * star.z, 0, Math.PI * 2);
        ctx.fill();

        if (star.size > 2 && star.z > 0.7) {
          ctx.strokeStyle = theme.accentColor;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = alpha * 0.6;
          ctx.beginPath();
          ctx.moveTo(sx - 5, sy);
          ctx.lineTo(sx + 5, sy);
          ctx.moveTo(sx, sy - 5);
          ctx.lineTo(sx, sy + 5);
          ctx.stroke();
        }
      });
      ctx.restore();

      // 2. Draw 3D Celestial Orbit Rings
      if (activeShot) {
        ctx.save();
        const ringRadius = Math.min(width, height) * activeShot.orbitRadius;
        const tilt = activeShot.orbitTilt;
        const orbitSpeed = time * 0.22;

        ctx.save();
        ctx.rotate(tilt);
        ctx.scale(1, 0.42);

        ctx.strokeStyle = theme.accentColor;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = (0.18 + bassEnergy * 0.18) * intensity;
        ctx.shadowColor = theme.accentColor;
        ctx.shadowBlur = 8;

        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = theme.primaryColor;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.12 * intensity;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius * 1.25, -orbitSpeed, -orbitSpeed + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 3. Audio Gravitational Ripple Waves in Background
        const rippleCount = 3;
        for (let r = 0; r < rippleCount; r++) {
          const rProgress = ((time * 0.6 + r / rippleCount) % 1);
          const rSize = ringRadius * 0.3 + rProgress * ringRadius * 1.1;
          const rAlpha = (1 - rProgress) * (0.15 + bassEnergy * 0.35) * intensity;

          ctx.strokeStyle = theme.accentColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = rAlpha;
          ctx.beginPath();
          ctx.arc(0, 0, rSize, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Draw Typography & Constellation Grouping
      const isBeforeSinging = time < activeShot.lineStartTime;
      const isAfterExit = time >= activeShot.exitStart;
      const exitDuration = Math.min(0.38, Math.max(0.18, activeShot.end - activeShot.exitStart));
      const exitProgress = isAfterExit ? clamp01((time - activeShot.exitStart) / exitDuration) : 0;
      const textAlpha = isBeforeSinging ? 0 : 1 - easeInOutCubic(exitProgress);

      if (showText && textAlpha > 0.001 && activeShot.phrases.length) {
        // Giant Background Constellation Glyph Watermark
        ctx.save();
        const heroPhrase = activeShot.phrases[activeShot.hero]?.text || '';
        let watermarkSize = Math.min(width, height) * 0.20 * lyricsFontScale;
        ctx.font = `300 ${watermarkSize}px ${baseFontFamily}`;
        const wmW = ctx.measureText(heroPhrase).width;
        if (wmW > width * 0.85) {
          watermarkSize = Math.max(18, watermarkSize * ((width * 0.85) / wmW));
          ctx.font = `300 ${watermarkSize}px ${baseFontFamily}`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = theme.accentColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.035 * textAlpha;
        ctx.strokeText(heroPhrase, 0, -height * 0.05);
        ctx.restore();

        const glyphPoints: { x: number; y: number; isSinging: boolean; hasSung: boolean }[] = [];
        const safeHalfW = width * 0.35;
        const safeHalfH = height * 0.32;
        const maxAllowedW = safeHalfW * 2;

        activeShot.phrases.forEach((phrase) => {
          const charCount = Math.max(1, phrase.glyphs.length);
          let fontSize = Math.min(
            maxAllowedW / (charCount * 0.85),
            height * (phrase.role === 'hero' ? 0.082 : 0.060)
          ) * phrase.fontScale * lyricsFontScale;
          fontSize = Math.max(14, fontSize);

          ctx.font = `${phrase.role === 'hero' ? 700 : baseFontWeight} ${fontSize}px ${baseFontFamily}`;
          let phraseWidth = ctx.measureText(phrase.text).width;

          if (phraseWidth > maxAllowedW) {
            fontSize = Math.max(12, fontSize * (maxAllowedW / phraseWidth));
            ctx.font = `${phrase.role === 'hero' ? 700 : baseFontWeight} ${fontSize}px ${baseFontFamily}`;
            phraseWidth = ctx.measureText(phrase.text).width;
          }

          const maxShiftX = Math.max(0, safeHalfW - phraseWidth / 2);
          const px = Math.max(-maxShiftX, Math.min(maxShiftX, phrase.relX * width));
          const py = Math.max(-safeHalfH, Math.min(safeHalfH, phrase.relY * height));

          ctx.save();
          ctx.translate(px, py);
          ctx.font = `${phrase.role === 'hero' ? 700 : baseFontWeight} ${fontSize}px ${baseFontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          let currentX = -phraseWidth / 2;

          phrase.glyphs.forEach((g) => {
            const glyphWidth = ctx.measureText(g.char).width;
            const charCenterX = currentX + glyphWidth / 2;

            const glyphStaggerTime = Math.min(g.startTime - 0.14, phrase.start + g.indexInPhrase * 0.04);
            const glyphLinear = clamp01((time - glyphStaggerTime) / 0.22);
            const glyphSnap = easeOutExpo(glyphLinear);
            const glyphSettle = easeSoftBack(glyphLinear);
            const glyphAlpha = clamp01(glyphLinear * 2.8);

            if (glyphAlpha > 0.01) {
              const isSinging = time >= g.startTime && time < g.endTime;
              const hasSung = time >= g.endTime;

              const travel = 1 - glyphSettle;
              let offX = 0;
              let offY = 0;
              let scale = 1.22 - glyphSnap * 0.22;

              if (phrase.enterStyle === 'crystallize') {
                scale = 1.3 - glyphSnap * 0.3;
              } else if (phrase.enterStyle === 'orbit-glide') {
                offX = Math.cos(phrase.orbitAngle) * travel * (fontSize * 0.45);
                offY = Math.sin(phrase.orbitAngle) * travel * (fontSize * 0.35);
              } else {
                offY = -travel * (fontSize * 0.4);
              }

              const sungRelease = hasSung ? clamp01((time - g.endTime) / 0.8) : 0;
              const releaseTrackingX = (g.indexInPhrase - (charCount - 1) / 2) * (fontSize * 0.035) * sungRelease;

              glyphPoints.push({ x: px + charCenterX + offX + releaseTrackingX, y: py + offY, isSinging, hasSung });

              const singProgress = isSinging ? clamp01((time - g.startTime) / Math.max(0.08, g.endTime - g.startTime)) : 0;
              const singPop = isSinging ? Math.sin(singProgress * Math.PI) * 0.15 : 0;

              ctx.save();
              ctx.translate(charCenterX + offX + releaseTrackingX, offY);
              ctx.scale(scale * (1 + singPop), scale * (1 + singPop));

              // Print misregistration shadow
              ctx.fillStyle = theme.primaryColor;
              ctx.globalAlpha = 0.16 * glyphAlpha * textAlpha;
              ctx.fillText(g.char, fontSize * 0.04, fontSize * 0.05);

              if (isSinging) {
                // Active Character: Brilliant Starburst Core & Luminous Halo
                ctx.shadowColor = theme.accentColor;
                ctx.shadowBlur = 10;
                ctx.fillStyle = theme.accentColor;
                ctx.globalAlpha = glyphAlpha * textAlpha;
                ctx.fillText(g.char, 0, 0);

                ctx.strokeStyle = theme.accentColor;
                ctx.lineWidth = 1.2;
                ctx.globalAlpha = 0.5 * textAlpha;
                ctx.beginPath();
                ctx.arc(0, 0, fontSize * 0.72, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, -fontSize * 0.65, 2.5, 0, Math.PI * 2);
                ctx.fill();
              } else if (hasSung) {
                // Sung character: Crystal Clear Accent Text
                ctx.fillStyle = theme.accentColor;
                ctx.globalAlpha = glyphAlpha * 0.96 * textAlpha;
                ctx.shadowColor = theme.accentColor;
                ctx.shadowBlur = 4;
                ctx.fillText(g.char, 0, 0);
              } else {
                // Upcoming character: Translucent Starlight
                ctx.fillStyle = theme.primaryColor;
                ctx.globalAlpha = glyphAlpha * 0.38 * textAlpha;
                ctx.shadowBlur = 0;
                ctx.fillText(g.char, 0, 0);
              }

              ctx.restore();
            }

            currentX += glyphWidth;
          });

          ctx.restore();
        });

        // 5. Constellation Star-Lines Connecting Characters
        if (glyphPoints.length > 1) {
          ctx.save();
          ctx.lineWidth = 0.9;
          for (let i = 1; i < glyphPoints.length; i++) {
            const p1 = glyphPoints[i - 1];
            const p2 = glyphPoints[i];
            const lineAlpha = (p1.hasSung && p2.hasSung ? 0.35 : p2.isSinging ? 0.75 : 0.1) * textAlpha;

            ctx.strokeStyle = p2.isSinging ? theme.accentColor : theme.primaryColor;
            ctx.globalAlpha = lineAlpha;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y + height * 0.03);
            ctx.lineTo(p2.x, p2.y + height * 0.03);
            ctx.stroke();

            ctx.fillStyle = p2.isSinging ? theme.accentColor : theme.primaryColor;
            ctx.beginPath();
            ctx.arc(p2.x, p2.y + height * 0.03, p2.isSinging ? 2.5 : 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 6. Gravitational Wave Transition between shots
        if (exitProgress > 0 && shotIndex < shots.length - 1) {
          ctx.save();
          const waveRadius = Math.min(width, height) * 0.9 * exitProgress;
          ctx.strokeStyle = theme.accentColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = exitProgress * 0.6;
          ctx.beginPath();
          ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();
    };

    render();

    const observer = new ResizeObserver(() => render());
    observer.observe(canvas);

    const offTime = currentTime.on('change', render);

    const loop = () => {
      if (disposed) return;
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      if (animId) cancelAnimationFrame(animId);
      observer.disconnect();
      offTime();
    };
  }, [currentTime, theme, audioPower, audioBands, showText, lyricsFontScale, staticMode, shots]);

  return (
    <VisualizerShell
      theme={theme}
      audioPower={audioPower}
      audioBands={audioBands}
      sharedProps={props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          data-capture-ready="true"
        />
      </div>
    </VisualizerShell>
  );
}
