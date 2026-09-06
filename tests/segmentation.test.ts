import { describe, expect, it } from 'vitest';
import { parseSegmentationDraft, segmentationDraft } from '../src/import/segmentation';

describe('lyric phrase segmentation', () => {
  it('round trips exact lyric text', () => expect(parseSegmentationDraft('风把远方/写成了诗', '风把远方写成了诗')).toEqual(['风把远方', '写成了诗']));
  it('rejects changed lyrics', () => expect(() => parseSegmentationDraft('风把远方/写成诗', '风把远方写成了诗')).toThrow());
  it('keeps a valid saved split', () => expect(segmentationDraft('hello world', ['hello ', 'world'])).toBe('hello /world'));
});
