import { describe, it, expect } from 'vitest';
import { templates, backgrounds } from '../src/domain/model';
import { getStudioVisualizer } from '../src/folia/registry';
import { canCompositeProject, canExportFrames } from '../src/export/capabilities';
import { compileLumiereProgram } from '../src/lumiere/lumiereProgram';
import { normalizeLumiereTuning } from '../src/lumiere/lumiereTuning';
import { resolveLucideIcon, resolveLucideIconNames, getLucideIconStatus } from '../src/lumiere/lucideIconResolver';
import { DEFAULT_LUMIERE_TUNING, type Line } from '../src/vendor/folia/types';

describe('Lumiere (绘光) Visualizer & Background Updates', () => {
    describe('Domain Model & Registry Integration', () => {
        it('registers folia-lumiere as style No. 20 with exact branding', () => {
            const entry = templates.find(t => t.id === 'folia-lumiere');
            expect(entry).toBeDefined();
            expect(entry?.name).toBe('绘光');
            expect(entry?.english).toBe('Lumiere · Folia');
            expect(entry?.number).toBe('20');
        });

        it('wires folia-lumiere into the Studio visualizer registry with frame export and word segmentation', () => {
            const entry = getStudioVisualizer('folia-lumiere');
            expect(entry).toBeDefined();
            expect(entry.id).toBe('folia-lumiere');
            expect(entry.frameExport).toBe(true);
            expect(entry.usesWordSegmentation).toBe(true);
            expect(canExportFrames({ template: 'folia-lumiere', background: 'latent' })).toBe(true);
        });

        it('supports offline compositing for folia-lumiere on solid shader backgrounds', () => {
            expect(canCompositeProject({ template: 'folia-lumiere', background: 'latent' })).toBe(true);
            expect(canCompositeProject({ template: 'folia-lumiere', background: 'sora' })).toBe(true);
            expect(canCompositeProject({ template: 'folia-lumiere', background: 'common' })).toBe(false);
        });

        it('registers sora in background options with correct metadata', () => {
            const sora = backgrounds.find(b => b.id === 'sora');
            expect(sora).toBeDefined();
            expect(sora?.name).toBe('空境星空');
            expect(sora?.description).toContain('深空星辉');
        });
    });

    describe('Lumiere Program Compiler', () => {
        const sampleLines: Line[] = [
            {
                id: 'line-1',
                fullText: '风把远方写成了诗',
                startTime: 2,
                endTime: 7,
                words: [
                    { text: '风把', startTime: 2, endTime: 3.5 },
                    { text: '远方', startTime: 3.5, endTime: 5 },
                    { text: '写成了诗', startTime: 5, endTime: 7 },
                ],
            },
            {
                id: 'line-2',
                fullText: 'We follow the light through the city',
                startTime: 7.2,
                endTime: 12,
                words: [
                    { text: 'We', startTime: 7.2, endTime: 8 },
                    { text: 'follow', startTime: 8, endTime: 9 },
                    { text: 'the light', startTime: 9, endTime: 10.5 },
                    { text: 'through the city', startTime: 10.5, endTime: 12 },
                ],
            },
        ];

        it('compiles lyric lines into structured paragraphs and shots', () => {
            const program = compileLumiereProgram(sampleLines, 'test-seed');
            expect(program).toBeDefined();
            expect(program.paragraphs.length).toBeGreaterThan(0);

            const firstParagraph = program.paragraphs[0];
            expect(firstParagraph.shots.length).toBeGreaterThan(0);
            const firstShot = firstParagraph.shots[0];
            expect(firstShot.kind).toBeDefined();
            expect(firstShot.startTime).toBeLessThan(firstShot.endTime);
        });

        it('respects seamlessTransitions flag to chain into single connected paragraph', () => {
            const segmented = compileLumiereProgram(sampleLines, 'seed-1', {}, { seamless: false });
            const seamless = compileLumiereProgram(sampleLines, 'seed-1', {}, { seamless: true });

            expect(segmented).toBeDefined();
            expect(seamless).toBeDefined();
            expect(seamless.paragraphs.length).toBeLessThanOrEqual(segmented.paragraphs.length);
        });

        it('safely handles empty or instrumental lines', () => {
            const emptyProgram = compileLumiereProgram([], 'empty-seed');
            expect(emptyProgram).toBeDefined();
            expect(emptyProgram.paragraphs.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Lumiere Tuning Normalizer', () => {
        it('normalizes valid tuning and keeps customized parameters within bounds', () => {
            const raw = {
                lightIntensity: 1.8,
                audioResponse: 0.5,
                darkField: 0.85,
                fogDensity: 1.2,
                renderQuality: 'balanced' as const,
            };
            const normalized = normalizeLumiereTuning(raw);
            expect(normalized.lightIntensity).toBe(1.8);
            expect(normalized.audioResponse).toBe(0.5);
            expect(normalized.darkField).toBe(0.85);
            expect(normalized.fogDensity).toBe(1.2);
            expect(normalized.renderQuality).toBe('balanced');
            expect(normalized.lineArt).toBe(DEFAULT_LUMIERE_TUNING.lineArt);
        });

        it('clamps out-of-range tuning values to safe limits', () => {
            const normalized = normalizeLumiereTuning({
                lightIntensity: 999,
                darkField: -5,
                fogOctaves: 20,
                renderQuality: 'invalid-quality' as any,
            });
            expect(normalized.lightIntensity).toBe(2);
            expect(normalized.darkField).toBe(0);
            expect(normalized.fogOctaves).toBe(6);
            expect(normalized.renderQuality).toBe(DEFAULT_LUMIERE_TUNING.renderQuality);
        });
    });

    describe('Lucide Icon Synchronous Resolver', () => {
        it('synchronously resolves known icons from bundled lucide-react', () => {
            const sparkIcon = resolveLucideIcon('Sparkles');
            expect(sparkIcon).not.toBeNull();
            expect(getLucideIconStatus('Sparkles')).toBe('ready');

            const starIcon = resolveLucideIcon('Star');
            expect(starIcon).not.toBeNull();

            // Case-insensitive lookup
            const lowerIcon = resolveLucideIcon('sparkles');
            expect(lowerIcon).not.toBeNull();
        });

        it('returns null for unknown icon names without crashing', () => {
            expect(resolveLucideIcon('non_existent_icon_12345')).toBeNull();
            expect(resolveLucideIcon('')).toBeNull();
            expect(resolveLucideIcon(null)).toBeNull();
            expect(getLucideIconStatus('non_existent_icon_12345')).toBe('missing');
        });

        it('filters and deduplicates valid icon names', () => {
            const resolved = resolveLucideIconNames(['Sparkles', 'Star', 'Sparkles', 'InvalidFakeIcon']);
            expect(resolved).toContain('Sparkles');
            expect(resolved).toContain('Star');
            expect(resolved).not.toContain('InvalidFakeIcon');
            expect(resolved.length).toBe(2);
        });
    });
});
