import { isCjkText, type ChromaGlyph, type ChromaPhrase } from './director';

export { isCjkText };

export interface LatinWord {
  text: string;
  startTime: number;
  endTime: number;
  glyphs: ChromaGlyph[];
  width: number;
}

export interface LatinVerseLine {
  words: LatinWord[];
  text: string;
  startTime: number;
  endTime: number;
  width: number;
}

export interface LatinStanzaLayout {
  lines: LatinVerseLine[];
  totalWidth: number;
  totalHeight: number;
  fontSize: number;
  lineHeight: number;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Groups raw character-level glyphs into cohesive whole-word tokens with accurate timings.
 */
export function groupGlyphsIntoWords(glyphs: ChromaGlyph[]): LatinWord[] {
  const words: LatinWord[] = [];
  let curGlyphs: ChromaGlyph[] = [];
  let curText = '';

  for (const g of glyphs) {
    if (/^\s+$/.test(g.char)) {
      if (curGlyphs.length > 0) {
        words.push({
          text: curText,
          startTime: curGlyphs[0].startTime,
          endTime: curGlyphs[curGlyphs.length - 1].endTime,
          glyphs: curGlyphs,
          width: 0,
        });
        curGlyphs = [];
        curText = '';
      }
    } else {
      curGlyphs.push(g);
      curText += g.char;
    }
  }

  if (curGlyphs.length > 0) {
    words.push({
      text: curText,
      startTime: curGlyphs[0].startTime,
      endTime: curGlyphs[curGlyphs.length - 1].endTime,
      glyphs: curGlyphs,
      width: 0,
    });
  }

  return words;
}

/**
 * Computes the classical Western poetic verse layout (Stanza) for an English/Western phrase.
 * Words are kept intact horizontally and arranged into balanced poetic lines (Couplets/Quatrains).
 */
export function computeLatinStanzaLayout(
  phrase: ChromaPhrase,
  availableH: number,
  targetColWidth: number,
  baseFontFamily: string,
  baseFontWeight: number | string,
  lyricsFontScale: number,
  ctx: CanvasRenderingContext2D
): LatinStanzaLayout {
  const words = groupGlyphsIntoWords(phrase.glyphs);
  if (!words.length) {
    return { lines: [], totalWidth: 0, totalHeight: 0, fontSize: 24, lineHeight: 36 };
  }

  // Classical manuscript proportion: target 3-4 words per poetic line
  const wordCount = words.length;
  const numLines = wordCount <= 3 ? 1 : wordCount <= 7 ? 2 : wordCount <= 12 ? 3 : 4;
  const targetWordsPerLine = Math.ceil(wordCount / numLines);

  // Group words into lines
  const rawLines: LatinVerseLine[] = [];
  let curWords: LatinWord[] = [];

  for (let i = 0; i < words.length; i++) {
    curWords.push(words[i]);
    const wordsLeft = words.length - (i + 1);
    const linesLeft = numLines - (rawLines.length + 1);

    if (curWords.length >= targetWordsPerLine && wordsLeft >= linesLeft) {
      if (rawLines.length < numLines - 1) {
        rawLines.push({
          words: curWords,
          text: curWords.map(w => w.text).join(' '),
          startTime: curWords[0].startTime,
          endTime: curWords[curWords.length - 1].endTime,
          width: 0,
        });
        curWords = [];
      }
    }
  }

  if (curWords.length > 0) {
    rawLines.push({
      words: curWords,
      text: curWords.map(w => w.text).join(' '),
      startTime: curWords[0].startTime,
      endTime: curWords[curWords.length - 1].endTime,
      width: 0,
    });
  }

  // Calculate font size that comfortably fits available vertical height and column width
  const maxLineChars = Math.max(...rawLines.map(l => l.text.length));
  const candidateSize = Math.max(
    18,
    Math.min(
      (availableH * 0.75) / (rawLines.length * 1.65),
      (targetColWidth * 0.88) / Math.max(12, maxLineChars * 0.58)
    ) * phrase.fontScale * lyricsFontScale
  );

  const fontSize = Math.round(candidateSize);
  const lineHeight = Math.round(fontSize * 1.62);

  // Measure word and line dimensions with the chosen font
  ctx.save();
  ctx.font = `${baseFontWeight} ${fontSize}px ${baseFontFamily}`;

  const spaceWidth = ctx.measureText(' ').width;
  let maxLineWidth = 0;

  rawLines.forEach((line, lineIdx) => {
    let lineWidth = 0;
    line.words.forEach((w, wIdx) => {
      if (lineIdx === 0 && wIdx === 0 && w.text.length > 0) {
        ctx.font = `700 ${Math.round(fontSize * 1.55)}px ${baseFontFamily}`;
        const firstLetterW = ctx.measureText(w.text.charAt(0)).width;
        ctx.font = `${baseFontWeight} ${fontSize}px ${baseFontFamily}`;
        const restW = ctx.measureText(w.text.slice(1)).width;
        w.width = firstLetterW + restW;
      } else {
        w.width = ctx.measureText(w.text).width;
      }
      lineWidth += w.width + (wIdx < line.words.length - 1 ? spaceWidth : 0);
    });
    line.width = lineWidth;
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
  });

  ctx.restore();

  const totalHeight = rawLines.length * lineHeight;

  return {
    lines: rawLines,
    totalWidth: Math.max(maxLineWidth + 40, targetColWidth),
    totalHeight,
    fontSize,
    lineHeight,
  };
}

/**
 * Renders an English / Western poetic stanza in authentic classical manuscript style:
 * 1. Pricking & ruling leadpoint boundary lines framing the folio column
 * 2. Rubricated / Illuminated initial majuscule (朱砂手绘首字母大写)
 * 3. Horizontal word-by-word quill pen writing animation (羽毛笔平尖水平行笔)
 * 4. Archival oak gall / carbon mineral ink with paper deboss highlight
 */
export function renderLatinStanza(
  ctx: CanvasRenderingContext2D,
  _phrase: ChromaPhrase,
  layout: LatinStanzaLayout,
  colX: number,
  startY: number,
  time: number,
  palette: {
    letterpressInk: string;
    paperHighlight: string;
    columnRule: string;
    sealCinnabar: string;
    goldGlow: string;
    goldLeaf: string;
  },
  baseFontFamily: string,
  baseFontWeight: number | string,
  colAlpha: number,
  scrollTop: number,
  scrollBottom: number
) {
  if (colAlpha <= 0.01 || !layout.lines.length) return;

  const { lines, fontSize, lineHeight, totalWidth } = layout;
  const halfW = totalWidth / 2;

  // -------------------------------------------------------------
  // 1. Classical Western Pricking & Ruling Lines (手抄本铅线与红墨边线)
  // -------------------------------------------------------------
  ctx.save();
  ctx.strokeStyle = palette.columnRule;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.45 * colAlpha;

  // Left & Right ruling lines framing this stanza column
  ctx.beginPath();
  ctx.moveTo(colX - halfW, scrollTop);
  ctx.lineTo(colX - halfW, scrollBottom);
  ctx.moveTo(colX + halfW, scrollTop);
  ctx.lineTo(colX + halfW, scrollBottom);
  ctx.stroke();

  // Classical fleuron ornaments at column top/bottom
  ctx.fillStyle = palette.columnRule;
  ctx.font = `400 ${Math.max(9, fontSize * 0.42)}px ${baseFontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('❦', colX, scrollTop + 10);
  ctx.fillText('❦', colX, scrollBottom - 10);
  ctx.restore();

  // Font stacks for classical Western manuscript typography
  const textFont = `${baseFontWeight} ${fontSize}px ${baseFontFamily}`;
  const initialFont = `700 ${Math.round(fontSize * 1.55)}px ${baseFontFamily}`;

  // -------------------------------------------------------------
  // 2. Render Lines & Words
  // -------------------------------------------------------------
  const spaceWidth = fontSize * 0.32;

  lines.forEach((line, lineIdx) => {
    const lineCenterY = startY + lineIdx * lineHeight;
    let wordCursorX = colX - line.width / 2;

    line.words.forEach((w, wIdx) => {
      const isStanzaInitial = lineIdx === 0 && wIdx === 0;
      const isWordSinging = time >= w.startTime && time < w.endTime;
      const hasWordSung = time >= w.endTime;
      const isWordUpcoming = !hasWordSung && !isWordSinging;

      const wordW = w.width;

      if (isWordUpcoming) {
        // -------------------------------------------------------------
        // UPCOMING: Clear, elegant silverpoint / leadpoint underdrawing (银尖笔底稿)
        // Entire stanza is clearly readable in advance as an archival manuscript sketch!
        // -------------------------------------------------------------
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (isStanzaInitial) {
          const firstLetter = w.text.charAt(0);
          const restOfWord = w.text.slice(1);

          ctx.font = initialFont;
          ctx.fillStyle = palette.sealCinnabar;
          ctx.globalAlpha = 0.28 * colAlpha;
          ctx.fillText(firstLetter, wordCursorX, lineCenterY - fontSize * 0.08);

          const initialW = ctx.measureText(firstLetter).width;
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.globalAlpha = 0.22 * colAlpha;
          ctx.fillText(restOfWord, wordCursorX + initialW, lineCenterY);
        } else {
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.globalAlpha = 0.22 * colAlpha;
          ctx.fillText(w.text, wordCursorX, lineCenterY);
        }
        ctx.restore();
      } else if (hasWordSung) {
        // -------------------------------------------------------------
        // SETTLED: Permanent deep oak gall / mineral carbon ink in parchment
        // -------------------------------------------------------------
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // 1. Paper deboss highlight rim
        ctx.fillStyle = palette.paperHighlight;
        ctx.globalAlpha = 0.16 * colAlpha;
        ctx.font = textFont;
        ctx.fillText(w.text, wordCursorX + 0.8, lineCenterY + 1.2);

        // 2. Permanent archival ink
        if (isStanzaInitial) {
          // Rubricated initial letter in Cinnabar / Vermilion (朱砂首字母大写)
          const firstLetter = w.text.charAt(0);
          const restOfWord = w.text.slice(1);

          ctx.font = initialFont;
          ctx.fillStyle = palette.sealCinnabar;
          ctx.globalAlpha = 0.95 * colAlpha;
          ctx.fillText(firstLetter, wordCursorX, lineCenterY - fontSize * 0.08);

          const initialW = ctx.measureText(firstLetter).width;
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.globalAlpha = 0.92 * colAlpha;
          ctx.fillText(restOfWord, wordCursorX + initialW, lineCenterY);
        } else {
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.globalAlpha = 0.92 * colAlpha;
          ctx.fillText(w.text, wordCursorX, lineCenterY);
        }
        ctx.restore();
      } else if (isWordSinging) {
        // -------------------------------------------------------------
        // LIVE QUILL PEN WRITING ANIMATION (鹅毛笔沾水笔横向行笔)
        // Words reveal smoothly from left to right along the baseline!
        // -------------------------------------------------------------
        const duration = Math.max(0.06, w.endTime - w.startTime);
        const progress = clamp01((time - w.startTime) / duration);

        const currentRevealW = wordW * progress;
        const tipX = wordCursorX + currentRevealW;
        const tipY = lineCenterY;

        ctx.save();

        // Reveal clipping mask along the word's horizontal path
        ctx.save();
        ctx.beginPath();
        ctx.rect(wordCursorX - 4, lineCenterY - fontSize * 1.1, currentRevealW + 6, fontSize * 2.0);
        ctx.clip();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (isStanzaInitial) {
          const firstLetter = w.text.charAt(0);
          const restOfWord = w.text.slice(1);

          ctx.font = initialFont;
          ctx.fillStyle = palette.sealCinnabar;
          ctx.globalAlpha = 1.0 * colAlpha;
          ctx.fillText(firstLetter, wordCursorX, lineCenterY - fontSize * 0.08);

          const initialW = ctx.measureText(firstLetter).width;
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.fillText(restOfWord, wordCursorX + initialW, lineCenterY);
        } else {
          ctx.font = textFont;
          ctx.fillStyle = palette.letterpressInk;
          ctx.globalAlpha = 1.0 * colAlpha;
          ctx.fillText(w.text, wordCursorX, lineCenterY);
        }

        // Wet ink specular sheen on newly drawn letters
        if (progress < 0.96) {
          ctx.strokeStyle = palette.goldGlow;
          ctx.lineWidth = Math.max(0.8, fontSize * 0.035);
          ctx.globalAlpha = 0.45 * colAlpha * Math.sin(progress * Math.PI);
          if (isStanzaInitial) {
            const firstLetter = w.text.charAt(0);
            const restOfWord = w.text.slice(1);
            ctx.font = initialFont;
            ctx.strokeText(firstLetter, wordCursorX, lineCenterY - fontSize * 0.08);
            const initialW = ctx.measureText(firstLetter).width;
            ctx.font = textFont;
            ctx.strokeText(restOfWord, wordCursorX + initialW, lineCenterY);
          } else {
            ctx.strokeText(w.text, wordCursorX, lineCenterY);
          }
        }
        ctx.restore(); // end clip

        // -------------------------------------------------------------
        // WESTERN CALLIGRAPHY QUILL / NIB CURSOR (欧式平尖羽毛笔锋)
        // Follows the active baseline tip from left to right
        // -------------------------------------------------------------
        renderQuillNib(ctx, tipX, tipY, fontSize, palette.letterpressInk, colAlpha);

        ctx.restore();
      }

      wordCursorX += wordW + spaceWidth;
    });
  });
}

/**
 * Renders an authentic Western calligraphy quill nib / dipping pen (平尖鹅毛笔头).
 * Glides horizontally across the parchment baseline, leaving wet ink.
 */
export function renderQuillNib(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  fontSize: number,
  inkColor: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(tipX, tipY);

  // 1. Wet ink droplet touching parchment
  const dropRadius = Math.max(2.2, fontSize * 0.08);
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = 0.96 * alpha;
  ctx.beginPath();
  ctx.arc(0, 0, dropRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Wet ink diffusion halo into parchment fibers
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = 0.22 * alpha;
  ctx.beginPath();
  ctx.arc(0, 0, dropRadius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // 3. Slanted Calligraphy Nib (45° angle broad nib dipping pen / quill)
  ctx.rotate(-Math.PI * 0.28); // 50 degrees upwards-right

  const nibLength = fontSize * 0.36;
  const nibWidth = fontSize * 0.11;

  ctx.fillStyle = '#221A16';
  ctx.globalAlpha = 0.98 * alpha;
  ctx.beginPath();
  ctx.moveTo(0, 0); // contact tip
  ctx.lineTo(nibWidth * 0.5, -nibLength * 0.3);
  ctx.lineTo(nibWidth * 0.7, -nibLength);
  ctx.lineTo(-nibWidth * 0.7, -nibLength);
  ctx.lineTo(-nibWidth * 0.5, -nibLength * 0.3);
  ctx.closePath();
  ctx.fill();

  // 4. Metallic nib catch-light and ink slit line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -nibLength * 0.75);
  ctx.stroke();

  // Nib breather hole (笔尖气孔)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(0, -nibLength * 0.75, 1.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
