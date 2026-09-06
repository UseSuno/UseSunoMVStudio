import { clamp, ease, palettes } from '../domain/model';
import type { RenderPlan, LayoutLine } from './compile';
// Every visible transform is a function of project time, never accumulated frame delta.
function lineProgress(entry: LayoutLine, time: number, estimated: boolean) {
  const { line } = entry;
  if (line.words.length) {
    let total = 0, passed = 0;
    for (const word of line.words) { const n = Array.from(word.text).length; total += n; passed += n * clamp((time - word.start) / Math.max(0.03, word.end - word.start)); }
    return total ? passed / total : 1;
  }
  return estimated ? clamp((time - line.start!) / Math.max(0.1, line.end! - line.start!)) : ease((time - line.start!) / 0.55);
}
function current(entries: LayoutLine[], t: number) {
  const active = entries.findLastIndex(e => t >= e.line.start! && t < e.line.end!);
  const recent = entries.findLastIndex(e => t >= e.line.start!);
  return { active, recent, focus: Math.max(0, recent) };
}
function drawArticle(ctx: CanvasRenderingContext2D, plan: RenderPlan, time: number) {
  const { entries, width: w, height: h, project: p, family } = plan;
  if (!entries.length) return;
  const palette = palettes[p.palette], state = current(entries, time);
  const focus = entries[state.focus], prev = entries[Math.max(0, state.focus - 1)];
  const f = ease((time - focus.line.start!) / (1.05 / p.intensity));
  const center = (e: LayoutLine) => e.y + e.height * 0.35;
  const cameraY = center(prev) + (center(focus) - center(prev)) * f;
  ctx.save(); ctx.translate(0, h * 0.48 - cameraY);
  for (const entry of entries) {
    const distance = Math.abs(center(entry) - cameraY);
    if (distance > h * 1.2) continue;
    const isActive = entry.index === state.active;
    const isRecent = entry.index === state.recent;
    const proximity = 1 - clamp(distance / (h * 0.85));
    const alpha = isActive ? 1 : (isRecent ? 0.45 : 0.1 + proximity * 0.18);
    ctx.fillStyle = palette.accent; ctx.globalAlpha = alpha;
    ctx.font = `${Math.min(w, h) * 0.016}px Arial`;
    ctx.fillText(String(entry.index + 1).padStart(2, '0'), w * 0.065, entry.y - entry.rows[0].size * 0.18);
    const progress = lineProgress(entry, time, p.estimatedReveal);
    for (let j = 0; j < entry.rows.length; j++) {
      const row = entry.rows[j];
      const x = row.x + (entry.index % 3 === 1 ? w * 0.035 : 0);
      ctx.font = `500 ${row.size}px ${family}`;
      ctx.fillStyle = palette.ink; ctx.globalAlpha = alpha * (isActive ? 0.24 : 1);
      ctx.fillText(row.text, x, row.y);
      if (isActive) {
        ctx.save(); ctx.beginPath(); ctx.rect(x - 2, row.y - row.size * 1.1, (row.width + 5) * clamp(progress * entry.rows.length - j), row.size * 1.5); ctx.clip(); ctx.globalAlpha = 1; ctx.fillStyle = palette.ink; ctx.fillText(row.text, x, row.y); ctx.restore();
      }
    }
    if (isActive) { ctx.globalAlpha = 0.8; ctx.fillStyle = palette.accent; ctx.fillRect(w * 0.12, entry.y + entry.height - entry.rows[0].size * 0.9, w * 0.07 * ease((time - entry.line.start!) / 0.8), 2); }
  }
  ctx.restore();
}
function drawFlow(ctx: CanvasRenderingContext2D, plan: RenderPlan, time: number) {
  const { entries, width: w, height: h, project: p, family } = plan;
  const palette = palettes[p.palette]; const state = current(entries, time);
  for (const entry of entries) {
    const elapsed = time - entry.line.start!, after = time - entry.line.end!;
    if (elapsed < -0.5 || after > 1.2) continue;
    const arrival = ease((elapsed + 0.5) / 1.0), departure = ease(after / 1.2);
    const rows = entry.rows, totalHeight = rows.reduce((sum, row) => sum + row.size * 1.5, 0);
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const units = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(row.text), s => s.segment);
      ctx.font = `500 ${row.size}px ${family}`; let advance = 0;
      const progress = lineProgress(entry, time, p.estimatedReveal);
      for (let k = 0; k < units.length; k++) {
        const text = units[k], size = ctx.measureText(text).width;
        const stagger = p.estimatedReveal || entry.line.words.length ? clamp(progress * units.length - k + 1) : arrival;
        const direction = (k + entry.index) % 2 ? 1 : -1;
        const x = (w - row.width) / 2 + advance + (1 - arrival) * direction * 18 * p.intensity;
        const y = (h - totalHeight) / 2 + row.size + j * row.size * 1.5 + Math.sin(k * 1.9 + entry.index) * row.size * 0.20 * p.intensity + (1 - stagger) * 20 - departure * 25;
        ctx.save(); ctx.translate(x + size / 2, y); ctx.rotate(direction * 0.025 * p.intensity * (1 - departure)); ctx.globalAlpha = arrival * (1 - departure) * (0.22 + 0.78 * stagger); ctx.fillStyle = k % 4 === 1 ? palette.accent : palette.ink; ctx.fillText(text, -size / 2, 0); ctx.restore(); advance += size;
      }
    }
    if (entry.index === state.active) { ctx.globalAlpha = arrival * (1 - departure) * 0.5; ctx.fillStyle = palette.accent; ctx.fillRect(w * 0.46, h * 0.76, w * 0.08, 1); }
  }
}
function drawTilt(ctx: CanvasRenderingContext2D, plan: RenderPlan, time: number) {
  const { entries, width: w, height: h, project: p, family } = plan;
  const palette = palettes[p.palette];
  for (const entry of entries) {
    const elapsed = time - entry.line.start!, after = time - entry.line.end!;
    if (elapsed < -0.35 || after > 0.7) continue;
    const enter = ease((elapsed + 0.35) / 0.8), leave = ease(after / 0.7);
    const direction = entry.index % 2 ? 1 : -1;
    const blockHeight = entry.rows.length * entry.rows[0].size * 1.4;
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(direction * (0.07 + 0.035 * (1 - enter)) * p.intensity); ctx.globalAlpha = enter * (1 - leave);
    for (let j = 0; j < entry.rows.length; j++) {
      const row = entry.rows[j]; const local = ease((elapsed + 0.35 - j * 0.1) / 0.6);
      ctx.font = `500 ${row.size}px ${family}`; ctx.fillStyle = j % 2 ? palette.accent : palette.ink;
      const x = -row.width / 2 + (1 - local) * direction * 60;
      const y = -blockHeight / 2 + row.size + j * row.size * 1.4;
      ctx.fillText(row.text, x, y);
      if (j === 0) { ctx.fillStyle = palette.accent; ctx.fillRect(x, y + row.size * 0.25, row.width * 0.22 * local, 3); }
    }
    ctx.restore();
  }
}
export function drawFrame(ctx: CanvasRenderingContext2D, plan: RenderPlan, time: number) {
  const { width: w, height: h, project: p } = plan; const palette = palettes[p.palette];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w, h) / 720;
  // Quiet, fixed-seed print grain; the layout never depends on random frame state.
  ctx.fillStyle = palette.ink; ctx.globalAlpha = 0.025;
  for (let i = 0; i < 650; i++) { const x = ((i * 317 + p.seed * 37) % 1291) / 1291 * w, y = ((i * 193 + p.seed * 13) % 733) / 733 * h; ctx.fillRect(x, y, scale, scale); }
  const t = time - p.offset;
  const first = plan.entries[0]?.line.start ?? 0;
  const last = Math.max(0, ...plan.entries.map(e => e.line.end ?? 0));
  const intro = plan.entries.length > 0 && t < first - 0.5;
  const outro = t > last + 0.8;
  ctx.save(); ctx.beginPath(); ctx.rect(0, h * 0.12, w, h * 0.72); ctx.clip();
  if (intro || outro || !plan.entries.length) {
    ctx.globalAlpha = 1; ctx.fillStyle = palette.ink; ctx.textAlign = 'center'; ctx.font = `500 ${50 * scale * p.fontScale}px ${plan.family}`;
    const max = w * 0.8; ctx.fillText(p.title || '未命名作品', w / 2, h * 0.47, max);
    ctx.font = `${16 * scale}px Arial`; ctx.globalAlpha = 0.6; ctx.fillText(outro ? '—  谢谢聆听  —' : p.artist, w / 2, h * 0.57, max); ctx.textAlign = 'left';
  } else if (p.template === 'article') drawArticle(ctx, plan, t);
  else if (p.template === 'flow') drawFlow(ctx, plan, t);
  else drawTilt(ctx, plan, t);
  ctx.restore();
  // Metadata and a deterministic audio signature are part of the exported composition.
  ctx.globalAlpha = 0.62; ctx.fillStyle = palette.ink; ctx.font = `${12 * scale}px Arial`;
  ctx.fillText(p.title, w * 0.065, h * 0.065, w * 0.65); ctx.textAlign = 'right'; ctx.fillText('LYRIC FILM', w * 0.935, h * 0.065); ctx.textAlign = 'left';
  ctx.fillText(p.artist, w * 0.065, h * 0.93, w * 0.65);
  const sample = plan.peaks[Math.min(plan.peaks.length - 1, Math.floor(clamp(time / p.duration) * plan.peaks.length))] ?? 0;
  for (let i = 0; i < 18; i++) { const bar = (3 + sample * (5 + 12 * (0.5 + 0.5 * Math.sin(i * 1.7 + time * 1.4)))) * scale; ctx.fillRect(w * 0.86 + i * 4 * scale, h * 0.925 - bar / 2, 1.5 * scale, bar); }
  ctx.globalAlpha = 1;
}
