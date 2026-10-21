import type { HanziCharData } from "./hanziData";

export interface StrokeRenderResult {
  tipX: number;
  tipY: number;
  angle: number;
  isWriting: boolean;
  hasVectorData: boolean;
}

// Cached Path2D objects for stroke outlines to avoid re-parsing SVG paths on every frame
const path2dCache = new Map<string, Path2D>();

function getOrCreatePath2D(pathStr: string): Path2D | null {
  if (typeof Path2D === "undefined") return null;
  let p = path2dCache.get(pathStr);
  if (!p) {
    p = new Path2D(pathStr);
    path2dCache.set(pathStr, p);
  }
  return p;
}

/**
 * Calculates polyline length of a median point list
 */
function getMedianLength(points: number[][]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    len += Math.hypot(dx, dy);
  }
  return Math.max(70, len);
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Easing curve simulating traditional Chinese calligraphy brush cadence:
 * 起笔沉着（慢） -> 行笔流畅（快） -> 收笔顿锋（稳）
 */
export const easeCalligraphyCadence = (t: number) => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

/**
 * Renders a Chinese character's authentic live stroke-by-stroke writing animation.
 * Follows exact standard Chinese stroke order (横、竖、撇、捺、折、点、提) and skeletal medians.
 */
export function renderHanziStrokeWriting(
  ctx: CanvasRenderingContext2D,
  char: string,
  data: HanziCharData | null,
  cx: number,
  cy: number,
  size: number,
  progress: number, // 0 to 1
  inkColor: string,
  sheenColor: string,
  fontFamily: string,
  fontWeight: number | string,
  alpha: number
): StrokeRenderResult {
  const pClamped = clamp01(progress);

  if (!data || !data.strokes || !data.medians || data.strokes.length === 0) {
    // -------------------------------------------------------------
    // PROCEDURAL FALLBACK for Latin, punctuation, or non-CJK glyphs
    // -------------------------------------------------------------
    return renderProceduralStrokeWriting(
      ctx,
      char,
      cx,
      cy,
      size,
      pClamped,
      inkColor,
      sheenColor,
      fontFamily,
      fontWeight,
      alpha
    );
  }

  const numStrokes = data.strokes.length;
  // Compute weighted stroke lengths
  const strokeLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < numStrokes; i++) {
    const pts = data.medians[i] || [];
    const l = getMedianLength(pts);
    strokeLengths.push(l);
    totalLength += l;
  }

  const targetDist = pClamped * totalLength;
  let accumulated = 0;
  let activeStrokeIdx = numStrokes - 1;
  let localProgress = 1.0;

  for (let i = 0; i < numStrokes; i++) {
    const len = strokeLengths[i];
    if (accumulated + len >= targetDist || i === numStrokes - 1) {
      activeStrokeIdx = i;
      localProgress = clamp01((targetDist - accumulated) / Math.max(1, len));
      break;
    }
    accumulated += len;
  }

  // Coordinate system mapping:
  // HanziWriter data is in 1024x1024 box, ascender ~900, baseline ~0.
  // Visual center is at roughly (512, 388).
  const scale = size / 1024;
  let tipScreenX = cx;
  let tipScreenY = cy;
  let tipAngle = 0;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Set transform so that (512, 388) in HanziWriter coords lands at (cx, cy) on screen,
  // with Y flipped so that Hanzi ascender points upwards on screen.
  ctx.translate(cx, cy);
  ctx.scale(scale, -scale);
  ctx.translate(-512, -388);

  // 1. Draw strokes completed prior to current stroke in authentic mineral ink
  ctx.fillStyle = inkColor;
  for (let i = 0; i < activeStrokeIdx; i++) {
    const strokePath = getOrCreatePath2D(data.strokes[i]);
    if (strokePath) {
      ctx.fill(strokePath);
    }
  }

  // 2. Draw active stroke progressively along its skeletal median
  const activeMedians = data.medians[activeStrokeIdx] || [];
  const activeStrokePath = getOrCreatePath2D(data.strokes[activeStrokeIdx]);

  if (activeMedians.length >= 2 && activeStrokePath) {
    const activeLen = strokeLengths[activeStrokeIdx];
    const easedProgress = easeCalligraphyCadence(localProgress);
    const subTarget = easedProgress * activeLen;

    let traveled = 0;
    const subPoints: Array<[number, number]> = [[activeMedians[0][0], activeMedians[0][1]]];
    let curTipX = activeMedians[0][0];
    let curTipY = activeMedians[0][1];
    let curDx = 1;
    let curDy = 0;

    for (let j = 0; j < activeMedians.length - 1; j++) {
      const p1 = activeMedians[j];
      const p2 = activeMedians[j + 1];
      const segDx = p2[0] - p1[0];
      const segDy = p2[1] - p1[1];
      const segLen = Math.hypot(segDx, segDy);

      if (traveled + segLen >= subTarget) {
        const segT = (subTarget - traveled) / Math.max(0.001, segLen);
        curTipX = p1[0] + segDx * segT;
        curTipY = p1[1] + segDy * segT;
        curDx = segDx;
        curDy = segDy;
        subPoints.push([curTipX, curTipY]);
        break;
      } else {
        traveled += segLen;
        subPoints.push([p2[0], p2[1]]);
        curTipX = p2[0];
        curTipY = p2[1];
        curDx = segDx;
        curDy = segDy;
      }
    }

    // Clip to the stroke's outline, then stroke the revealed median segment with a thick brush!
    ctx.save();
    ctx.clip(activeStrokePath);

    ctx.beginPath();
    ctx.moveTo(subPoints[0][0], subPoints[0][1]);
    for (let k = 1; k < subPoints.length; k++) {
      ctx.lineTo(subPoints[k][0], subPoints[k][1]);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 185; // sufficiently wide to cover stroke outline in 1024-space
    ctx.strokeStyle = inkColor;
    ctx.stroke();

    // Subtle wet gold/mica sheen on fresh wet stroke
    if (localProgress < 0.96) {
      ctx.strokeStyle = sheenColor;
      ctx.lineWidth = 26;
      ctx.globalAlpha = alpha * 0.42 * Math.sin(localProgress * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // Calculate screen coordinates for the brush tip:
    tipScreenX = cx + (curTipX - 512) * scale;
    tipScreenY = cy - (curTipY - 388) * scale;
    // Y-flip reverses the Y tangent on screen
    tipAngle = Math.atan2(-curDy, curDx);
  } else if (activeStrokePath) {
    ctx.fill(activeStrokePath);
  }

  // 3. Faint watermark guide on upcoming strokes of this character
  if (pClamped < 0.98) {
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = alpha * 0.05;
    for (let i = activeStrokeIdx + 1; i < numStrokes; i++) {
      const sp = getOrCreatePath2D(data.strokes[i]);
      if (sp) {
        ctx.stroke(sp);
      }
    }
  }

  ctx.restore();

  return {
    tipX: tipScreenX,
    tipY: tipScreenY,
    angle: tipAngle,
    isWriting: pClamped < 1.0,
    hasVectorData: true,
  };
}

/**
 * Fast direct render of settled characters (when already finished writing).
 * When vector stroke data is available, renders the EXACT SAME vector stroke outlines
 * in archival mineral ink, guaranteeing 100% visual consistency without shape popping.
 */
export function renderSettledHanzi(
  ctx: CanvasRenderingContext2D,
  char: string,
  data: HanziCharData | null,
  cx: number,
  cy: number,
  size: number,
  inkColor: string,
  paperHighlight: string,
  fontFamily: string,
  fontWeight: number | string,
  alpha: number
) {
  if (data && data.strokes && data.strokes.length > 0) {
    const scale = size / 1024;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. Subtle letterpress deboss rim (paper highlight)
    ctx.save();
    ctx.translate(cx + size * 0.015, cy + size * 0.025);
    ctx.scale(scale, -scale);
    ctx.translate(-512, -388);
    ctx.fillStyle = paperHighlight;
    ctx.globalAlpha = alpha * 0.16;
    for (let i = 0; i < data.strokes.length; i++) {
      const sp = getOrCreatePath2D(data.strokes[i]);
      if (sp) ctx.fill(sp);
    }
    ctx.restore();

    // 2. Permanent deep mineral carbon ink
    ctx.translate(cx, cy);
    ctx.scale(scale, -scale);
    ctx.translate(-512, -388);
    ctx.fillStyle = inkColor;

    for (let i = 0; i < data.strokes.length; i++) {
      const sp = getOrCreatePath2D(data.strokes[i]);
      if (sp) ctx.fill(sp);
    }
    ctx.restore();
  } else {
    // Direct typography fallback for non-CJK or pending characters
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = fontWeight + " " + size + "px " + fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Highlight deboss
    ctx.fillStyle = paperHighlight;
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillText(char, cx + size * 0.015, cy + size * 0.025);

    // Deep ink
    ctx.fillStyle = inkColor;
    ctx.globalAlpha = alpha;
    ctx.fillText(char, cx, cy);
    ctx.restore();
  }
}

/**
 * Renders upcoming characters as an exquisite faint watermark / baimiao outline on Xuan paper.
 */
export function renderUpcomingHanzi(
  ctx: CanvasRenderingContext2D,
  char: string,
  data: HanziCharData | null,
  cx: number,
  cy: number,
  size: number,
  outlineColor: string,
  fontFamily: string,
  fontWeight: number | string,
  alpha: number
) {
  if (data && data.strokes && data.strokes.length > 0) {
    const scale = size / 1024;
    ctx.save();
    ctx.globalAlpha = 0.055 * alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, -scale);
    ctx.translate(-512, -388);
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.2;

    for (let i = 0; i < data.strokes.length; i++) {
      const sp = getOrCreatePath2D(data.strokes[i]);
      if (sp) ctx.stroke(sp);
    }
    ctx.restore();
  } else {
    ctx.save();
    ctx.font = fontWeight + " " + size + "px " + fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.06 * alpha;
    ctx.strokeText(char, cx, cy);
    ctx.restore();
  }
}

/**
 * Draws the elegant calligraphic ligature (行气游丝) between consecutive characters in a column.
 * Simulates the fine airborne hair-stroke connecting the tail of one character to the head of the next.
 */
export function renderQiFlowLigature(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fontSize: number,
  progress: number, // 0 to 1 as transition progresses
  inkColor: string,
  alpha: number
) {
  if (alpha <= 0.01) return;

  const p = clamp01(progress);
  // Flow curve: exits previous char with slight right hook, arcs into next char with slight left entrance
  const cp1X = fromX + fontSize * 0.16;
  const cp1Y = fromY + (toY - fromY) * 0.35;
  const cp2X = toX - fontSize * 0.14;
  const cp2Y = fromY + (toY - fromY) * 0.68;

  ctx.save();
  ctx.globalAlpha = alpha * 0.35 * Math.sin(p * Math.PI);
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = Math.max(0.6, fontSize * 0.024);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders the suspended master calligraphy brush cursor (兼毫笔锋与墨润).
 * Follows the active stroke median, tilts dynamically along stroke direction,
 * and releases wet ink onto the raw Xuan paper.
 */
export function renderCalligraphyBrushTip(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  fontSize: number,
  inkColor: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);

  // 1. Wet ink droplet touching Xuan paper
  const dropRadius = Math.max(2.4, fontSize * 0.08);
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = 0.95 * alpha;
  ctx.beginPath();
  ctx.arc(0, 0, dropRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Wet ink diffusion ring into raw Xuan paper fibers
  const haloRadius = Math.max(5.5, fontSize * 0.18);
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = 0.25 * alpha;
  ctx.beginPath();
  ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Slanted Brush Tip Cone (毛笔笔头，兼毫，外覆狼毫，倾斜下压)
  const coneLength = fontSize * 0.34;
  const coneWidth = fontSize * 0.095;
  ctx.fillStyle = "#1A1410";
  ctx.globalAlpha = 0.96 * alpha;
  ctx.beginPath();
  ctx.moveTo(0, 0); // Contact point on paper
  ctx.lineTo(-coneLength, -coneWidth);
  ctx.lineTo(-coneLength * 1.05, 0);
  ctx.lineTo(-coneLength, coneWidth);
  ctx.closePath();
  ctx.fill();

  // 4. Fine bristle catch-light reflection along brush spine
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-fontSize * 0.04, 0);
  ctx.lineTo(-coneLength * 0.85, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Organic calligraphy trajectory fallback for Latin, punctuation, or non-CJK characters.
 * Simulates a hand-drawn stroke along dynamic bezier calligraphy curves.
 */
function renderProceduralStrokeWriting(
  ctx: CanvasRenderingContext2D,
  char: string,
  cx: number,
  cy: number,
  size: number,
  progress: number,
  inkColor: string,
  sheenColor: string,
  fontFamily: string,
  fontWeight: number | string,
  alpha: number
): StrokeRenderResult {
  const isPunctuation = /^[，。！？、；：“”‘’（）《》·—…,.!?;:'"()-]$/.test(char);
  const p = clamp01(progress);

  // Trajectory simulation
  let tipRelX = 0;
  let tipRelY = 0;
  let tipAngle = 0;

  if (isPunctuation) {
    // Punctuation: a decisive dot-press gesture (落笔按捺)
    tipRelX = (p - 0.5) * (size * 0.2);
    tipRelY = (p - 0.5) * (size * 0.3);
    tipAngle = Math.PI / 4;
  } else {
    // Latin / General: natural calligraphy slant motion (落笔右上 -> 运笔左下 -> 回锋)
    const t = p * Math.PI;
    tipRelX = Math.sin(t * 1.5) * (size * 0.35);
    tipRelY = -size * 0.4 + p * (size * 0.8);
    tipAngle = Math.atan2(size * 0.8, Math.cos(t * 1.5) * 1.5 * (size * 0.35));
  }

  const tipX = cx + tipRelX;
  const tipY = cy + tipRelY;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Reveal mask along the calligraphy curve
  const radius = Math.max(16, size * 0.55 * Math.sqrt(p));
  ctx.save();
  ctx.beginPath();
  ctx.arc(tipX, tipY, radius * 1.25, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = inkColor;
  ctx.font = fontWeight + " " + size + "px " + fontFamily;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, cx, cy);

  if (p < 0.95) {
    ctx.strokeStyle = sheenColor;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = alpha * 0.4 * Math.sin(p * Math.PI);
    ctx.strokeText(char, cx, cy);
  }
  ctx.restore();

  ctx.restore();

  return {
    tipX,
    tipY,
    angle: tipAngle,
    isWriting: p < 1.0,
    hasVectorData: false,
  };
}
