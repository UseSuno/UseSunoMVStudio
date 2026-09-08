import type { Line } from '../../../types';

/** Geometry, word reveals and timestamps must all invalidate the committed scene. */
export const dioramaLyricsSignature = (lines: readonly Line[]) => lines.length ? JSON.stringify(lines) : '';
