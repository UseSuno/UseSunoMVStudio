import { TextResources } from './textResources';
import { CssSnapshot } from './cssSnapshot';
import { frameClock } from './exportClock';
import { type CapturedLayer, type TextCaptureStats } from './layerPackets';

const textProperties = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing',
  'font-synthesis', 'font-variant', 'font-variant-ligatures', 'font-variant-caps',
  'letter-spacing', 'word-spacing', 'line-height', 'white-space', 'text-transform',
  'text-align', 'text-indent', 'text-rendering', 'direction', 'unicode-bidi',
  '-webkit-text-fill-color', '-webkit-font-smoothing',
] as const;
const emptyStats = (): TextCaptureStats => ({ mode: 'empty', units: 0, rebuilt: 0, reused: 0, rebuildReasons: {}, rasterMs: 0, prepareMs: 0, cacheBytes: 0 });
const transparent = (value: string) => value === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(value);
const plain = (value: string) => !value || value === 'none';
const surface = (x: number, y: number, width: number, height: number, opacity: number): CapturedLayer => ({ x, y, width, height, opacity, blend: 'source-over', filter: 'none' });
type Unit = { kind: 'unit'; key: string; reason: string; text: string; language: string; css: string; width: number; height: number; padding: number; scale: number; bytes: number; layer: CapturedLayer };
type Group = { kind: 'group'; opacity: number; children: Tree[] };
type Tree = Unit | Group;

/** Tilt-only contract: existing independently animated inline-block units, axis-aligned
 * transforms, and nested opacity. Unsupported paint effects keep the baseline DOM path. */
export class TiltTextCapture {
  private resources: TextResources;
  private previous = new WeakMap<Element, { paint: string; scale: number }>();
  private oversizedScene?: string;
  constructor(snapshot: CssSnapshot) { this.resources = new TextResources(snapshot, 'tilt'); }

