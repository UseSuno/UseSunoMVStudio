import { expect, it } from 'vitest';
import { isValidExportRange } from '../src/export/range';
import { defaultProject } from '../src/domain/model';
import { validateProject } from '../src/persistence/project';

it('accepts whole songs beyond the former export, import and project duration caps', () => {
  for (const duration of [601, 3601, 7200]) {
    expect(isValidExportRange(0, duration, duration)).toBe(true);
    expect(validateProject({ ...defaultProject([]), duration }).duration).toBe(duration);
  }
});
it('rejects invalid ranges and non-finite project durations', () => {
  for (const [start, end, duration] of [[-1, 2, 3], [2, 1, 3], [1, 1, 3], [0, 4, 3], [0, Infinity, Infinity], [NaN, 3, 3]]) {
    expect(isValidExportRange(start, end, duration)).toBe(false);
  }
  for (const duration of [0, -1, NaN, Infinity]) expect(() => validateProject({ ...defaultProject([]), duration })).toThrow();
});
