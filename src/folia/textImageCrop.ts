export interface CroppedTextImage {
  canvas: HTMLCanvasElement;
  touchesSurfaceBoundary: boolean;
  x: number;
  y: number;
  originalWidth: number;
  originalHeight: number;
}

/** Keep every nonzero-alpha pixel and a transparent filtering border. Never
 * rescale the glyph or apply an alpha threshold when finding its bounds. */
export function cropTextImage(canvas: HTMLCanvasElement): CroppedTextImage {
  const originalWidth = canvas.width, originalHeight = canvas.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Text image context unavailable.');
  const pixels = context.getImageData(0, 0, originalWidth, originalHeight).data;
  let left = originalWidth, top = originalHeight, right = -1, bottom = -1;
  for (let y = 0; y < originalHeight; y++) for (let x = 0; x < originalWidth; x++) {
    if (pixels[(y * originalWidth + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const touchesSurfaceBoundary = left === 0 || top === 0 || right === originalWidth - 1 || bottom === originalHeight - 1;
  // Two transparent pixels retain the interpolation boundary when compositing.
  left = Math.max(0, left - 2); top = Math.max(0, top - 2);
  right = Math.min(originalWidth - 1, right + 2); bottom = Math.min(originalHeight - 1, bottom + 2);
  if (right < left || bottom < top) {
    canvas.width = canvas.height = 1;
    return { canvas, x: 0, y: 0, originalWidth, originalHeight, touchesSurfaceBoundary };
  }
  if (left === 0 && top === 0 && right === originalWidth - 1 && bottom === originalHeight - 1) {
    return { canvas, x: 0, y: 0, originalWidth, originalHeight, touchesSurfaceBoundary };
  }
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1; cropped.height = bottom - top + 1;
  const output = cropped.getContext('2d');
  if (!output) { cropped.width = 0; throw new Error('Text crop context unavailable.'); }
  // Integer source/destination coordinates, with no resampling.
  output.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  canvas.width = 0;
  return { canvas: cropped, x: left, y: top, originalWidth, originalHeight, touchesSurfaceBoundary };
}
