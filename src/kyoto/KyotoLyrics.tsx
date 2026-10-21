import { useEffect, useMemo, useRef } from 'react';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import VisualizerShell from '../vendor/folia/components/visualizer/VisualizerShell';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../vendor/folia/utils/fontStacks';
import {
  compileKyotoShots,
  clamp01,
  easeInOutCubic,
  easeExpoOut,
  easeSoftBack,
  resolveContinuousKyotoCamera,
  isCjkText,
  groupKyotoGlyphsIntoWords,
} from './director';

/**
 * Resolves whether the current theme represents daylight / warm paper.
 */
function resolveKyotoIsDaylight(theme?: { backgroundColor?: string }, propIsDaylight?: boolean): boolean {
  if (typeof propIsDaylight === 'boolean') return propIsDaylight;
  const bg = (theme?.backgroundColor || '').toLowerCase();
  if (bg === '#ece7db' || bg === '#f6f3eb' || bg === '#e9e4d9') return true;
  if (bg.startsWith('#') && bg.length >= 7) {
    const r = parseInt(bg.substring(1, 3), 16) / 255;
    const g = parseInt(bg.substring(3, 5), 16) / 255;
    const b = parseInt(bg.substring(5, 7), 16) / 255;
    return r * 0.299 + g * 0.587 + b * 0.114 > 0.42;
  }
  return false;
}

/**
 * Draws a rotating vector orbital reticle with precision compass ticks and audio reactivity.
 */
function drawOrbitalReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  color: string,
  alpha: number,
  bassEnergy: number,
  arms = 4
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const scale = 1 + bassEnergy * 0.22;
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = alpha;

  // Outer Dashed Arc Ring
  ctx.beginPath();
  ctx.setLineDash([8, 8]);
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Inner Solid Ring
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // Radial Vector Arms
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = alpha * 0.85;
  for (let a = 0; a < arms; a++) {
    const angle = (a / arms) * Math.PI * 2;
    const r1 = radius * 0.40;
    const r2 = radius * 1.20;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
    ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
    ctx.stroke();
  }

  // Center Satellite Dot
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.95;
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws sonic shockwave ripples expanding from active vocal centroids.
 */
