import { expect, it } from 'vitest';
import { frameProgress } from '../src/export/progress';
it('measures processed frames rather than progress-update frequency and excludes background pauses', () => {
  const document = Object.assign(new EventTarget(), { hidden: false }); let now = 0;
  const meter = frameProgress(80, { document } as unknown as Window, () => now);
  now = 1000; expect(meter.sample(8)).toEqual({ fps: 8, remainingSeconds: 9 });
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); now += 60000;
  expect(meter.sample(8)).toEqual({ fps: 8, remainingSeconds: 9 });
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); now += 1000;
  expect(meter.sample(16)).toEqual({ fps: 8, remainingSeconds: 8 }); meter.dispose();
});
