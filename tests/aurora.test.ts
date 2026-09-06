import { expect, it } from 'vitest';
import { glyphWaypoints } from '../src/aurora/glyphWaypoints';
import { estimatedLyricUnits, foliaLines } from '../src/folia/adapter';
// Verify language-aware spatial units preserve authored timing and Unicode boundaries.
it('maps timed CJK glyphs to Diorama waypoints without retiming them', () => {
  const result = glyphWaypoints([{id:'a',fullText:'你 好',startTime:1,endTime:4,words:[{text:'你',startTime:1,endTime:1.3},{text:' ',startTime:1.3,endTime:2},{text:'好',startTime:2,endTime:4}]}]);
  expect(result.map(g=>[g.fullText,g.startTime,g.endTime])).toEqual([['你',1,1.3],['好',2,4]]);
  expect(result.every(g=>g.words.length===1 && g.renderHints)).toBe(true);
});
it('keeps a composed emoji as a single waypoint', () => {
  expect(glyphWaypoints([{fullText:'👩‍🚀',startTime:0,endTime:2,words:[{text:'👩‍🚀',startTime:0,endTime:2}]}])).toHaveLength(1);
});

it('keeps English contractions and compounds together and attaches punctuation', () => {
  expect(estimatedLyricUnits("Don't stop, we're state-of-the-art — really?"))
    .toEqual(["Don't", 'stop,', "we're", 'state-of-the-art—', 'really?']);
});

it('uses complete English words as Aurora waypoints without spacing beats', () => {
  const project = { ...defaultProject([]), estimatedReveal: true, lines: [{ id: 'en', text: 'last train, first light', start: 1, end: 5, precision: 'estimated' as const, words: [] }] };
  const [line] = foliaLines(project);
  expect(line.words.map(word => word.text)).toEqual(['last', 'train,', 'first', 'light']);
  expect(line.words.map(word => word.endTime - word.startTime)).toEqual([1, 1, 1, 1]);
  const waypoints = glyphWaypoints([line]);
  expect(waypoints.map(waypoint => waypoint.fullText)).toEqual(['last', 'train,', 'first', 'light']);
  expect(waypoints[0].startTime).toBe(1);
  expect(waypoints.at(-1)?.endTime).toBe(5);
});

it('keeps mixed-script lyrics readable in the 3D path', () => {
  const [line] = foliaLines({ ...defaultProject([]), estimatedReveal: false, lines: [{ id: 'mixed', text: '穿过 midnight，别停', start: 0, end: 4, precision: 'estimated' as const, words: [] }] });
  expect(glyphWaypoints([line]).map(waypoint => waypoint.fullText)).toEqual(['穿', '过', 'midnight，', '别', '停']);
});

import { defaultProject } from '../src/domain/model';
import { validateProject } from '../src/persistence/project';
it('keeps the Studio traverse template while migrating its legacy background field', () => {
  const result = validateProject({...defaultProject([]), template:'folia-aurora', auroraBackground:'curtain'});
  expect(result.template).toBe('folia-aurora');
  expect(result.background).toBe('aurora-curtain');
  expect(result.auroraBackground).toBeUndefined();
  expect(validateProject({...defaultProject([]), template:'folia-aurora', background:undefined as never}).background).toBe('aurora-nebula');
});