function drawSonicShockwave(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = alpha;

  // Outer Ripple
  ctx.beginPath();
  ctx.setLineDash([6, 6]);
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner Ripple
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.setLineDash([3, 5]);
  ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

interface KineticItem {
  text: string;
  startTime: number;
  endTime: number;
  isHero: boolean;
  scaleMod: number;
  waveShiftY: number;
  width: number;
  localX: number;
  localY: number;
  fontSize: number;
}

export default function KyotoLyrics(props: VisualizerSharedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shots = useMemo(() => compileKyotoShots(props.lines), [props.lines]);

  const {
    currentTime,
    theme,
    audioPower,
    audioBands,
    showText = true,
    lyricsFontScale = 1,
    staticMode = false,
    songTitle,
    songArtist,
    isDaylight: propIsDaylight,
  } = props;

  const isDaylight = resolveKyotoIsDaylight(theme, propIsDaylight);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;
    let disposed = false;

    const render = () => {
      if (disposed || !canvas || !ctx) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || 800;
      const height = rect.height || canvas.clientHeight || 600;
      if (!width || !height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!shots.length) return;

      const time = currentTime.get();
      const currentPower = audioPower ? audioPower.get() : 0;
      const bassEnergy = audioBands ? audioBands.bass.get() / 255 : currentPower / 255;
      const midEnergy = audioBands ? audioBands.mid.get() / 255 : currentPower / 255;
      const trebleEnergy = audioBands ? audioBands.treble.get() / 255 : currentPower / 255;
      const intensity = staticMode ? 0 : 1;
      const baseFontFamily = resolveThemeFontStack(theme);
      const baseFontWeight = resolveThemeFontWeight(theme, 800);

      // Locate active shot
      let activeShotIdx = 0;
      for (let i = shots.length - 1; i >= 0; i--) {
        if (time >= shots[i].start) {
          activeShotIdx = i;
          break;
        }
      }
      const shot = shots[activeShotIdx];

      // 1. Continuous Panoramic Camera Cruise
      const camFrame = resolveContinuousKyotoCamera(shots, time);

      const tau = time * Math.PI * 2;
      const breathX =
        (Math.sin(tau * 0.12) * 0.65 + Math.sin(tau * 0.28) * 0.35) * (width * 0.005) * intensity;
      const breathY =
        (Math.cos(tau * 0.10) * 0.65 + Math.sin(tau * 0.24) * 0.35) * (height * 0.005) * intensity;
      const breathRot = Math.sin(tau * 0.05) * 0.0012 * intensity;

      const camX = camFrame.x * width * intensity + breathX;
      const camY = camFrame.y * height * intensity + breathY;
      const camZoom = camFrame.zoom * (1 + bassEnergy * 0.018 * intensity);

      // Shot Transition Interpolation
      const isExiting = time >= shot.exitStart;
      const exitProgress = isExiting
        ? clamp01((time - shot.exitStart) / Math.max(0.1, shot.end - shot.exitStart))
        : 0;
      const shotAlpha = 1 - easeInOutCubic(exitProgress);

      // -------------------------------------------------------------
      // 2. Kinetic Precision Viewport HUD
      // -------------------------------------------------------------
      const margin = Math.min(width, height) * 0.05;
      ctx.save();
      ctx.strokeStyle = theme.primaryColor;
      ctx.lineWidth = 1.0;
      ctx.globalAlpha = (isDaylight ? 0.35 : 0.25) * shotAlpha;

      // Outer Technical Bounding Rail
      ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

      // Micro Corner Crosses (+)
      const crossSize = 10;
      [
        [margin, margin],
        [width - margin, margin],
        [margin, height - margin],
        [width - margin, height - margin],
      ].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.moveTo(cx - crossSize / 2, cy);
        ctx.lineTo(cx + crossSize / 2, cy);
        ctx.moveTo(cx, cy - crossSize / 2);
        ctx.lineTo(cx, cy + crossSize / 2);
        ctx.stroke();
      });

      // Status Badges & Timecode
      ctx.font = `700 10px ${baseFontFamily}`;
      ctx.fillStyle = theme.primaryColor;
      ctx.globalAlpha = (isDaylight ? 0.70 : 0.50) * shotAlpha;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`KINETIC MG  //  ${shot.chapterBadge}`, margin + 14, margin - 4);

      if (songTitle || songArtist) {
        ctx.textAlign = 'right';
        ctx.fillText(
          `${songTitle ? songTitle.toUpperCase() : ''} ${songArtist ? `· ${songArtist}` : ''}`,
          width - margin - 14,
          margin - 4
        );
      }

      // Live Timecode
      const mins = Math.floor(time / 60);
      const secs = (time % 60).toFixed(2).padStart(5, '0');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`TIME: ${String(mins).padStart(2, '0')}:${secs}  //  60 FPS`, margin + 14, height - margin + 6);

      // -------------------------------------------------------------
      // 3. Audio-Reactive Multi-Band Spectrum Equalizer
      // -------------------------------------------------------------
      const barCount = 16;
      const barW = 3.5;
      const barGap = 4;
      const specStartX = width - margin - (barCount * (barW + barGap)) - 10;
      const specBaseY = height - margin + 4;

      for (let b = 0; b < barCount; b++) {
        const norm = b / (barCount - 1);
        let bandEnergy = bassEnergy;
        if (norm > 0.65) bandEnergy = trebleEnergy;
        else if (norm > 0.3) bandEnergy = midEnergy;

        const wave = Math.sin(time * 7 + b * 0.6) * 0.25 + 0.75;
        const barH = Math.max(3, (bandEnergy * 28 + 4) * wave * intensity);
        const bx = specStartX + b * (barW + barGap);

        ctx.fillStyle = b % 4 === 0 ? theme.accentColor : theme.primaryColor;
        ctx.globalAlpha = (0.35 + bandEnergy * 0.55) * shotAlpha * (isDaylight ? 0.75 : 1.0);
        ctx.fillRect(bx, specBaseY - barH, barW, barH);
      }

      ctx.restore();

      // -------------------------------------------------------------
      // 4. World Space Container with Camera Transform
      // -------------------------------------------------------------
      ctx.save();
      ctx.translate(width / 2 + camX, height / 2 + camY);
      ctx.scale(camZoom, camZoom);
      ctx.rotate((camFrame.rotation + breathRot) * intensity);
      ctx.translate(-width / 2, -height / 2);

      // -------------------------------------------------------------
      // 5. Layer: Massive Hero Outline Watermark (Translucent & Floating)
      // -------------------------------------------------------------
      if (shot.heroGrapheme) {
        ctx.save();
        const watermarkSize = Math.round(Math.min(width, height) * 0.38);
        ctx.font = `900 ${watermarkSize}px ${baseFontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = theme.primaryColor;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = (isDaylight ? 0.055 : 0.075) * shotAlpha;

        const driftX = Math.sin(time * 0.4) * (width * 0.015);
        const driftY = Math.cos(time * 0.3) * (height * 0.015);
        ctx.strokeText(shot.heroGrapheme, width * 0.70 + driftX, height * 0.50 + driftY);
        ctx.restore();
      }

      // -------------------------------------------------------------
      // 7. Layer: Kinetic Vector Orbital Reticles (MG Orbitals)
      // -------------------------------------------------------------
      const shotEnterT = clamp01((time - shot.start) / 0.36);
      const easedShotEnter = easeExpoOut(shotEnterT);

      shot.mgReticles.forEach((reticle) => {
        const rx = reticle.relX * width;
        const ry = reticle.relY * height;
        const rot = time * reticle.speed;
        drawOrbitalReticle(
          ctx,
          rx,
          ry,
          reticle.radius,
          rot,
          theme.accentColor,
          (isDaylight ? 0.38 : 0.30) * shotAlpha * easedShotEnter,
          bassEnergy,
          reticle.arms
        );
      });

      // -------------------------------------------------------------
      // 8. Layer: High-Precision Kinetic Typography (100% VISIBLE, SCALE-HIERARCHY & MOTION ECHOES)
      // -------------------------------------------------------------
      if (showText && shotAlpha > 0.01) {
        const maxSafeW = width * 0.84;

        shot.phrases.forEach((phrase) => {
          const isWestern = !isCjkText(phrase.text);
          const tilt = phrase.tilt ?? 0;

          const isSinglePhrase = shot.phrases.length === 1;
          const fontMultiplier = isSinglePhrase ? 0.076 : 0.062;
          let baseFontSize = Math.round(
            Math.min(width, height) * fontMultiplier * phrase.fontScale * lyricsFontScale
          );
          baseFontSize = Math.max(16, baseFontSize);

          // Build Kinetic Items with Clean Baseline & Consistent Scale
          const items: KineticItem[] = [];

          if (isWestern) {
            const rawWords = groupKyotoGlyphsIntoWords(phrase.glyphs);
            if (!rawWords.length) return;

            rawWords.forEach((rw) => {
              items.push({
                text: rw.text,
                startTime: rw.startTime,
                endTime: rw.endTime,
                isHero: false,
                scaleMod: 1.0,
                waveShiftY: 0,
                width: 0,
                localX: 0,
                localY: 0,
                fontSize: baseFontSize,
              });
            });
          } else {
            const glyphs = phrase.glyphs;
            if (!glyphs.length) return;

            glyphs.forEach((g) => {
              items.push({
                text: g.char,
                startTime: g.startTime,
                endTime: g.endTime,
                isHero: false,
                scaleMod: 1.0,
                waveShiftY: 0,
                width: 0,
                localX: 0,
                localY: 0,
                fontSize: baseFontSize,
              });
            });
          }

          // Measure item widths and total layout span
          let spaceWidth = isWestern ? ctx.measureText(' ').width * 0.90 : Math.round(baseFontSize * 0.06);
          let totalSpan = 0;

          items.forEach((item) => {
            ctx.font = `${baseFontWeight} ${item.fontSize}px ${baseFontFamily}`;
            item.width = ctx.measureText(item.text).width;
            totalSpan += item.width;
          });
          totalSpan += Math.max(0, items.length - 1) * spaceWidth;

          // Auto-clamp font size to guarantee 100% viewport safety
          if (totalSpan > maxSafeW) {
            const fitFactor = maxSafeW / totalSpan;
            baseFontSize = Math.max(14, Math.floor(baseFontSize * fitFactor));
            spaceWidth *= fitFactor;
            totalSpan = 0;

            items.forEach((item) => {
              item.fontSize = baseFontSize;
              ctx.font = `${baseFontWeight} ${item.fontSize}px ${baseFontFamily}`;
              item.width = ctx.measureText(item.text).width;
              totalSpan += item.width;
            });
            totalSpan += Math.max(0, items.length - 1) * spaceWidth;
          }

          // Safe centered positioning
          const minX = width * 0.08 + totalSpan / 2;
          const maxX = width * 0.92 - totalSpan / 2;
          const phraseCenterX = Math.max(minX, Math.min(maxX, phrase.relX * width));
          const phraseCenterY = Math.max(height * 0.16, Math.min(height * 0.84, phrase.relY * height));

          // Resolve localX for all items
          let curX = -totalSpan / 2;
          items.forEach((item) => {
            item.localX = curX + item.width / 2;
            item.localY = 0;
            curX += item.width + spaceWidth;
          });

          ctx.save();
          ctx.translate(phraseCenterX, phraseCenterY);
          if (tilt !== 0) ctx.rotate(tilt);

          // Render Kinetic Items with Motion Echoes & Active Singing Laser
          items.forEach((item, itemIdx) => {
            // Entrance stagger relative to shot start (ENTIRE sentence enters and stays readable!)
            const itemStagger = shot.start + itemIdx * 0.024;
            const enterT = clamp01((time - itemStagger) / 0.26);
            const easedEnter = easeExpoOut(enterT);
            const softSpring = easeSoftBack(enterT);

            const isSinging = time >= item.startTime && time <= item.endTime;
            const isPast = time > item.endTime;

            let enterOffsetY = 0;
            if (phrase.enterDirection === 'from-top') {
              enterOffsetY = (1 - easedEnter) * -22;
            } else if (phrase.enterDirection === 'from-left') {
              enterOffsetY = (1 - easedEnter) * -8;
            } else {
              enterOffsetY = (1 - easedEnter) * 22;
            }

            ctx.save();
            ctx.translate(item.localX, item.localY + enterOffsetY);

            const activeScale = isSinging ? 1.12 : 1.0;
            const activeOffsetY = isSinging ? -3 : 0;
            ctx.translate(0, activeOffsetY);
            ctx.scale(softSpring * activeScale, softSpring * activeScale);

            ctx.font = `${baseFontWeight} ${item.fontSize}px ${baseFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // -------------------------------------------------------------
            // Motion Echoes (残影动效): Draw ghost echoes during entrance!
            // -------------------------------------------------------------
            if (enterT < 0.92) {
              const echoTravel = (1 - easedEnter) * 18;
              ctx.save();
              ctx.fillStyle = theme.accentColor;

              // Echo 1
              ctx.globalAlpha = 0.22 * (1 - enterT) * shotAlpha;
              ctx.fillText(item.text, 0, echoTravel * 0.6);

              // Echo 2
              ctx.globalAlpha = 0.10 * (1 - enterT) * shotAlpha;
              ctx.fillText(item.text, 0, echoTravel * 1.2);

              ctx.restore();
            }

            // -------------------------------------------------------------
            // Main Character / Word Render
            // -------------------------------------------------------------
            if (isSinging) {
              const singSpan = Math.max(0.001, item.endTime - item.startTime);
              const singProg = clamp01((time - item.startTime) / singSpan);

              // Sonic Shockwave Ripple
              const shockR = item.fontSize * (0.6 + singProg * 1.8);
              const shockAlpha = (1 - singProg) * 0.70 * shotAlpha;
              drawSonicShockwave(
                ctx,
                0,
                0,
                shockR,
                theme.accentColor,
                shockAlpha
              );

              // Active Glowing Word
              ctx.shadowColor = theme.accentColor;
              ctx.shadowBlur = 14;
              ctx.fillStyle = theme.accentColor;
              ctx.globalAlpha = 1.0 * shotAlpha;
              ctx.fillText(item.text, 0, 0);

              // Laser Playhead Needle
              const needleX = -item.width / 2 + item.width * singProg;
              ctx.shadowBlur = 6;
              ctx.shadowColor = '#ffffff';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2.0;
              ctx.globalAlpha = 0.95 * shotAlpha;
              ctx.beginPath();
              ctx.moveTo(needleX, -item.fontSize * 0.55);
              ctx.lineTo(needleX, item.fontSize * 0.55);
              ctx.stroke();

              // Velocity Baseline Runner
              ctx.strokeStyle = theme.accentColor;
              ctx.lineWidth = 2.4;
              ctx.globalAlpha = 0.95 * shotAlpha;
              ctx.beginPath();
              ctx.moveTo(-item.width / 2, item.fontSize * 0.60);
              ctx.lineTo(-item.width / 2 + item.width * singProg, item.fontSize * 0.60);
              ctx.stroke();

              // Glowing Spark at Laser Tip
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(needleX, item.fontSize * 0.60, 2.5, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Regular / Past typography (entire sentence is always visible!)
              ctx.shadowBlur = 0;
              ctx.fillStyle = theme.primaryColor;
              ctx.globalAlpha = (isPast ? (isDaylight ? 0.48 : 0.40) : (isDaylight ? 0.90 : 0.85)) * shotAlpha;
              ctx.fillText(item.text, 0, 0);
            }

            ctx.restore();
          });

          ctx.restore();
        });
      }

      ctx.restore(); // End World Space Transform

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      disposed = true;
      if (animId) cancelAnimationFrame(animId);
    };
  }, [shots, currentTime, theme, audioPower, audioBands, showText, lyricsFontScale, staticMode, songTitle, songArtist, isDaylight]);

  return (
    <VisualizerShell
      theme={theme}
      audioPower={audioPower}
      audioBands={audioBands}
      sharedProps={props}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </VisualizerShell>
  );
}
