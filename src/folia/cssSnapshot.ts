/** Snapshot the original stylesheet and live animation values instead of expanding every
 * computed CSS property on every frame. Assets are embedded once per export session. */
export class CssSnapshot {
  private assets = new Map<string, Promise<string>>();
  private styles?: Promise<string>;
  private frames = new Map<string, { markup: string; image: Promise<HTMLCanvasElement>; refs: number; cached: boolean }>();
  private envelope?: { size: string; prefix: string; suffix: string };
  constructor(private root: HTMLElement) {}

  private asset(url: string, base = this.root.ownerDocument.baseURI) {
    if (/^(data:|#)/i.test(url)) return Promise.resolve(url);
    const absolute = new URL(url, base).href;
    let pending = this.assets.get(absolute);
    if (!pending) {
      pending = fetch(absolute).then(async response => {
        if (!response.ok) throw new Error(`Unable to embed export asset (${response.status}).`);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
        });
      });
      this.assets.set(absolute, pending);
    }
    return pending;
  }
  private async urls(css: string, base?: string) {
    const matches = [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)];
    const values = await Promise.all(matches.map(match => this.asset((match[1] ?? match[2] ?? match[3]).trim(), base)));
    let i = 0;
    return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g, () => `url("${values[i++]}")`);
  }
  private async stylesheet() {
    const document = this.root.ownerDocument;
    const families = new Set<string>();
    for (const element of [this.root, ...this.root.querySelectorAll('*')]) {
      for (const family of getComputedStyle(element).fontFamily.split(',')) families.add(family.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
    }
    const rules: Promise<string>[] = [];
    for (const sheet of document.styleSheets) {
      // An unreadable stylesheet must use the established capture path, never disappear.
      for (const rule of sheet.cssRules) {
        if (rule.type === 3) throw new Error('Imported stylesheets require standard capture.');
        if (rule.type === 5) {
          const font = rule as CSSFontFaceRule;
          if (!families.has(font.style.fontFamily.replace(/^['"]|['"]$/g, '').toLowerCase())) continue;
        }
        rules.push(this.urls(rule.cssText, sheet.href ?? undefined));
      }
    }
    return (await Promise.all(rules)).join('\n');
  }
  async prepare(width: number, height: number, include: (element: Element) => boolean, layer = 'foreground') {
    this.styles ??= this.stylesheet();
    const css = await this.styles;
    const map = new Map<Element, Element>();
    const tasks: Promise<unknown>[] = [];
    const copy = (node: Node): Node | null => {
      if (node instanceof Element && (!include(node) || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName))) return null;
      const cloned = node.cloneNode(false);
      if (node instanceof Element) {
        map.set(node, cloned as Element);
        if (node.shadowRoot) throw new Error('Unadapted shadow DOM in export foreground.');
        if (node instanceof HTMLElement || node instanceof SVGElement) {
          const computed = getComputedStyle(node), style = (cloned as HTMLElement).style;
          // Framer and Web Animations may override inline values, including finished fills.
          style.cssText += ';' + ['transform', 'opacity', 'filter', 'line-height', 'font-family', 'font-size', 'font-weight'].map(key => `${key}:${computed.getPropertyValue(key)}`).join(';');
          if (style.cssText.includes('url(')) tasks.push(this.urls(style.cssText).then(value => { style.cssText = value; }));
        }
        if (node instanceof HTMLImageElement) {
          const source = node.currentSrc || node.src;
          if (source) tasks.push(this.asset(source).then(value => { const image = cloned as HTMLImageElement; image.removeAttribute('srcset'); image.src = value; }));
        } else if (node instanceof SVGImageElement && node.href.baseVal) {
          tasks.push(this.asset(node.href.baseVal).then(value => (cloned as SVGImageElement).setAttribute('href', value)));
        }
      }
      for (const child of node.childNodes) { const next = copy(child); if (next) cloned.appendChild(next); }
      return cloned;
    };
    const cloned = copy(this.root) as HTMLElement;
    await Promise.all(tasks);
    cloned.style.background = 'transparent';
    for (const animation of this.root.ownerDocument.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) continue;
      const target = map.get(effect.target) as HTMLElement | undefined;
      if (!target) continue;
      if (effect.pseudoElement) throw new Error('Animated pseudo-element requires standard capture.');
      const computed = getComputedStyle(effect.target);
      for (const key of new Set(effect.getKeyframes().flatMap(frame => Object.keys(frame)))) {
        if (['offset', 'computedOffset', 'easing', 'composite'].includes(key)) continue;
        const property = key.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`);
        target.style.setProperty(property, computed.getPropertyValue(property));
      }
    }
    const size = `${width}:${height}`;
    const serializer = new XMLSerializer();
    if (this.envelope?.size !== size) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
      const foreign = document.createElementNS(svg.namespaceURI, 'foreignObject');
      foreign.setAttribute('width', '100%'); foreign.setAttribute('height', '100%');
      const host = document.createElement('div'); host.style.width = `${width}px`; host.style.height = `${height}px`;
      const style = document.createElement('style'); style.textContent = `${css}\n*{animation:none!important;transition:none!important}`;
      host.append(style, document.createComment('capture-root')); foreign.append(host); svg.append(foreign);
      const [prefix, suffix] = serializer.serializeToString(svg).split('<!--capture-root-->');
      this.envelope = { size, prefix: encodeURIComponent(prefix), suffix: encodeURIComponent(suffix) };
      for (const frame of this.frames.values()) { frame.cached = false; this.retire(frame); }
      this.frames.clear();
    }
    const markup = serializer.serializeToString(cloned);
    let cached = this.frames.get(layer);
    if (cached?.markup !== markup) {
      if (cached) { cached.cached = false; this.retire(cached); }
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${this.envelope.prefix}${encodeURIComponent(markup)}${this.envelope.suffix}`;
      const rendered = image.decode().then(() => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(image, 0, 0); return canvas;
      });
      void rendered.catch(() => undefined);
      cached = { markup, image: rendered, refs: 0, cached: true }; this.frames.set(layer, cached);
    }
    cached.refs++;
    const frame = cached; let released = false;
    return { image: frame.image, release: () => { if (!released) { released = true; frame.refs--; this.retire(frame); } } };
  }
  private retire(frame: { image: Promise<HTMLCanvasElement>; refs: number; cached: boolean }) {
    if (!frame.cached && !frame.refs) void frame.image.then(canvas => { canvas.width = 0; }, () => undefined);
  }
  dispose() { this.assets.clear(); for (const frame of this.frames.values()) { frame.cached = false; this.retire(frame); } this.frames.clear(); }
}
