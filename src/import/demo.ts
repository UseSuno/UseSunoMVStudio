import { demoSource, type Project } from '../domain/model';
import { parseLyrics } from './lyrics';
const previousDemoSource = `[00:02.00]风把远方写成了诗
[00:07.00]落在你经过的城市
[00:12.00]我们沿着光的方向
[00:17.00]把平凡的日子珍藏
[00:24.00]如果时间是一片海
[00:29.00]就让回声慢慢盛开
[00:34.00]所有未说出口的话
[00:39.00]都在这一刻抵达`;
export const isDemoSource = (source: string) => source === demoSource || source === previousDemoSource;
/** Upgrade only the untouched old lyric fixture; preserve every user lyric/timing edit. */
export function upgradeDemoLyrics(project: Project): Project {
  if (project.audioName || project.source !== previousDemoSource) return project;
  const original = parseLyrics(previousDemoSource, project.duration).lines;
  if (project.lines.length !== original.length || project.lines.some((line, index) => {
    const old = original[index];
    return line.text !== old.text || line.start !== old.start || line.end !== old.end || line.words.length > 0 || line.wordSegments !== undefined;
  })) return project;
  return { ...project, source: demoSource, lines: parseLyrics(demoSource, project.duration).lines };
}
