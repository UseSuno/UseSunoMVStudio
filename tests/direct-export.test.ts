import { describe, expect, it } from 'vitest';
import { canExportDirect } from '../src/export/capabilities';
import { visualizerEntries } from '../src/folia/registry';

describe('direct export scope', () => {
  it('keeps unadapted templates and backgrounds out of the direct renderer', () => {
    for (const { id: template } of visualizerEntries) {
      for (const background of ['latent', 'common', 'aurora-nebula', 'aurora-curtain'] as const) {
        expect(canExportDirect({ template, background })).toBe(template === 'folia-fume' && background === 'latent');
      }
    }
  });
});
