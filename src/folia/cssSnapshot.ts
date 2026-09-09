import { frameClock } from './exportClock';
/** Snapshot the original stylesheet and live animation values instead of expanding every
 * computed CSS property on every frame. Assets are embedded once per export session. */
export class CssSnapshot {
  private assets = new Map<string, Promise<string>>();
  private styles?: Promise<string>;
  private fontCss = '';
  private frames = new Map<string, { markup: string; revision: number; image: Promise<HTMLCanvasElement>; refs: number; cached: boolean; retired?: boolean }>();
  private revision = 0;
  private envelope?: { size: string; prefix: string; suffix: string };
  private surfaces: HTMLCanvasElement[] = [];
  private disposed = false;
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
    const fonts: Promise<string>[] = [];
    for (const sheet of document.styleSheets) {
      // An unreadable stylesheet must use the established capture path, never disappear.
      for (const rule of sheet.cssRules) {
        if (rule.type === 3) throw new Error('Imported stylesheets require standard capture.');
        if (rule.type === 5) {
          const font = rule as CSSFontFaceRule;
          if (!families.has(font.style.fontFamily.replace(/^['"]|['"]$/g, '').toLowerCase())) continue;
        }
        const embedded = this.urls(rule.cssText, sheet.href ?? undefined);
        rules.push(embedded);
        if (rule.type === 5) fonts.push(embedded);
      }
    }
    const css = (await Promise.all(rules)).join('\n');
    this.fontCss = (await Promise.all(fonts)).join('\n');
    return css;
  }
  /** Rasterize an existing independent text unit, never a cropped stage screenshot. */
  async rasterizeTextUnit(text: string, cssText: string, width: number, height: number, padding: number, scale: number, language: string, contents?: HTMLElement) {
    this.styles ??= this.stylesheet(); await this.styles;
    const logicalWidth = width + padding * 2, logicalHeight = height + padding * 2;
    const pixelWidth = Math.ceil(logicalWidth * scale), pixelHeight = Math.ceil(logicalHeight * scale);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(pixelWidth)); svg.setAttribute('height', String(pixelHeight));
    svg.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const foreign = document.createElementNS(svg.namespaceURI, 'foreignObject');
    foreign.setAttribute('width', String(logicalWidth)); foreign.setAttribute('height', String(logicalHeight));
    const host = document.createElement('div'); host.lang = language;
    host.style.cssText = `position:relative;width:${logicalWidth}px;height:${logicalHeight}px;overflow:visible`;
    const style = document.createElement('style'); style.textContent = this.fontCss;
    const unit = document.createElement('span');
    if (contents) unit.append(contents.cloneNode(true)); else unit.textContent = text;
    unit.style.cssText = `${cssText};position:absolute;display:inline-block;margin:0;padding:0;border:0;box-sizing:content-box;left:${padding}px;top:${padding}px;width:${width}px;height:${height}px;transform:none;opacity:1;animation:none;transition:none;overflow:visible`;
    host.append(style, unit); foreign.append(host); svg.append(foreign);
    return this.rasterize(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`, pixelWidth, pixelHeight);
  }
  async prepare(width: number, height: number, include: (element: Element) => boolean, layer = 'foreground') {
    const started = frameClock.realNow();
    const timing: Record<string, number> = { domPrepareMs: 0, svgLoadMs: 0, rasterDrawMs: 0, snapshotRebuilt: 0, snapshotReused: 0 };
    this.styles ??= this.stylesheet();
    const css = await this.styles;
    const map = new Map<Element, Element>();
    const computedStyles = new Map<Element, CSSStyleDeclaration>();
    const computedFor = (node: Element) => {
      let style = computedStyles.get(node);
      if (!style) { style = getComputedStyle(node); computedStyles.set(node, style); }
      return style;
    };
    const tasks: Promise<unknown>[] = [];
    const copy = (node: Node): Node | null => {
      if (node instanceof Element && (!include(node) || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName))) return null;
      const cloned = node.cloneNode(false);
      if (node instanceof Element) {
        map.set(node, cloned as Element);
        if (node.shadowRoot) throw new Error('Unadapted shadow DOM in export foreground.');
        if (node instanceof HTMLElement || node instanceof SVGElement) {
          const computed = computedFor(node), style = (cloned as HTMLElement).style;
          // Framer and Web Animations may override inline values, including finished fills.
          style.cssText += ';' + ['transform', 'opacity', 'filter', 'line-height', 'font-family', 'font-size', 'font-weight'].map(key => `${key}:${computed.getPropertyValue(key)}`).join(';');
          if (style.cssText.includes('url(')) {
            // Embed URL-bearing properties individually so completion cannot
            // overwrite frozen animated properties on the same clone.
            for (const property of Array.from(style)) {
              const value = style.getPropertyValue(property), priority = style.getPropertyPriority(property);
              if (value.includes('url(')) tasks.push(this.urls(value).then(embedded => { style.setProperty(property, embedded, priority); }));
            }
          }
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
    const cloneStarted = frameClock.realNow();
    const cloned = copy(this.root) as HTMLElement;
    timing.domCloneSyncMs = frameClock.realNow() - cloneStarted;
    const animationStarted = frameClock.realNow();
    cloned.style.background = 'transparent';
    for (const animation of this.root.ownerDocument.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) continue;
      const target = map.get(effect.target) as HTMLElement | undefined;
      if (!target) continue;
      if (effect.pseudoElement) throw new Error('Animated pseudo-element requires standard capture.');
      const computed = computedFor(effect.target);
      for (const key of new Set(effect.getKeyframes().flatMap(frame => Object.keys(frame)))) {
        if (['offset', 'computedOffset', 'easing', 'composite'].includes(key)) continue;
        const property = key.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`);
        target.style.setProperty(property, computed.getPropertyValue(property));
      }
    }
    timing.animationStylesSyncMs = frameClock.realNow() - animationStarted;
    // Freeze all live animation/style reads before awaiting asset embedding.
    const assetStarted = frameClock.realNow();
    await Promise.all(tasks);
    timing.assetReadyWaitMs = frameClock.realNow() - assetStarted;
    const serializationStarted = frameClock.realNow();
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
    timing.serializationSyncMs = frameClock.realNow() - serializationStarted;
    timing.serializedCharacters = markup.length;
    let cached = this.frames.get(layer);
    if (cached?.markup !== markup) {
      timing.snapshotRebuilt = 1;
      if (cached) { cached.cached = false; this.retire(cached); }
      const rendered = this.rasterize(`data:image/svg+xml;charset=utf-8,${this.envelope.prefix}${encodeURIComponent(markup)}${this.envelope.suffix}`, width, height, timing);
      void rendered.catch(() => undefined);
      cached = { markup, revision: ++this.revision, image: rendered, refs: 0, cached: true }; this.frames.set(layer, cached);
    }
    if (!timing.snapshotRebuilt) timing.snapshotReused = 1;
    timing.domPrepareMs = frameClock.realNow() - started;
    cached.refs++;
    const frame = cached; let released = false;
    return { timing, image: frame.image, revision: frame.revision, release: () => { if (!released) { released = true; frame.refs--; this.retire(frame); } } };
  }
  private rasterize(url: string, width: number, height: number, timing?: Record<string, number>) {
    const started = frameClock.realNow();
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const image = new Image();
      // Draw once the self-contained SVG has loaded. drawImage performs the
      // rasterization; decode() adds a separate presentation-oriented wait.
      image.onload = () => {
        const drawStarted = frameClock.realNow();
        if (timing) timing.svgLoadMs = drawStarted - started;
        image.onload = image.onerror = null;
        const canvas = this.surfaces.pop() ?? document.createElement('canvas');
        try {
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Unable to rasterize export layer.');
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0);
          if (timing) timing.rasterDrawMs = frameClock.realNow() - drawStarted;
          resolve(canvas);
        } catch (error) { canvas.width = 0; reject(error); }
      };
      image.onerror = () => { image.onload = image.onerror = null; reject(new Error('Unable to load export layer.')); };
      image.src = url;
    });
  }
  private retire(frame: { image: Promise<HTMLCanvasElement>; refs: number; cached: boolean; retired?: boolean }) {
    if (frame.cached || frame.refs || frame.retired) return;
    frame.retired = true;
    void frame.image.then(canvas => {
      // Retire only after every pending bitmap has taken its own pixel snapshot.
      if (!this.disposed && this.surfaces.length < 3) this.surfaces.push(canvas);
      else canvas.width = 0;
    }, () => undefined);
  }
  dispose() {
    this.disposed = true; this.assets.clear();
    for (const frame of this.frames.values()) { frame.cached = false; this.retire(frame); }
    this.frames.clear();
    for (const canvas of this.surfaces) canvas.width = 0;
    this.surfaces.length = 0;
  }
}
