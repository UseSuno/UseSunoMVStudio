import { describe, it, expect } from 'vitest';
import {
    easeSyzygyGravitationalSnap,
    easeSyzygyStardustDissolve,
    resolveSyzygyCameraPath,
    resolveSyzygyCelestialBreath,
} from '../src/syzygy/syzygyMotion';
import { compileSyzygyProgram, findSyzygyParagraphIndex } from '../src/syzygy/syzygyProgram';
import { buildSyzygyShotLayout } from '../src/syzygy/syzygyLayout';
import { templates } from '../src/domain/model';
import { getStudioVisualizer } from '../src/folia/registry';
import { normalizeLyricPhrasing } from '../src/folia/adapter';

describe('Syzygy (朔望) Visualizer', () => {
    describe('Astronomical Motion Mathematics', () => {
        it('easeSyzygyGravitationalSnap boundaries at 0 and 1 with gravitational tidal overshoot', () => {
            expect(easeSyzygyGravitationalSnap(0)).toBe(0);
            expect(easeSyzygyGravitationalSnap(1)).toBe(1);
            expect(easeSyzygyGravitationalSnap(1.5)).toBe(1);

            // Mid-progress exhibits physical gravitational snap overshoot (> 1.0)
            const mid = easeSyzygyGravitationalSnap(0.7);
            expect(mid).toBeGreaterThan(1.0);
            expect(mid).toBeLessThan(1.15);
        });

        it('easeSyzygyStardustDissolve accelerates monotonically from 0 to 1', () => {
            expect(easeSyzygyStardustDissolve(0)).toBe(0);
            expect(easeSyzygyStardustDissolve(1)).toBe(1);
            expect(easeSyzygyStardustDissolve(1.2)).toBe(1);

            const v1 = easeSyzygyStardustDissolve(0.3);
            const v2 = easeSyzygyStardustDissolve(0.6);
            const v3 = easeSyzygyStardustDissolve(0.9);
            expect(v1).toBeLessThan(v2);
            expect(v2).toBeLessThan(v3);
        });

        it('resolveSyzygyCameraPath returns valid finite trajectories across all 6 shot kinds', () => {
            const kinds = [
                'syzygy-corona',
                'orbital-sweep',
                'celestial-chart',
                'gravity-lens',
                'zenith-tableau',
                'meteor-cascade',
            ] as const;

            for (const kind of kinds) {
                const camStart = resolveSyzygyCameraPath(kind, 0, 0.5);
                const camMid = resolveSyzygyCameraPath(kind, 0.5, 0.5);
                const camEnd = resolveSyzygyCameraPath(kind, 1.0, 0.5);

                for (const cam of [camStart, camMid, camEnd]) {
                    expect(Number.isFinite(cam.x)).toBe(true);
                    expect(Number.isFinite(cam.y)).toBe(true);
                    expect(Number.isFinite(cam.zoom)).toBe(true);
                    expect(Number.isFinite(cam.rotation)).toBe(true);
                    expect(cam.zoom).toBeGreaterThan(0.5);
                }
            }
        });

        it('resolveSyzygyCelestialBreath produces bounded periodic drift', () => {
            const breath1 = resolveSyzygyCelestialBreath(1.0, 0);
            const breath2 = resolveSyzygyCelestialBreath(2.5, 0);

            expect(Math.abs(breath1.x)).toBeLessThan(0.02);
            expect(Math.abs(breath1.y)).toBeLessThan(0.02);
            expect(Math.abs(breath2.zoom)).toBeLessThan(0.01);
            expect(Math.abs(breath2.rotation)).toBeLessThan(0.01);
        });
    });

    describe('Astronomical Program Compilation and Slash Phrasing', () => {
        it('compiles lyric lines containing visual phrase slashes smoothly without crash or leaked symbols', () => {
            const rawLine = '浩瀚星海 / 漫漫引力 / 追寻着微光';
            const normalized = normalizeLyricPhrasing(rawLine);
            expect(normalized.cleanText).toBe('浩瀚星海漫漫引力追寻着微光');
            expect(normalized.wordSegments).toEqual(['浩瀚星海', '漫漫引力', '追寻着微光']);

            const lines = [
                {
                    id: 'line-1',
                    startTime: 2.0,
                    endTime: 6.0,
                    fullText: normalized.cleanText,
                    wordSegments: normalized.wordSegments,
                    words: [
                        { text: '浩瀚星海', startTime: 2.0, endTime: 3.2 },
                        { text: '漫漫引力', startTime: 3.3, endTime: 4.5 },
                        { text: '追寻着微光', startTime: 4.6, endTime: 5.8 },
                    ],
                    isChorus: true,
                },
            ];

            const program = compileSyzygyProgram(lines as any, 'syzygy-test-seed');
            expect(program).toBeDefined();
            expect(program.paragraphs.length).toBeGreaterThan(0);

            const firstParagraph = program.paragraphs[0];
            expect(firstParagraph.shots.length).toBeGreaterThan(0);

            const firstShot = firstParagraph.shots[0];
            expect(firstShot.segments.length).toBeGreaterThan(0);

            for (const seg of firstShot.segments) {
                expect(Number.isFinite(seg.startTime)).toBe(true);
                expect(Number.isFinite(seg.endTime)).toBe(true);
                // Verify slashes were never leaked into the lyric segments
                if (seg.role !== 'annotation') {
                    expect(seg.text).not.toContain('/');
                }
            }

            // Verify paragraph lookup
            expect(findSyzygyParagraphIndex(program, 3.0)).toBe(0);
        });
    });

    describe('Typographic Layout & Collision Safety', () => {
        it('builds layouts across all 6 astronomical shot kinds without character overlaps and stays within safe viewport boundaries', () => {
            const lines = [
                {
                    id: 'test-line',
                    startTime: 0,
                    endTime: 5,
                    fullText: '星轨交错日冕初生',
                    wordSegments: ['星轨交错', '日冕初生'],
                    words: [],
                    isChorus: false,
                },
            ];

            const program = compileSyzygyProgram(lines as any, 'test-seed');
            const baseShot = program.paragraphs[0].shots[0];
            const width = 1280;
            const height = 720;

            const kinds = [
                'syzygy-corona',
                'orbital-sweep',
                'celestial-chart',
                'gravity-lens',
                'meteor-cascade',
                'zenith-tableau',
            ] as const;

            for (const kind of kinds) {
                const shot = { ...baseShot, kind };
                const segmentLayouts = buildSyzygyShotLayout(shot, width, height, 1.0);
                expect(segmentLayouts.length).toBeGreaterThan(0);

                const allGlyphs = segmentLayouts.flatMap(s => s.glyphs);
                expect(allGlyphs.length).toBeGreaterThan(0);

                for (let i = 0; i < allGlyphs.length; i++) {
                    const g1 = allGlyphs[i];
                    expect(g1.baseX).toBeGreaterThanOrEqual(10);
                    expect(g1.baseX).toBeLessThanOrEqual(width - 10);
                    expect(g1.baseY).toBeGreaterThanOrEqual(10);
                    expect(g1.baseY).toBeLessThanOrEqual(height - 10);

                    for (let j = i + 1; j < allGlyphs.length; j++) {
                        const g2 = allGlyphs[j];
                        const dist = Math.hypot(g1.baseX - g2.baseX, g1.baseY - g2.baseY);
                        if (g1.role === g2.role && g1.role !== 'annotation') {
                            expect(dist).toBeGreaterThan(3);
                        }
                    }
                }
            }
        });
    });

    describe('Registration & Metadata', () => {
        it('is listed in templates array with style number 19', () => {
            const entry = templates.find(t => t.id === 'folia-syzygy');
            expect(entry).toBeDefined();
            expect(entry?.name).toBe('朔望');
            expect(entry?.english).toContain('Syzygy');
            expect(entry?.number).toBe('19');
        });

        it('is registered in Studio registry with frame export and word segmentation enabled', () => {
            const entry = getStudioVisualizer('folia-syzygy');
            expect(entry).toBeDefined();
            expect(entry.id).toBe('folia-syzygy');
            expect(entry.frameExport).toBe(true);
            expect(entry.usesWordSegmentation).toBe(true);
        });
    });

    describe('Syzygy Director Compiler & Monumental Hierarchy', () => {
        it('compiles director shots correctly splitting slashes and enforcing collision-free multi-phrase layout', async () => {
            const { compileSyzygyDirectorShots, resolveSyzygyCameraFrame } = await import('../src/syzygy/director');

            const testLines = [
                {
                    id: 'shot-1',
                    startTime: 1.0,
                    endTime: 5.0,
                    fullText: '合朔日食 / 观测地平线 / 星座移动',
                    wordSegments: ['合朔日食', '观测地平线', '星座移动'],
                    words: [
                        { text: '合', startTime: 1.0, endTime: 1.5 },
                        { text: '朔', startTime: 1.5, endTime: 2.0 },
                        { text: '日', startTime: 2.0, endTime: 2.5 },
                        { text: '食', startTime: 2.5, endTime: 3.0 },
                        { text: '观', startTime: 3.0, endTime: 3.4 },
                        { text: '测', startTime: 3.4, endTime: 3.8 },
                        { text: '地', startTime: 3.8, endTime: 4.2 },
                        { text: '平', startTime: 4.2, endTime: 4.6 },
                        { text: '线', startTime: 4.6, endTime: 5.0 },
                    ],
                    isChorus: true,
                },
                {
                    id: 'shot-2',
                    startTime: 6.0,
                    endTime: 10.0,
                    fullText: '当引力撕裂苍穹 / 晨昏线在静默中收缩',
                    words: [
                        { text: '当引力撕裂苍穹', startTime: 6.0, endTime: 8.0 },
                        { text: '晨昏线在静默中收缩', startTime: 8.0, endTime: 10.0 },
                    ],
                    isChorus: false,
                },
            ];

            const shots = compileSyzygyDirectorShots(testLines as any);
            expect(shots.length).toBe(2);

            // Shot 1 check: chorus gets totality-corona
            const shot1 = shots[0];
            expect(shot1.kind).toBe('totality-corona');
            expect(shot1.phrases.length).toBe(3);

            // Collision-free layout check: all 3 phrases have distinct vertical/horizontal positions
            for (let i = 0; i < shot1.phrases.length; i++) {
                for (let j = i + 1; j < shot1.phrases.length; j++) {
                    const p1 = shot1.phrases[i];
                    const p2 = shot1.phrases[j];
                    const dist = Math.hypot(p1.relX - p2.relX, p1.relY - p2.relY);
                    expect(dist).toBeGreaterThan(0.08);
                }
            }

            // Hero phrase check
            const heroPhrase = shot1.phrases[shot1.hero];
            expect(heroPhrase.role).toBe('hero');
            expect(heroPhrase.fontScale).toBeGreaterThanOrEqual(1.0);

            // Support phrases check
            const supportPhrases = shot1.phrases.filter(p => p.role === 'support');
            expect(supportPhrases.length).toBe(2);
            for (const sp of supportPhrases) {
                expect(sp.fontScale).toBeLessThanOrEqual(heroPhrase.fontScale);
                // Verify slashes were never leaked into glyph characters
                for (const g of sp.glyphs) {
                    expect(g.char).not.toBe('/');
                }
            }

            // Shot 2 check: slashes in fullText split cleanly without wordSegments
            const shot2 = shots[1];
            expect(shot2.phrases.length).toBe(2);
            expect(shot2.phrases[0].text).toBe('当引力撕裂苍穹');
            expect(shot2.phrases[1].text).toBe('晨昏线在静默中收缩');

            // Camera frame interpolation check
            const camStart = resolveSyzygyCameraFrame(shot1, shot1.start);
            const camMid = resolveSyzygyCameraFrame(shot1, (shot1.start + shot1.end) / 2);
            const camEnd = resolveSyzygyCameraFrame(shot1, shot1.end);

            for (const cf of [camStart, camMid, camEnd]) {
                expect(Number.isFinite(cf.x)).toBe(true);
                expect(Number.isFinite(cf.y)).toBe(true);
                expect(Number.isFinite(cf.zoom)).toBe(true);
                expect(Number.isFinite(cf.rotation)).toBe(true);
                expect(cf.zoom).toBeGreaterThan(0.9);
            }
        });

        it('ensures every character including the last character is preserved in phrases for real demo lyrics', async () => {
            const { parseLyrics } = await import('../src/import/lyrics');
            const { demoSource, defaultProject } = await import('../src/domain/model');
            const { foliaLines } = await import('../src/folia/adapter');
            const { compileSyzygyDirectorShots } = await import('../src/syzygy/director');

            const parsed = parseLyrics(demoSource, 46);
            const project = defaultProject(parsed.lines);
            const lines = foliaLines(project);
            const shots = compileSyzygyDirectorShots(lines);

            expect(shots.length).toBe(lines.length);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const shot = shots[i];
                const allPhraseGlyphs = shot.phrases.flatMap(p => p.glyphs);
                const cleanLineText = line.fullText.replace(/[\s\/]/g, '');

                const expectedLastChar = cleanLineText[cleanLineText.length - 1];
                const actualLastChar = allPhraseGlyphs[allPhraseGlyphs.length - 1]?.char;
                expect(actualLastChar).toBe(expectedLastChar);
            }
        });

        it('assigns multiline and vertical dimensional layouts to eliminate flat horizontal lines', async () => {
            const { compileSyzygyDirectorShots } = await import('../src/syzygy/director');

            const testLines = [
                {
                    id: 'long-line',
                    startTime: 0,
                    endTime: 4,
                    fullText: '浩瀚星海漫漫引力追寻着微光',
                    words: [{ text: '浩瀚星海漫漫引力追寻着微光', startTime: 0, endTime: 4 }],
                    isChorus: false,
                },
                {
                    id: 'transit-cjk',
                    startTime: 5,
                    endTime: 9,
                    fullText: '天顶凌日 / 星轨沉降',
                    words: [
                        { text: '天顶凌日', startTime: 5, endTime: 7 },
                        { text: '星轨沉降', startTime: 7, endTime: 9 },
                    ],
                    isChorus: false,
                },
            ];

            const shots = compileSyzygyDirectorShots(testLines as any);
            expect(shots.length).toBe(2);

            // Shot 0: Long single sentence (13 chars) should be multiline rather than a flat line
            expect(shots[0].phrases[0].layoutDirection).toBe('multiline');

            // Shot 1: Both phrases should have a valid layout direction
            expect(['horizontal', 'vertical', 'multiline']).toContain(shots[1].phrases[0].layoutDirection);
            expect(['horizontal', 'vertical', 'multiline']).toContain(shots[1].phrases[1].layoutDirection);
        });

        it('ensures generous lead-in time before singing starts to guarantee visible particle assembly on enter', async () => {
            const { compileSyzygyDirectorShots } = await import('../src/syzygy/director');

            const testLines = [
                {
                    id: 'line-1',
                    startTime: 2.0,
                    endTime: 5.0,
                    fullText: '星海漫漫',
                    words: [{ text: '星海漫漫', startTime: 2.0, endTime: 5.0 }],
                    isChorus: false,
                },
                {
                    id: 'line-2',
                    startTime: 7.0,
                    endTime: 10.0,
                    fullText: '微光破晓',
                    words: [{ text: '微光破晓', startTime: 7.0, endTime: 10.0 }],
                    isChorus: false,
                },
            ];

            const shots = compileSyzygyDirectorShots(testLines as any);
            expect(shots.length).toBe(2);

            // Both shots must start earlier than line.startTime to allow particle assembly!
            expect(shots[0].start).toBeLessThan(testLines[0].startTime);
            expect(shots[0].lineStartTime - shots[0].start).toBeGreaterThanOrEqual(0.40);

            expect(shots[1].start).toBeLessThan(testLines[1].startTime);
            expect(shots[1].lineStartTime - shots[1].start).toBeGreaterThanOrEqual(0.40);

            // Shots connect continuously
            expect(shots[0].end).toBe(shots[1].start);
        });

        it('guarantees lead-in before line singing starts even with tight line spacing', async () => {
            const { compileSyzygyDirectorShots } = await import('../src/syzygy/director');

            const testLines = [
                {
                    id: 'line-1',
                    startTime: 2.0,
                    endTime: 5.0,
                    fullText: '星海漫漫',
                    words: [{ text: '星海漫漫', startTime: 2.0, endTime: 5.0 }],
                    isChorus: false,
                },
                {
                    id: 'line-2',
                    startTime: 5.3,
                    endTime: 8.0,
                    fullText: '微光破晓',
                    words: [{ text: '微光破晓', startTime: 5.3, endTime: 8.0 }],
                    isChorus: false,
                },
            ];

            const shots = compileSyzygyDirectorShots(testLines as any);
            expect(shots.length).toBe(2);

            // Shot 1 must start BEFORE line 2 starts singing (never after!)
            expect(shots[1].start).toBeLessThan(testLines[1].startTime);
            expect(shots[0].end).toBe(shots[1].start);
            expect(testLines[1].startTime - shots[1].start).toBeGreaterThan(0.10);
        });

        it('ensures each character has its own distinct singing cue so characters emerge progressively', async () => {
            const { compileSyzygyDirectorShots } = await import('../src/syzygy/director');

            const testLines = [
                {
                    id: 'line-1',
                    startTime: 2.0,
                    endTime: 4.0,
                    fullText: '风把远方',
                    words: [
                        { text: '风', startTime: 2.0, endTime: 2.5 },
                        { text: '把', startTime: 2.5, endTime: 3.0 },
                        { text: '远', startTime: 3.0, endTime: 3.5 },
                        { text: '方', startTime: 3.5, endTime: 4.0 },
                    ],
                    isChorus: false,
                },
            ];

            const shots = compileSyzygyDirectorShots(testLines as any);
            expect(shots.length).toBe(1);

            const phrase = shots[0].phrases[0];
            expect(phrase.glyphs.length).toBe(4);

            // Each glyph must have strictly progressive start times (never equal)
            for (let i = 1; i < phrase.glyphs.length; i++) {
                const prev = phrase.glyphs[i - 1];
                const curr = phrase.glyphs[i];
                expect(curr.startTime).toBeGreaterThan(prev.startTime);
                expect(curr.startTime - prev.startTime).toBeGreaterThanOrEqual(0.3);
            }
        });

        it('provides Tempera-inspired deceleration, soft-back cushioning, and smooth alpha reveal curves', async () => {
            const { easeSyzygyEnter, easeSyzygyInOut, easeSyzygySoftBack } = await import('../src/syzygy/syzygyMotion');

            // Boundary checks
            expect(easeSyzygyEnter(0)).toBe(0);
            expect(easeSyzygyEnter(1)).toBe(1);
            expect(easeSyzygyInOut(0)).toBe(0);
            expect(easeSyzygyInOut(1)).toBe(1);
            expect(easeSyzygySoftBack(0)).toBe(0);
            expect(easeSyzygySoftBack(1)).toBe(1);

            // Decisive fast start and gentle deceleration tail:
            // At 50% time, easeSyzygyEnter is already well above 0.85
            const mid = easeSyzygyEnter(0.5);
            expect(mid).toBeGreaterThan(0.85);

            // S-curve reveal: at 20% progress, gentle alpha entry
            const earlyAlpha = easeSyzygyInOut(0.2);
            expect(earlyAlpha).toBeGreaterThan(0.01);
            expect(earlyAlpha).toBeLessThan(0.15);

            // Soft-back cushion: mild elastic overshoot peaking above 1.0 around 0.70 progress
            const overshoot = easeSyzygySoftBack(0.72);
            expect(overshoot).toBeGreaterThan(1.01);
            expect(overshoot).toBeLessThan(1.10);
        });

        it('directly integrates resolveTemperaEnterFrame with exact directional slide and settle properties', async () => {
            const { resolveTemperaEnterFrame } = await import('../src/vendor/folia/components/visualizer/tempera/temperaEnterStyles');
            const { easeTemperaEnter } = await import('../src/vendor/folia/components/visualizer/tempera/temperaMotionEasing');

            const input = {
                enterX: 0,
                enterY: 60,
                enterRotation: 0.15,
                enterScale: 0.82,
            };

            // At start (linear = 0, travel = 1.0):
            const frame0 = resolveTemperaEnterFrame('slide', input, 1.0, 0.0);
            expect(frame0.x).toBeCloseTo(0, 2);
            expect(frame0.y).toBeCloseTo(60, 2);
            expect(frame0.scaleX).toBeCloseTo(0.82, 2);
            expect(frame0.echo).toBeCloseTo(1.0, 2);

            // Midway (linear = 0.5):
            const travelMid = 1 - easeTemperaEnter(0.5);
            const frameMid = resolveTemperaEnterFrame('slide', input, travelMid, 0.5);
            expect(frameMid.y).toBeLessThan(60 * 0.25); // Strongly decelerated
            expect(frameMid.scaleX).toBeGreaterThan(0.95);

            // At settle (linear = 1.0, travel = 0.0):
            const frameEnd = resolveTemperaEnterFrame('slide', input, 0.0, 1.0);
            expect(frameEnd.x).toBe(0);
            expect(frameEnd.y).toBe(0);
            expect(frameEnd.scaleX).toBe(1.0);
            expect(frameEnd.echo).toBe(0.0);
        });
    });

    describe('Warm Paper (暖纸) & Daylight Atmosphere Adaptation', () => {
        it('accurately resolves isDaylight for warm paper palettes across Folia and Studio', async () => {
            const { resolveSyzygyIsDaylight } = await import('../src/syzygy/VisualizerSyzygy');

            // Folia and Studio Warm Paper background hexes
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#ece7db' })).toBe(true);
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#f6f3eb' })).toBe(true);
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#e9e4d9' })).toBe(true);

            // Dark palettes
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#0d1424' })).toBe(false);
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#102d2c' })).toBe(false);
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#191e24' })).toBe(false);

            // Explicit prop overrides
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#0d1424' }, true)).toBe(true);
            expect(resolveSyzygyIsDaylight({ backgroundColor: '#ece7db' }, false)).toBe(false);
        }, 15000);

        it('guarantees crisp typographic contrast on warm paper eliminating washed-out white text', async () => {
            const { parseColorChannels } = await import('../src/vendor/folia/components/visualizer/colorMix');
            const luminanceOf = (hex: string) => {
                const c = parseColorChannels(hex)!;
                return c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
            };

            const paperBg = '#ece7db';
            const paperInk = '#292e34';
            const white = '#ffffff';

            const bgLuma = luminanceOf(paperBg);
            const inkLuma = luminanceOf(paperInk);
            const whiteLuma = luminanceOf(white);

            // White on paper has barely any contrast difference (washed out)
            const whiteContrast = Math.abs(whiteLuma - bgLuma);
            expect(whiteContrast).toBeLessThan(35);

            // Charcoal ink (theme.primaryColor) has massive contrast on paper (> 150)
            const inkContrast = Math.abs(inkLuma - bgLuma);
            expect(inkContrast).toBeGreaterThan(150);
        });
    });
});


