/** Resolve the first strong letter; leading punctuation/numbers do not turn Arabic into LTR. */
export function introDirection(text: string): 'ltr' | 'rtl' {
  const first = Array.from(text).find(character => /\p{Letter}/u.test(character));
  return first && /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc\u{1ee00}-\u{1eeff}]/u.test(first) ? 'rtl' : 'ltr';
}

/** Return the left edge of an interpolated centered-to-logical-start metadata line. */
export function introLineLeft(width: number, textWidth: number, inset: number, startAlignment: number, direction: 'ltr' | 'rtl') {
  return (width - textWidth) / 2 * (1 - startAlignment)
    + (direction === 'rtl' ? width - inset - textWidth : inset) * startAlignment;
}
