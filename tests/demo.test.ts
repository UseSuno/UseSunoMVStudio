import { expect, it } from 'vitest';
import { defaultProject, demoSource } from '../src/domain/model';
import { isDemoSource, upgradeDemoLyrics } from '../src/import/demo';
import { parseLyrics } from '../src/import/lyrics';
const old = `[00:02.00]风把远方写成了诗
[00:07.00]落在你经过的城市
[00:12.00]我们沿着光的方向
[00:17.00]把平凡的日子珍藏
[00:24.00]如果时间是一片海
[00:29.00]就让回声慢慢盛开
[00:34.00]所有未说出口的话
[00:39.00]都在这一刻抵达`;
it('upgrades only untouched demo lyrics and keeps project settings', () => {
  const p = { ...defaultProject(parseLyrics(old,46).lines), source: old };
  const updated = upgradeDemoLyrics(p);
  expect(updated.source).toBe(demoSource); expect(updated.seed).toBe(p.seed);
  expect(updated.lines.map(l=>l.text).join('\n')).toMatch(/風に/);
  expect(isDemoSource(old)).toBe(true); expect(isDemoSource(demoSource)).toBe(true);
  const edited = { ...p, lines: p.lines.map((l,i)=>i ? l : {...l,text:'My edited lyric'}) };
  expect(upgradeDemoLyrics(edited)).toBe(edited);
  const timed = { ...p, lines: p.lines.map((l,i)=>i ? l : {...l,start:3}) };
  expect(upgradeDemoLyrics(timed)).toBe(timed);
  const imported = {...p,audioName:'my-song.wav'};expect(upgradeDemoLyrics(imported)).toBe(imported);
});
it('provides all seven requested languages within the original demo duration', () => {
 const lines = parseLyrics(demoSource,46).lines;
 expect(lines).toHaveLength(8);
 for(const text of ['风把','We follow','風に','별빛','Kita','Wir','La música'])expect(demoSource).toContain(text);
 expect(lines.every(l=>l.start!==null&&l.end!==null&&l.end<=46)).toBe(true);
});
