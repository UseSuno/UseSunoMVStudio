import { useEffect, useMemo, useRef } from 'react';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import VisualizerShell from '../vendor/folia/components/visualizer/VisualizerShell';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../vendor/folia/utils/fontStacks';
import {
  compileChromaShots,
  clamp01,
  easeInOutCubic,
  easeSoftBack,
  type ChromaPhrase,
  type ChromaGlyph,
} from './director';
import {
  renderHanziStrokeWriting,
  renderSettledHanzi,
  renderUpcomingHanzi,
  renderQiFlowLigature,
  renderCalligraphyBrushTip,
} from './strokeRenderer';
import { getHanziData, preloadLyricsHanzi } from './hanziData';
import {
  isCjkText,
  computeLatinStanzaLayout,
  renderLatinStanza,
} from './latinRenderer';

// Deterministic PRNG for stable paper deckle edges and cold-gold flecks
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Draw authentic Cinnabar Chop Seal (朱砂印：引首章、随形章、方正名章)
function drawChopSeal(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  shape: 'square' | 'circle' | 'oval',
  sealColor: string,
  baseFontFamily: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const half = size / 2;

  ctx.shadowColor = 'rgba(180, 40, 30, 0.22)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1.2;
  ctx.shadowOffsetY = 2;

  ctx.strokeStyle = sealColor;
  ctx.lineWidth = Math.max(1.4, size * 0.085);

  if (shape === 'square') {
    ctx.beginPath();
    ctx.roundRect(-half, -half, size, size, [Math.max(1.5, size * 0.08)]);
    ctx.stroke();

    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(-half + 2.5, -half + 2.5, size - 5, size - 5, [1]);
    ctx.stroke();
  } else if (shape === 'oval') {
    // Traditional elongated oval opening seal (引首长圆章)
    ctx.beginPath();
    ctx.ellipse(0, 0, half * 0.75, half * 1.3, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, half * 0.62, half * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, half - 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Soft weathered seal stamp paste background
  ctx.fillStyle = sealColor;
  ctx.globalAlpha = alpha * 0.88;

  // Carved seal characters in seal script / bold classical style
  const charSize = Math.round(size * (text.length > 2 ? 0.36 : 0.52));
  ctx.font = `900 ${charSize}px ${baseFontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isMultiChar = text.length >= 2;
  if (isMultiChar && shape === 'oval') {
    // Vertical 2-character seal
    ctx.fillText(text[0], 0, -charSize * 0.55);
    ctx.fillText(text[1], 0, charSize * 0.55);
  } else if (isMultiChar && text.length === 3) {
    ctx.font = `900 ${Math.round(size * 0.32)}px ${baseFontFamily}`;
    ctx.fillText(text[0], 0, -charSize * 0.8);
    ctx.fillText(text[1], 0, 0);
    ctx.fillText(text[2], 0, charSize * 0.8);
  } else {
    ctx.fillText(text, 0, 1);
  }

  ctx.restore();
}



interface MineralPalette {
  cinnabar: string;
  azurite: string;
  malachite: string;
  ochre: string;
  goldLeaf: string;
  goldGlow: string;
  paperSubstrate: string;
  paperHighlight: string;
  letterpressInk: string;
  sealCinnabar: string;
  columnRule: string; // 朱丝栏
}

function parseLuminance(color: string): number {
  if (!color) return 128;
  const hex = color.replace('#', '').trim();
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return 128;
}

function resolveMineralPalette(theme: VisualizerSharedProps['theme']): MineralPalette {
  const isDark = parseLuminance(theme.backgroundColor) < 120;
  return {
    cinnabar: '#C43627',
    azurite: isDark ? '#4A7FB0' : '#224B70',
    malachite: isDark ? '#4DA57B' : '#286A4C',
    ochre: isDark ? '#D18A4F' : '#9E5D2E',
    goldLeaf: '#DFB042',
    goldGlow: '#FFF0A8',
    paperSubstrate: isDark ? 'rgba(26, 30, 36, 0.95)' : 'rgba(252, 249, 242, 0.96)',
    paperHighlight: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.72)',
    letterpressInk: isDark ? '#EDE9E2' : '#181512',
    sealCinnabar: '#C13524',
    columnRule: isDark ? 'rgba(196, 54, 39, 0.26)' : 'rgba(196, 54, 39, 0.22)',
  };
}

export default function ChromaLyrics(props: VisualizerSharedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shots = useMemo(() => compileChromaShots(props.lines), [props.lines]);

  // Flatten all phrases across the song into a continuous global column sequence
  const allColumns: ChromaPhrase[] = useMemo(() => shots.flatMap(s => s.phrases), [shots]);

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
  } = props;

  // Background preloader for any CJK characters in the lyrics
  useEffect(() => {
    preloadLyricsHanzi(props.lines);
  }, [props.lines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number | null = null;
    let disposed = false;

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

      if (!shots.length || !allColumns.length) return;

      const time = currentTime.get();
      const currentPower = audioPower ? audioPower.get() : 0;
      const bassEnergy = audioBands ? audioBands.bass.get() / 255 : currentPower / 255;
      const intensity = staticMode ? 0 : 1;
      const baseFontFamily = resolveThemeFontStack(theme);
      const baseFontWeight = resolveThemeFontWeight(theme, 700);
      const palette = resolveMineralPalette(theme);

      // -------------------------------------------------------------
      // 1. Classical Xuan Paper Handscroll Mounting (宣纸手卷装裱底衬)
      // -------------------------------------------------------------
      const margin = Math.min(width, height) * 0.05;
      const innerW = width - margin * 2;
      const innerH = height - margin * 2;
      const scrollTop = margin + innerH * 0.07;
      const scrollBottom = margin + innerH * 0.93;
      const scrollH = scrollBottom - scrollTop;

      // Horizontal 朱丝栏 (Vermilion top & bottom boundary rules)
      ctx.save();
      ctx.strokeStyle = palette.columnRule;
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.85;

      ctx.beginPath();
      ctx.moveTo(margin + innerW * 0.02, scrollTop);
      ctx.lineTo(margin + innerW * 0.98, scrollTop);
      ctx.moveTo(margin + innerW * 0.02, scrollBottom);
      ctx.lineTo(margin + innerW * 0.98, scrollBottom);
      ctx.stroke();

      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(margin + innerW * 0.02, scrollTop - 3);
      ctx.lineTo(margin + innerW * 0.98, scrollTop - 3);
      ctx.moveTo(margin + innerW * 0.02, scrollBottom + 3);
      ctx.lineTo(margin + innerW * 0.98, scrollBottom + 3);
      ctx.stroke();
      ctx.restore();

      // -------------------------------------------------------------
      // 2. Active Column & Continuous Camera Scroll Position
      // -------------------------------------------------------------
      // Find the current active column index across the entire song
      let activeColIdx = 0;
      for (let i = 0; i < allColumns.length; i++) {
        if (time >= allColumns[i].start - 0.25) {
          activeColIdx = i;
        }
      }

      const activeCol = allColumns[activeColIdx];

      // Column widths: CJK columns are vertical handscroll width;
      // Latin / Western columns are classical manuscript folio width.
      const baseColSpacing = Math.max(90, Math.min(145, width * 0.085 * lyricsFontScale));
      const latinColWidth = Math.max(340, Math.min(620, width * 0.42 * lyricsFontScale));
      const colStepGap = Math.max(20, Math.min(44, width * 0.022));

      const colWidths: number[] = allColumns.map((p) => {
        return isCjkText(p.text) ? baseColSpacing : latinColWidth;
      });

      const colCenters: number[] = new Array(allColumns.length).fill(0);
      for (let i = 1; i < allColumns.length; i++) {
        colCenters[i] = colCenters[i - 1] + (colWidths[i - 1] + colWidths[i]) / 2 + colStepGap;
      }

      // Smooth camera transition between columns
      let camScrollX = colCenters[activeColIdx] || 0;
      if (activeCol && activeColIdx > 0) {
        const prevCol = allColumns[activeColIdx - 1];
        const transStart = Math.max(prevCol.end, activeCol.start - 0.5);
        const transEnd = activeCol.start + Math.min(0.35, (activeCol.end - activeCol.start) * 0.25);
        if (time >= transStart && time < transEnd) {
          const tProgress = clamp01((time - transStart) / Math.max(0.08, transEnd - transStart));
          const fromCenter = colCenters[activeColIdx - 1];
          const toCenter = colCenters[activeColIdx];
          camScrollX = fromCenter + (toCenter - fromCenter) * easeInOutCubic(tProgress);
        } else if (time < transStart) {
          camScrollX = colCenters[activeColIdx - 1];
        }
      }

      const focalX = width * 0.52;

      // Camera Breathing & Sub-pixel Organic Drift
      const tau = time * Math.PI * 2;
      const breathY = (Math.cos(tau * 0.11) * 0.65 + Math.sin(tau * 0.29) * 0.35) * (height * 0.003) * intensity;

      // -------------------------------------------------------------
      // 3. Render Columns in Handscroll (Old on Right, New to the Left)
      // -------------------------------------------------------------
      if (showText) {
        allColumns.forEach((phrase: ChromaPhrase, j: number) => {
          const currentWidth = colWidths[j];
          // Exact Handscroll Formula with variable-width columns:
          const colX = focalX + (camScrollX - colCenters[j]);

          // Frustum culling: Skip columns completely outside the viewport
          if (colX < -currentWidth * 1.5 || colX > width + currentWidth * 1.5) {
            return;
          }

          // Edge fade out for columns approaching scroll edges
          let colAlpha = 1.0;
          if (colX > width - margin - currentWidth * 0.5) {
            const edgeFade = clamp01((width - margin - (colX - currentWidth * 0.5)) / currentWidth);
            colAlpha = easeInOutCubic(edgeFade);
          } else if (colX < margin + currentWidth * 0.5) {
            const edgeFade = clamp01(((colX + currentWidth * 0.5) - margin) / currentWidth);
            colAlpha = easeInOutCubic(edgeFade);
          }
          if (colAlpha <= 0.01) return;

          const isCjk = isCjkText(phrase.text);
          const availableH = scrollH * 0.82;
          let sealY = 0;

          if (!isCjk) {
            // -------------------------------------------------------------
            // CLASSICAL WESTERN MANUSCRIPT STANZA (古英文/西文抄本诗节排版)
            // Intact horizontal words, balanced poetic lines, rubricated initial,
            // leadpoint boundary rules, and left-to-right quill pen writing!
            // -------------------------------------------------------------
            const latinLayout = computeLatinStanzaLayout(
              phrase,
              availableH,
              currentWidth,
              baseFontFamily,
              baseFontWeight,
              lyricsFontScale,
              ctx
            );

            const startY = scrollTop + (scrollH - latinLayout.totalHeight) / 2 + latinLayout.lineHeight / 2 + breathY;
            const lastLineY = startY + Math.max(0, latinLayout.lines.length - 1) * latinLayout.lineHeight;
            sealY = Math.min(scrollBottom - 26, lastLineY + latinLayout.lineHeight * 0.75 + 16);

            renderLatinStanza(
              ctx,
              phrase,
              latinLayout,
              colX,
              startY,
              time,
              palette,
              baseFontFamily,
              baseFontWeight,
              colAlpha,
              scrollTop,
              scrollBottom
            );
          } else {
            // -------------------------------------------------------------
            // CLASSICAL CHINESE VERTICAL HANDSCROLL (东方古典长卷排版)
            // -------------------------------------------------------------
            const glyphs = phrase.glyphs;
            const charCount = glyphs.length;
            if (!charCount) return;

            // Vertical typography metrics
            const fontSize = Math.max(
              18,
              Math.min(availableH / (charCount * 1.35), currentWidth * 0.68) *
                phrase.fontScale *
                lyricsFontScale
            );
            const charH = fontSize * 1.32;
            const totalColH = charCount * charH;
            const startY = scrollTop + (scrollH - totalColH) / 2 + charH / 2 + breathY;
            sealY = startY + (charCount - 1) * charH + fontSize * 1.15;

            // Vertical 朱丝栏 (Vermilion Guideline to the right of each column)
            ctx.save();
            ctx.strokeStyle = palette.columnRule;
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = 0.45 * colAlpha;
            ctx.beginPath();
            ctx.moveTo(colX + currentWidth * 0.5, scrollTop);
            ctx.lineTo(colX + currentWidth * 0.5, scrollBottom);
            ctx.stroke();
            ctx.restore();

            const isColumnSinging = time >= phrase.start && time < phrase.end;
            const isColumnFinished = time >= phrase.end;

            // Render each glyph from top to bottom
            glyphs.forEach((g: ChromaGlyph, gIdx: number) => {
              const glyphX = colX;
              const glyphY = startY + gIdx * charH;

              const isGlyphSinging = isColumnSinging && time >= g.startTime && time < g.endTime;
              const hasGlyphSung = isColumnFinished || time >= g.endTime;
              const isGlyphUpcoming = !hasGlyphSung && !isGlyphSinging;

              const hzData = getHanziData(g.char);

              // 1. Inter-character Calligraphic Ligature (行气游丝)
              // Fine airborne cursive trace connecting exit of glyph to entry of next glyph
              if (gIdx < glyphs.length - 1) {
                const nextGlyph = glyphs[gIdx + 1];
                const nextGlyphY = startY + (gIdx + 1) * charH;
                const ligStart = g.endTime - 0.08;
                const ligEnd = nextGlyph.startTime + Math.max(0.08, (nextGlyph.endTime - nextGlyph.startTime) * 0.35);

                if (time >= ligStart && time <= ligEnd) {
                  const ligProgress = clamp01((time - ligStart) / Math.max(0.06, ligEnd - ligStart));
                  renderQiFlowLigature(
                    ctx,
                    glyphX,
                    glyphY + fontSize * 0.35,
                    glyphX,
                    nextGlyphY - fontSize * 0.35,
                    fontSize,
                    ligProgress,
                    palette.letterpressInk,
                    colAlpha
                  );
                }
              }

              if (isGlyphUpcoming) {
                // -------------------------------------------------------------
                // UPCOMING: Faint watermark trace / baimiao outline on Xuan paper
                // -------------------------------------------------------------
                renderUpcomingHanzi(
                  ctx,
                  g.char,
                  hzData,
                  glyphX,
                  glyphY,
                  fontSize,
                  palette.columnRule,
                  baseFontFamily,
                  baseFontWeight,
                  colAlpha
                );
              } else if (hasGlyphSung) {
                // -------------------------------------------------------------
                // SETTLED: Permanent deep mineral carbon ink in paper fibers
                // 100% preserves authentic vector stroke shape with subtle letterpress deboss
                // Zero shape popping, zero font snap
                // -------------------------------------------------------------
                const settledInkAlpha = (isColumnFinished ? 0.88 : 0.98) * colAlpha;
                renderSettledHanzi(
                  ctx,
                  g.char,
                  hzData,
                  glyphX,
                  glyphY,
                  fontSize,
                  palette.letterpressInk,
                  palette.paperHighlight,
                  baseFontFamily,
                  baseFontWeight,
                  settledInkAlpha
                );
              } else if (isGlyphSinging) {
                // -------------------------------------------------------------
                // LIVE AUTHENTIC STROKE-BY-STROKE WRITING (真笔画毛笔正楷书写)
                // Follows exact standard stroke order: 横、竖、撇、捺、折、点、提
                // -------------------------------------------------------------
                const duration = Math.max(0.06, g.endTime - g.startTime);
                const progress = clamp01((time - g.startTime) / duration);

                const strokeResult = renderHanziStrokeWriting(
                  ctx,
                  g.char,
                  hzData,
                  glyphX,
                  glyphY,
                  fontSize,
                  progress,
                  palette.letterpressInk,
                  palette.goldGlow,
                  baseFontFamily,
                  baseFontWeight,
                  1.0 * colAlpha
                );

                // -------------------------------------------------------------
                // SUSPENDED MASTER CALLIGRAPHY BRUSH CURSOR (悬腕兼毫笔锋)
                // Follows stroke median, dynamic bristle tilt & wet droplet
                // -------------------------------------------------------------
                if (strokeResult.isWriting) {
                  renderCalligraphyBrushTip(
                    ctx,
                    strokeResult.tipX,
                    strokeResult.tipY,
                    strokeResult.angle,
                    fontSize,
                    palette.letterpressInk,
                    colAlpha
                  );
                }
              }
            });
          }

          // -------------------------------------------------------------
          // Colophon Seal Stamp at the bottom of completed column
          // -------------------------------------------------------------
          if (phrase.seal && sealY > 0) {
            const seal = phrase.seal;
            const colFinishTime = phrase.end;

            if (time >= colFinishTime - 0.25) {
              const stampProgress = clamp01((time - (colFinishTime - 0.25)) / 0.25);
              const stampSnap = easeSoftBack(stampProgress);
              const stampScale = 1.35 - stampSnap * 0.35;

              ctx.save();
              ctx.translate(colX, sealY);
              ctx.scale(stampScale, stampScale);
              drawChopSeal(
                ctx,
                seal.text,
                seal.size,
                seal.shape,
                palette.sealCinnabar,
                baseFontFamily,
                0.86 * colAlpha * (time >= colFinishTime ? 1.0 : stampProgress)
              );
              ctx.restore();
            }
          }
        });
      }

      // -------------------------------------------------------------
      // 4. Opening Seal (引首章) on Column 0 (Scroll Head)
      // -------------------------------------------------------------
      const firstCol = allColumns[0];
      if (firstCol && shots[0]?.openingSeal) {
        const oSeal = shots[0].openingSeal;
        const col0X = focalX + (camScrollX - colCenters[0]);
        const sealX = col0X + (colWidths[0] || baseColSpacing) * 0.72;
        const sealY = scrollTop + 32;

        if (sealX > margin && sealX < width - margin + (colWidths[0] || baseColSpacing)) {
          ctx.save();
          ctx.translate(sealX, sealY);
          drawChopSeal(ctx, oSeal.text, oSeal.size, 'oval', palette.sealCinnabar, baseFontFamily, 0.75);
          ctx.restore();
        }
      }

      // -------------------------------------------------------------
      // 5. Corner Anchor Seal (压角章) at Bottom-Left of Scroll
      // -------------------------------------------------------------
      if (shots[0]?.cornerSeal) {
        const cSeal = shots[0].cornerSeal;
        ctx.save();
        ctx.translate(margin + innerW * 0.07, scrollBottom - 26);
        drawChopSeal(ctx, cSeal.text, cSeal.size, 'square', palette.sealCinnabar, baseFontFamily, 0.75);
        ctx.restore();
      }

      // -------------------------------------------------------------
      // 6. Colophon Inscription (题跋款识 - Left-Hand Margin)
      // -------------------------------------------------------------
      ctx.save();
      ctx.font = `400 ${Math.max(10, Math.round(height * 0.014))}px ${baseFontFamily}`;
      ctx.fillStyle = theme.primaryColor;
      ctx.globalAlpha = 0.45;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      if (songTitle) {
        ctx.fillText(`《${songTitle}》`, margin + innerW * 0.05, scrollTop + 8);
        if (songArtist) {
          ctx.font = `300 ${Math.max(9, Math.round(height * 0.011))}px ${baseFontFamily}`;
          ctx.globalAlpha = 0.32;
          ctx.fillText(`款识：${songArtist} 唱`, margin + innerW * 0.05, scrollTop + 28);
        }
      }

      // Bottom edition plate
      ctx.font = `400 ${Math.max(9, Math.round(height * 0.011))}px ${baseFontFamily}`;
      ctx.fillStyle = theme.primaryColor;
      ctx.globalAlpha = 0.35;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(shots[0]?.editionPlate || 'FOLIA CHROMA // 宣纸手卷', margin + innerW * 0.05, scrollBottom - 6);
      ctx.restore();

      // -------------------------------------------------------------
      // 7. Floating Gold Leaf Dust in Xuan Paper Atmosphere (冷金笺洒金微粒)
      // -------------------------------------------------------------
      ctx.save();
      const flakeCount = 36;
      for (let i = 0; i < flakeCount; i++) {
        const pSeed = i * 23.47 + 109;
        const baseX = (seededRandom(pSeed) * width + Math.sin(tau * 0.04 + i) * 35) % width;
        const baseY = (seededRandom(pSeed + 1) * height + time * 14 + i * 20) % height;
        const pSize = 1.2 + seededRandom(pSeed + 2) * 2.0;

        const kick = bassEnergy * 20 * intensity;
        const pAlpha =
          (0.14 + seededRandom(pSeed + 3) * 0.32 + bassEnergy * 0.42) *
          intensity *
          (staticMode ? 0.3 : 1);

        ctx.fillStyle = palette.goldLeaf;
        ctx.globalAlpha = pAlpha;
        ctx.beginPath();
        ctx.arc(baseX + Math.sin(time * 2 + i) * kick, baseY, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const loop = () => {
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    const offTime = currentTime.on('change', () => {
      render();
    });

    const observer = new ResizeObserver(() => render());
    observer.observe(canvas);

    return () => {
      disposed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      observer.disconnect();
      offTime();
    };
  }, [
    currentTime,
    theme,
    audioPower,
    audioBands,
    showText,
    lyricsFontScale,
    staticMode,
    shots,
    allColumns,
    songTitle,
    songArtist,
  ]);

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
