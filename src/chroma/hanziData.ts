import type { Line } from '../vendor/folia/types';
import { OFFLINE_HANZI_DATA, type HanziCharData } from './offlineHanzi';

export type { HanziCharData };

const memoryCache = new Map<string, HanziCharData>();
const pendingFetches = new Set<string>();

// Pre-fill memory cache with offline seed data
for (const [char, data] of Object.entries(OFFLINE_HANZI_DATA)) {
  memoryCache.set(char, data);
}

/**
 * Synchronously retrieves Hanzi stroke data if already cached or offline-available.
 */
export function getHanziData(char: string): HanziCharData | null {
  if (!char) return null;
  return memoryCache.get(char) || null;
}

/**
 * Asynchronously loads stroke data for a single character from HanziWriter CDN,
 * with memory and optional sessionStorage caching.
 */
export async function loadHanziData(char: string): Promise<HanziCharData | null> {
  if (!char || char.length !== 1) return null;
  if (memoryCache.has(char)) {
    return memoryCache.get(char)!;
  }

  // Check if character is a CJK Unified Ideograph (Chinese character range)
  const code = char.charCodeAt(0);
  const isCjk = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
  if (!isCjk) {
    return null;
  }

  // Try sessionStorage cache if available in browser
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(`hz_${char}`);
      if (stored) {
        const parsed = JSON.parse(stored) as HanziCharData;
        memoryCache.set(char, parsed);
        return parsed;
      }
    }
  } catch {
    // sessionStorage not available or quota exceeded
  }

  if (pendingFetches.has(char)) {
    return null;
  }
  pendingFetches.add(char);

  try {
    const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      pendingFetches.delete(char);
      return null;
    }
    const data = (await res.json()) as HanziCharData;
    if (data && Array.isArray(data.strokes) && Array.isArray(data.medians)) {
      memoryCache.set(char, data);
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(`hz_${char}`, JSON.stringify(data));
        }
      } catch {
        // quota ignore
      }
      pendingFetches.delete(char);
      return data;
    }
  } catch {
    // Network or parse error
  }

  pendingFetches.delete(char);
  return null;
}

/**
 * Scans all lines in the lyrics and pre-fetches all unique Chinese characters in the background.
 */
export function preloadLyricsHanzi(lines: Line[]): void {
  if (typeof window === 'undefined') return;

  const charsToFetch = new Set<string>();
  for (const line of lines) {
    const text = (line.fullText || '') + (line.wordSegments?.join('') || '');
    for (const c of text) {
      const code = c.charCodeAt(0);
      const isCjk = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
      if (isCjk && !memoryCache.has(c) && !pendingFetches.has(c)) {
        charsToFetch.add(c);
      }
    }
  }

  // Fetch with simple concurrency limit
  const charArray = Array.from(charsToFetch);
  let index = 0;
  const concurrency = 6;

  const next = () => {
    if (index >= charArray.length) return;
    const char = charArray[index++];
    loadHanziData(char).finally(() => {
      next();
    });
  };

  for (let i = 0; i < concurrency && i < charArray.length; i++) {
    next();
  }
}
