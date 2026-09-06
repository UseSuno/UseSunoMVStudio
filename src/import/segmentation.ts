export function defaultWordSegments(text: string): string[] {
  if (!text) return [];
  const Segmenter = typeof Intl !== 'undefined' ? Intl.Segmenter : undefined;
  if (!Segmenter) return Array.from(text);
  try { return Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text), part => part.segment); }
  catch { return Array.from(text); }
}

export function segmentationDraft(text: string, saved?: string[]): string {
  const segments = saved?.join('') === text ? saved : defaultWordSegments(text);
  return segments.join('/');
}

export function parseSegmentationDraft(source: string, original: string): string[] {
  const segments = source.split('/').filter(Boolean);
  if (!segments.length || segments.join('') !== original) throw new Error('分段后的文字必须与原歌词完全一致，只能添加或删除 /。');
  return segments;
}
