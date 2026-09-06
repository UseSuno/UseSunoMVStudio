import { dimensions, type Project, type LyricLine } from '../domain/model';
import { fontStack } from '../fonts/fonts';
// Text geometry is compiled once; preview and export evaluate the same plan.
export interface TextRow { text: string; x: number; y: number; width: number; size: number }
export interface LayoutLine { line: LyricLine; rows: TextRow[]; y: number; height: number; index: number }
export interface RenderPlan { project: Project; width: number; height: number; family: string; entries: LayoutLine[]; peaks: number[] }
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const units = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), s => s.segment);
  const rows: string[] = []; let row = '';
  for (const unit of units) {
    if (row && ctx.measureText(row + unit).width > maxWidth) { rows.push(row.trimEnd()); row = ''; }
    if (ctx.measureText(unit).width > maxWidth) {
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(unit)) { if (row && ctx.measureText(row + segment).width > maxWidth) { rows.push(row); row = ''; } row += segment; }
    } else row += unit;
  }
  if (row.trim()) rows.push(row.trim()); return rows.length ? rows : [''];
}
export function compileProject(project: Project, peaks: number[], outputHeight = 720): RenderPlan {
  const [width, height] = dimensions(project.ratio, outputHeight);
  const context = document.createElement('canvas').getContext('2d')!;
  const family = fontStack(project).map(value => value.includes(' ') ? `"${value}"` : value).join(', ');
  const scale = Math.min(width, height) / 720;
  let y = height * 0.35;
  const entries = project.lines.filter(l => l.start !== null && l.end !== null).map((line, index) => {
    let size = (project.template === 'article' ? 61 : project.template === 'tilt' ? 78 : 66) * scale * project.fontScale;
    context.font = `${project.fontWeight || 500} ${size}px ${family}`;
    const maxWidth = width * (project.template === 'tilt' ? 0.70 : 0.76);
    let texts = wrapText(context, line.text, maxWidth);
    for (let attempt = 0; attempt < 25 && texts.length * size * 1.45 > height * 0.52; attempt++) { size *= 0.85; context.font = `${project.fontWeight || 500} ${size}px ${family}`; texts = wrapText(context, line.text, maxWidth); }
    const rows = texts.map((text, j) => ({ text, x: width * 0.12, y: y + j * size * 1.45, width: context.measureText(text).width, size }));
    const h = texts.length * size * 1.45;
    const entry = { line, rows, y, height: h, index }; y += h + size * 0.95; return entry;
  });
  return { project: structuredClone(project), width, height, family, entries, peaks };
}
