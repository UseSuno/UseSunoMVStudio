import { describe, expect, it } from 'vitest';
import { resolveFrameFitScale } from '../src/vendor/folia/components/visualizer/diorama/frameFit';

describe('Diorama final text framing', () => {
    for (const aspect of [16 / 9, 9 / 16, 1]) {
        it(`keeps long lines and enlarged type inside the ${aspect} frame`, () => {
            const distance = 5, fov = 55;
            const safeWidth = 2 * distance * Math.tan(fov * Math.PI / 360) * aspect * .72;
            for (const width of [.5, 10, 1000]) for (const size of [.7, 1, 1.8]) {
                const requestedScale = 1.28 * size;
                const fit = resolveFrameFitScale(width * requestedScale, distance, fov, aspect);
                expect(width * requestedScale * fit).toBeLessThanOrEqual(safeWidth + 1e-10);
                expect(fit).toBeGreaterThan(0);
            }
        });
    }
    it('preserves the requested size of a short line', () => {
        expect(resolveFrameFitScale(.5, 5, 55, 1)).toBe(1);
    });
});
