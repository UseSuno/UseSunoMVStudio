import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import type { Project } from '../domain/model';
import { foliaTheme } from './adapter';
import { fontStack } from '../fonts/fonts';
import { introEnd, introFrame, wrapIntroText } from './intro';
import { introDirection, introLineLeft } from './introDirection';

/** Last canvas layer: both screen recording and offline compositing include it. */
export function SongIntro({ project, time, coverUrl }: { project: Project; time: MotionValue<number>; coverUrl: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const theme = foliaTheme(project);
    const end = introEnd(project);
    const blockDirection = introDirection(project.title.trim() || project.artist);
    const family = fontStack(project).map(name => name === 'serif' || name === 'sans-serif' ? name : JSON.stringify(name)).join(',');
    let cover: HTMLImageElement | null = null;
    let disposed = false;
    function draw() {
      if (disposed || !canvas || !ctx) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const frame = introFrame(time.get() + project.offset, end);
      const phase = !frame.active ? 'off' : frame.compact === 1 ? 'credit' : 'title';
      if (canvas.dataset.phase !== phase) { canvas.dataset.phase = phase; canvas.setAttribute('aria-hidden', String(!frame.active)); }
      if (!frame.active || !width || !height) return;
      ctx.save();
      ctx.globalAlpha = frame.opacity * .38 * (1 - frame.compact * .75);
      ctx.fillStyle = theme.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = frame.opacity;
      const unit = Math.min(width, height);
      const c = frame.compact;
      const editorial = ['folia-partita', 'folia-cadenza', 'folia-sonnet', 'folia-still'].includes(project.template);
      const spatial = ['folia-diorama', 'folia-aurora', 'folia-curtain', 'folia-fume', 'folia-tilt'].includes(project.template);
      const maxWidth = width * (.82 - c * .16);
      let size = unit * (editorial ? .102 : .09) * (1 - c * .42);
      let titleLines: string[] = [], artistLines: string[] = [];
      let artistSize = size * .42;
      const setFont = (s: number, weight = project.fontWeight) => { ctx.font = `${weight} ${s}px ${family}`; };
      // Fit both metadata fields together, not just a single title line.
      for (let attempt = 0; attempt < 120; attempt++) {
        setFont(size); titleLines = wrapIntroText(project.title, maxWidth, text => ctx.measureText(text).width);
        artistSize = Math.max(size * .42, Math.min(unit * .028, size * .65));
        setFont(artistSize, 400); artistLines = wrapIntroText(project.artist, maxWidth, text => ctx.measureText(text).width);
        if (titleLines.length * size * 1.23 + artistLines.length * artistSize * 1.4 < height * (.39 - c * .19)) break;
        size *= .93;
      }
      const imageSize = cover ? unit * .18 * (1 - c) : 0;
      const imageGap = imageSize ? unit * .035 * (1 - c) : 0;
      const artistGap = artistLines.length && titleLines.length ? size * .38 : 0;
      const textHeight = titleLines.length * size * 1.23 + artistLines.length * artistSize * 1.4 + artistGap;
      const blockHeight = textHeight + imageSize + imageGap;
      const centeredY = (height - blockHeight) / 2;
      let y = centeredY * (1 - c) + (height - height * .09 - textHeight) * c;
      const x = width * .09;
      // Spatial templates retain a subtle drift, driven only by media time.
      if (spatial) ctx.translate(Math.sin(Math.min(time.get() + project.offset, 5) * .35) * unit * .008 * (1 - c), (1 - frame.entrance) * unit * .012);
      if (cover && imageSize > 1) {
        const crop = Math.min(cover.naturalWidth, cover.naturalHeight);
        ctx.globalAlpha = frame.opacity * (1 - c);
        ctx.drawImage(cover, (cover.naturalWidth - crop) / 2, (cover.naturalHeight - crop) / 2, crop, crop, introLineLeft(width, imageSize, x, editorial ? 1 : c, blockDirection), y, imageSize, imageSize);
        ctx.globalAlpha = frame.opacity;
      }
      y += imageSize + imageGap;
      ctx.textBaseline = 'top';
      // Interpolate alignment rather than snapping as the title becomes a credit.
      const leftAligned = editorial ? 1 : c;
      setFont(size);
      ctx.fillStyle = theme.primaryColor;
      titleLines.forEach((line, index) => {
        const textWidth = ctx.measureText(line).width;
        const lineX = introLineLeft(width, textWidth, x, leftAligned, blockDirection);
        const direction = introDirection(line);
        ctx.direction = direction;
        ctx.textAlign = direction === 'rtl' ? 'right' : 'left';
        // Keep RTL/mixed-direction runs intact so the Canvas bidi shaper controls their order.
        if (project.template === 'folia-classic' && direction === 'ltr') {
          let cursor = lineX;
          const groups = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(line), part => part.segment);
          groups.forEach((group, groupIndex) => {
            const reveal = Math.max(0, Math.min(1, frame.entrance * 2 - groupIndex * .055 - index * .12));
            ctx.globalAlpha = frame.opacity * (.6 + reveal * .4);
            ctx.fillText(group, cursor, y + (1 - reveal) * size * .1 * (1 - c));
            cursor += ctx.measureText(group).width;
          });
        } else { ctx.globalAlpha = frame.opacity; ctx.fillText(line, lineX + (direction === 'rtl' ? textWidth : 0), y); }
        y += size * 1.23;
      });
      y += artistGap;
      setFont(artistSize, 400); ctx.fillStyle = theme.accentColor; ctx.globalAlpha = frame.opacity * .88;
      artistLines.forEach(line => {
        const direction = introDirection(line), textWidth = ctx.measureText(line).width;
        ctx.direction = direction; ctx.textAlign = direction === 'rtl' ? 'right' : 'left';
        ctx.fillText(line, introLineLeft(width, textWidth, x, leftAligned, blockDirection) + (direction === 'rtl' ? textWidth : 0), y); y += artistSize * 1.4;
      });
      ctx.restore();
    }
    if (coverUrl) {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => { if (!disposed) { cover = image; draw(); } };
      image.src = coverUrl;
    }
    const off = time.on('change', draw);
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    document.fonts.addEventListener('loadingdone', draw);
    window.addEventListener('verse:before-capture', draw);
    draw();
    return () => { disposed = true; off(); observer.disconnect(); document.fonts.removeEventListener('loadingdone', draw); window.removeEventListener('verse:before-capture', draw); };
  }, [project, time, coverUrl]);
  return <canvas ref={canvasRef} aria-label={[project.title, project.artist].filter(Boolean).join(' — ')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }} />;
}