  async prepare(root: HTMLElement, width: number, height: number) {
    const started = frameClock.realNow(), stats = emptyStats();
    const sentences = [...root.querySelectorAll<HTMLElement>('[data-tilt-cache-group="sentence"]')];
    const units: Unit[] = [];
    const styles = new Map<Element, CSSStyleDeclaration>();
    const styleFor = (node: Element) => {
      let style = styles.get(node);
      if (!style) { style = getComputedStyle(node); styles.set(node, style); }
      return style;
    };
    const guard = (node: HTMLElement, ancestor = false) => {
      const s = styleFor(node);
      if (s.display === 'none' || s.visibility !== 'visible') throw new Error('hidden-or-collapsed-unit');
      if (!plain(s.filter) || !plain(s.backdropFilter) || !plain(s.clipPath) || !plain(s.maskImage)
        || s.mixBlendMode !== 'normal' || s.isolation === 'isolate') throw new Error('filter-mask-or-blend');
      if (!plain(s.perspective) || s.transformStyle === 'preserve-3d') throw new Error('perspective');
      if ((!plain(s.translate) && s.translate !== '0px') || !plain(s.rotate) || !plain(s.scale)) throw new Error('individual-transform');
      if (s.transform !== 'none') {
        const m = new DOMMatrixReadOnly(s.transform);
        if (!m.is2D || Math.abs(m.b) > 1e-8 || Math.abs(m.c) > 1e-8 || m.a <= 0 || m.d <= 0) throw new Error('rotation-or-3d-transform');
      }
      if (ancestor && Number(s.opacity) !== 1) throw new Error('outer-opacity-group');
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const r = node.getBoundingClientRect();
        if (!ancestor || r.left > 0 || r.top > 0 || r.right < width || r.bottom < height) throw new Error('local-clipping');
      }
      if (!ancestor) {
        if (!transparent(s.backgroundColor) || !plain(s.backgroundImage) || !plain(s.boxShadow) || !plain(s.textShadow)
          || s.textDecorationLine !== 'none' || parseFloat(s.getPropertyValue('-webkit-text-stroke-width')) > 0
          || ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0)
          || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0)) throw new Error('unadapted-decoration');
        for (const pseudo of ['::before', '::after']) {
          const content = getComputedStyle(node, pseudo).content;
          if (content && !['none', 'normal', '""', "''"].includes(content)) throw new Error('pseudo-content');
        }
      }
      return s;
    };
    const read = (node: HTMLElement): Tree => {
      const s = styleFor(node);
      // Exact zero only: preserve every visible step of fades and pulse animations.
      if (Number(s.opacity) === 0) return { kind: 'group', opacity: 0, children: [] };
      guard(node);
      if (node.hasAttribute('data-tilt-cache-unit')) {
        if (node.children.length || s.display !== 'inline-block' || s.writingMode !== 'horizontal-tb'
          || ['padding-left', 'padding-right', 'padding-top', 'padding-bottom'].some(p => parseFloat(s.getPropertyValue(p)) !== 0)) throw new Error('unit-layout');
        const text = node.textContent ?? '';
        if (!text.trim()) return { kind: 'group', opacity: 1, children: [] };
        const w = parseFloat(s.width), h = parseFloat(s.height), fontSize = parseFloat(s.fontSize);
        const rect = node.getBoundingClientRect();
        if (!(w > 0 && h > 0 && fontSize > 0)) throw new Error('unit-size');
        const sx = rect.width / w, sy = rect.height / h;
        if (!(sx > 0 && sy > 0 && Number.isFinite(sx + sy))) throw new Error('unit-scale');
        const css = textProperties.map(p => `${p}:${s.getPropertyValue(p)}`).join(';');
        const language = node.closest('[lang]')?.getAttribute('lang') ?? root.ownerDocument.documentElement.lang;
        const paint = JSON.stringify([text, language, css, w, h]);
        const previous = this.previous.get(node);
        // Tilt's existing pulse tops out at 1.18. Use export-space pixels with
        // headroom; increase resolution if a larger supported scale is observed.
        const scale = Math.max(1.25, Math.ceil(Math.max(sx, sy) * 4) / 4, previous?.paint === paint ? previous.scale : 0);
        this.previous.set(node, { paint, scale });
        const padding = Math.ceil(fontSize), pw = Math.ceil((w + padding * 2) * scale), ph = Math.ceil((h + padding * 2) * scale);
        if (pw > 4096 || ph > 4096) throw new Error('unit-surface-size');
        const unit: Unit = { kind: 'unit', key: JSON.stringify([paint, scale]), reason: !previous ? 'new-unit' : previous.paint !== paint ? 'paint-change' : 'scale-increase', text, language, css, width: w, height: h, padding, scale, bytes: pw * ph * 4,
          layer: surface(rect.left - padding * sx, rect.top - padding * sy, (w + padding * 2) * sx, (h + padding * 2) * sy, Number(s.opacity)) };
        units.push(unit); return unit;
      }
      if ([...node.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) throw new Error('unmarked-text');
      return { kind: 'group', opacity: Number(s.opacity), children: [...node.children].map(child => {
        if (!(child instanceof HTMLElement)) throw new Error('unadapted-element');
        return read(child);
      }) };
    };
    let trees: Tree[];
    let scene = '';
    try {
      for (const sentence of sentences) for (let ancestor = sentence.parentElement; ancestor; ancestor = ancestor.parentElement) {
        guard(ancestor, true); if (ancestor === root) break;
      }
      trees = sentences.map(read);
      scene = JSON.stringify([...new Set(units.map(unit => unit.key))].sort());
      if (scene === this.oversizedScene) throw new Error('active-cache-budget');
    } catch (error) {
      stats.mode = 'baseline'; stats.reason = error instanceof Error ? error.message : 'unsupported-scene';
      stats.prepareMs = frameClock.realNow() - started;
      return { excluded: new Set<Element>(), layers: [] as CapturedLayer[], releaseKeys: this.resources.prune(new Set()), stats };
    }
    const releaseKeys = this.resources.prune(new Set(units.map(unit => unit.key)));
    stats.units = units.length; stats.mode = sentences.length ? 'cached' : 'empty';
    try { await this.resources.prepare(units, stats); }
    catch (failure) {
      releaseKeys.push(...this.resources.rollback());
      stats.mode = 'baseline';
      stats.reason = failure instanceof Error && failure.message === 'active-cache-budget' ? 'active-cache-budget' : 'text-rasterization-failed';
      if (stats.reason === 'active-cache-budget') this.oversizedScene = scene;
      stats.prepareMs = frameClock.realNow() - started;
      return { excluded: new Set<Element>(), layers: [] as CapturedLayer[], releaseKeys, stats };
    }
    this.oversizedScene = undefined;
    stats.reused = units.length - stats.rebuilt;
    const build = async (tree: Tree): Promise<CapturedLayer> => {
      if (tree.kind === 'group') {
        const settled = await Promise.allSettled(tree.children.map(build));
        const failure = settled.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        const children = settled.map(result => (result as PromiseFulfilledResult<CapturedLayer>).value);
        const visible = children.filter(child => child.width > 0 && child.height > 0);
        const x = Math.max(0, Math.floor(Math.min(width, ...visible.map(c => c.x))));
        const y = Math.max(0, Math.floor(Math.min(height, ...visible.map(c => c.y))));
        const right = Math.min(width, Math.ceil(Math.max(x, ...visible.map(c => c.x + c.width))));
        const bottom = Math.min(height, Math.ceil(Math.max(y, ...visible.map(c => c.y + c.height))));
        return { ...surface(x, y, Math.max(0, right - x), Math.max(0, bottom - y), tree.opacity), children };
      }
      const image = this.resources.image(tree.key);
      const sx = tree.layer.width / image.originalWidth, sy = tree.layer.height / image.originalHeight;
      const layer = { ...tree.layer,
        x: tree.layer.x + image.x * sx, y: tree.layer.y + image.y * sy,
        width: image.canvas.width * sx, height: image.canvas.height * sy,
      };
      return this.resources.layer(tree.key, layer, { kind: 'rgba' });
    };
    // All DOM reads precede any asynchronous loading. Settle every raster before
    // a fallback can clear the cache or the next frame can reuse its keys.
    const results = await Promise.allSettled(trees.map(build));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) {
      releaseKeys.push(...this.resources.rollback());
      stats.mode = 'baseline'; stats.reason = 'text-rasterization-failed';
      stats.prepareMs = frameClock.realNow() - started;
      return { excluded: new Set<Element>(), layers: [] as CapturedLayer[], releaseKeys, stats };
    }
    const layers = results.map(result => (result as PromiseFulfilledResult<CapturedLayer>).value);
    stats.cacheBytes = this.resources.bytes;
    this.resources.commit();
    stats.prepareMs = frameClock.realNow() - started;
    return { excluded: new Set<Element>(sentences), layers, releaseKeys, stats };
  }
  dispose() { this.resources.dispose(); }
}
