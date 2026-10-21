import { describe, it, expect } from 'vitest';
import {
    easeElysiumSnap,
    easeElysiumExit,
    resolveElysiumGlyphTransform,
    type ElysiumGlyphMotionProps,
    type ElysiumGlyphContext,
} from '../src/elysium/elysiumMotion';
import { compileSonnetProgram } from '../src/vendor/folia/components/visualizer/sonnet/sonnetProgram';
import { templates } from '../src/domain/model';
import { getStudioVisualizer } from '../src/folia/registry';
import { normalizeLyricPhrasing } from '../src/folia/adapter';

describe('Elysium Visualizer', () => {
    describe('Motion Mathematics', () => {
        it('easeElysiumSnap correctly boundaries at 0 and 1 with dynamic overshoot', () => {
            expect(easeElysiumSnap(0)).toBe(0);
            expect(easeElysiumSnap(1)).toBe(1);
            expect(easeElysiumSnap(1.5)).toBe(1);

            // Mid-progress exhibits tactile elastic overshoot (> 1.0)
            const mid = easeElysiumSnap(0.7);
            expect(mid).toBeGreaterThan(1.0);
            expect(mid).toBeLessThan(1.15);
        });

        it('easeElysiumExit smoothly and monotonically accelerates from 0 to 1', () => {
            expect(easeElysiumExit(0)).toBe(0);
            expect(easeElysiumExit(1)).toBe(1);
            expect(easeElysiumExit(1.2)).toBe(1);

            const v1 = easeElysiumExit(0.2);
            const v2 = easeElysiumExit(0.5);
            const v3 = easeElysiumExit(0.8);
            expect(v1).toBeLessThan(v2);
            expect(v2).toBeLessThan(v3);
        });

        it('resolveElysiumGlyphTransform handles pre-arrival, entry snap, hold, and exit dissipation', () => {
            const glyph: ElysiumGlyphMotionProps = {
                baseX: 200,
                baseY: 300,
                enterX: 30,
                enterY: -10,
                entryRotation: 0.05,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.5,
                zDepth: 0.2,
                caOffset: 5,
            };

            const ctxBase: Omit<ElysiumGlyphContext, 'time'> = {
                shotStartTime: 1.5,
                shotEndTime: 6.0,
                shotKind: 'editorial-column',
                role: 'hero',
                glyphIndex: 0,
                totalGlyphs: 5,
                motion: 1.0,
            };

            // 1. Before glyph start time (t = 1.8s) -> completely hidden
            const pre = resolveElysiumGlyphTransform(glyph, { ...ctxBase, time: 1.8 });
            expect(pre.visible).toBe(false);
            expect(pre.alpha).toBe(0);

            // 2. During entrance (t = 2.1s) -> visible, moving along trajectory arc
            const enter = resolveElysiumGlyphTransform(glyph, { ...ctxBase, time: 2.1 });
            expect(enter.visible).toBe(true);
            expect(enter.alpha).toBeGreaterThan(0);
            // Position is offset from baseX
            expect(enter.x).not.toBe(glyph.baseX);

            // 3. Settled hold phase (t = 3.5s) -> fully settled onto baseX, baseY
            const hold = resolveElysiumGlyphTransform(glyph, { ...ctxBase, time: 3.5 });
            expect(hold.visible).toBe(true);
            expect(hold.alpha).toBeCloseTo(1.0, 2);
            expect(hold.x).toBeCloseTo(glyph.baseX, 1);
            expect(hold.y).toBeCloseTo(glyph.baseY, 1);
            expect(hold.scale).toBeCloseTo(1.0, 2);

            // 4. Staggered Exit phase (t = 5.95s, near shotEndTime = 6.0s) -> lifted and dissolving
            const exit = resolveElysiumGlyphTransform(glyph, { ...ctxBase, time: 5.95 });
            expect(exit.alpha).toBeLessThan(1.0);
            // Has lifted spatially along exit trajectory
            expect(exit.y).not.toBe(glyph.baseY);

            // 5. Well after exit duration -> completely invisible
            const post = resolveElysiumGlyphTransform(glyph, { ...ctxBase, time: 6.5 });
            expect(post.visible).toBe(false);
            expect(post.alpha).toBe(0);
        });
    });

    describe('Program Compilation and Slash Handling', () => {
        it('compiles lyric lines containing visual phrase slashes smoothly without crash', () => {
            const rawLine = '风把远方 / 写成了诗 / 随风飘荡';
            const normalized = normalizeLyricPhrasing(rawLine);
            expect(normalized.cleanText).toBe('风把远方写成了诗随风飘荡');
            expect(normalized.wordSegments).toEqual(['风把远方', '写成了诗', '随风飘荡']);

            const lines = [
                {
                    id: 'line-1',
                    startTime: 1.0,
                    endTime: 5.0,
                    fullText: normalized.cleanText,
                    wordSegments: normalized.wordSegments,
                    words: [
                        { text: '风把远方', startTime: 1.0, endTime: 2.2 },
                        { text: '写成了诗', startTime: 2.3, endTime: 3.6 },
                        { text: '随风飘荡', startTime: 3.7, endTime: 4.8 },
                    ],
                    isChorus: false,
                },
            ];

            const program = compileSonnetProgram(lines as any, 'elysium-test-seed');
            expect(program).toBeDefined();
            expect(program.paragraphs.length).toBeGreaterThan(0);

            const firstParagraph = program.paragraphs[0];
            expect(firstParagraph.shots.length).toBeGreaterThan(0);
            // Verify that compiled line segments are generated and valid
            const firstCompiledLine = firstParagraph.lines[0];
            expect(firstCompiledLine.segments.length).toBeGreaterThan(0);
            // Verify no stray slashes broke the timing or leaked into segments
            for (const seg of firstCompiledLine.segments) {
                expect(Number.isFinite(seg.startTime)).toBe(true);
                expect(Number.isFinite(seg.endTime)).toBe(true);
                expect(seg.text).not.toContain('/');
            }
        });
    });

    describe('Registration & Metadata', () => {
        it('is properly listed in templates array', () => {
            const entry = templates.find(t => t.id === 'folia-elysium');
            expect(entry).toBeDefined();
            expect(entry?.name).toBe('灵境');
            expect(entry?.english).toContain('Elysium');
            expect(entry?.number).toBe('18');
        });

        it('is registered in Studio registry with frameExport and word segmentation', () => {
            const entry = getStudioVisualizer('folia-elysium');
            expect(entry).toBeDefined();
            expect(entry.id).toBe('folia-elysium');
            expect(entry.frameExport).toBe(true);
            expect(entry.usesWordSegmentation).toBe(true);
        });
    });

    describe('Elysium Visual Distinction & Daylight Adaptation', () => {
        it('buildElysiumTuning completely purges Sonnet retro magazine and clutter', async () => {
            const { buildElysiumTuning } = await import('../src/elysium/createElysiumPixiRuntime');
            const tuning = buildElysiumTuning();

            // All Sonnet vintage editorial clutter is purged:
            expect(tuning.showGuide).toBe(false); // No 5-line musical staff
            expect(tuning.showBackgroundMg).toBe(false); // No retro molecular/geometric chaos
            expect(tuning.showFixedGeo).toBe(false); // No postal stamps or text hatches
            expect(tuning.showGiantDecorativeText).toBe(false); // No giant background alphabet watermarks
            expect(tuning.showBackgroundDecor).toBe(false); // No retro clip-art icons
            expect(tuning.outerFrameMode).toBe('none'); // No vintage magazine border
        });

        it('resolveElysiumIsDaylight correctly differentiates Warm Paper from dark themes', async () => {
            const { resolveElysiumIsDaylight } = await import('../src/elysium/createElysiumPixiRuntime');

            // Warm Paper daylight themes
            expect(resolveElysiumIsDaylight({ backgroundColor: '#ece7db' })).toBe(true);
            expect(resolveElysiumIsDaylight({ backgroundColor: '#f6f3eb' })).toBe(true);
            expect(resolveElysiumIsDaylight({ backgroundColor: '#ffffff' })).toBe(true);

            // Dark themes
            expect(resolveElysiumIsDaylight({ backgroundColor: '#0b0f19' })).toBe(false);
            expect(resolveElysiumIsDaylight({ backgroundColor: '#1a1a24' })).toBe(false);
            expect(resolveElysiumIsDaylight({ backgroundColor: '#0f1d14' })).toBe(false);

            // Explicit prop overrides
            expect(resolveElysiumIsDaylight({ backgroundColor: '#0b0f19' }, true)).toBe(true);
            expect(resolveElysiumIsDaylight({ backgroundColor: '#ece7db' }, false)).toBe(false);
        });

        it('formatElysiumTimecode formats seconds to HH:MM:SS frames', async () => {
            const { formatElysiumTimecode } = await import('../src/elysium/createElysiumPixiRuntime');
            expect(formatElysiumTimecode(0)).toBe('00:00:00');
            expect(formatElysiumTimecode(65.5)).toBe('01:05:15');
        });

        it('compiles multi-line lyric program with contiguous shot coverage and valid segments', () => {
            const lines = [
                {
                    id: '1',
                    startTime: 2.0,
                    endTime: 6.0,
                    fullText: '我听见风来自地铁和人海',
                    words: [
                        { text: '我听见风', startTime: 2.0, endTime: 3.5 },
                        { text: '来自地铁和人海', startTime: 3.6, endTime: 6.0 },
                    ],
                    isChorus: false,
                },
                {
                    id: '2',
                    startTime: 7.0,
                    endTime: 11.0,
                    fullText: '我排着队拿着爱的号码牌',
                    words: [
                        { text: '我排着队', startTime: 7.0, endTime: 8.5 },
                        { text: '拿着爱的号码牌', startTime: 8.6, endTime: 11.0 },
                    ],
                    isChorus: false,
                },
            ];
            const program = compileSonnetProgram(lines as any, 'test-timing');
            expect(program.paragraphs.length).toBeGreaterThan(0);
            for (const p of program.paragraphs) {
                expect(p.shots.length).toBeGreaterThan(0);
                for (const shot of p.shots) {
                    expect(shot.endTime).toBeGreaterThan(shot.startTime);
                }
                for (const l of p.lines) {
                    expect(l.segments.length).toBeGreaterThan(0);
                    for (const s of l.segments) {
                        expect(s.endTime).toBeGreaterThanOrEqual(s.startTime);
                    }
                }
            }
        });

        it('executes updateShot logic with easeElysiumSnap and glyph transforms without runtime errors', async () => {
            const { buildElysiumTuning, ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            expect(ElysiumPixiRuntime).toBeDefined();

            const tuning = buildElysiumTuning();
            expect(tuning).toBeDefined();

            // Test mock shot view
            const mockDisplay = {
                alpha: 0,
                visible: false,
                scale: { set: (s: number) => { mockDisplay.scaleVal = s; } },
                position: { set: (x: number, y: number) => { mockDisplay.pos = { x, y }; } },
                rotation: 0,
                pos: { x: 0, y: 0 },
                scaleVal: 1,
            };

            const mockGlyph = {
                display: mockDisplay as any,
                baseX: 100,
                baseY: 200,
                enterX: 10,
                enterY: -5,
                entryRotation: 0.05,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.5,
                zDepth: 0,
                isTextGlyph: true,
            };

            const mockContainer = {
                pivot: { set: () => {} },
                scale: { set: () => {} },
                position: { set: () => {} },
                rotation: 0,
                x: 0,
                y: 0,
                children: [],
                addChild: () => {},
                addChildAt: () => {},
            };

            const mockShotView = {
                shot: {
                    id: 'shot-1',
                    kind: 'editorial-column',
                    startTime: 1.0,
                    endTime: 5.0,
                    camera: { zoom: 1, rotation: 0, x: 0, y: 0 },
                },
                container: mockContainer as any,
                segments: [
                    {
                        role: 'hero',
                        fontScale: 1,
                        trackingGlyphs: [mockGlyph],
                        glyphs: [mockGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                ],
                baseX: 640,
                baseY: 360,
                basePivotX: 640,
                basePivotY: 360,
                mgLayer: { visible: true },
                haloLayer: {},
            };

            // Test updateShot via prototype call
            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning,
                theme: { primaryColor: '#292e34', accentColor: '#d96c43', secondaryColor: '#6e7987' },
                isDaylight: true,
                paused: false,
                currentTime: { get: () => 2.2 },
                audioBands: { bass: { get: () => 0.5 }, vocal: { get: () => 0.8 } },
                audioPower: { get: () => 0.6 },
            };
            (runtimeInstance as any).pixi = {
                Color: {
                    shared: {
                        setValue: () => ({ toNumber: () => 0xd96c43 }),
                    },
                },
                Graphics: class {
                    clear() {}
                    moveTo() { return this; }
                    lineTo() { return this; }
                    stroke() { return this; }
                    circle() { return this; }
                    fill() { return this; }
                },
            };

            // Calling updateShot must NOT throw ReferenceError: easeElysiumSnap is not defined
            expect(() => {
                (runtimeInstance as any).updateShot(mockShotView, 2.2, 1280, 720, 0);
            }).not.toThrow();

            // Verify glyph became visible and positioned
            expect(mockDisplay.visible).toBe(true);
            expect(mockDisplay.alpha).toBeGreaterThan(0);
            expect(mockDisplay.pos.x).toBeGreaterThan(0);
        });
    });

    describe('3D Spatial Typography Matrix & Continuous Chase Camera (Sonnet + Fume)', () => {
        it('builds deterministic 3D spatial map across all shots in multi-phrase program', async () => {
            const { buildElysiumSpatialMap } = await import('../src/elysium/elysiumSpatial');
            const program = compileSonnetProgram([
                { id: '1', fullText: '风把远方写成了诗', startTime: 0, endTime: 3.5, words: [] },
                { id: '2', fullText: '我们在光年外重逢', startTime: 3.8, endTime: 7.2, words: [] },
                { id: '3', fullText: '星海苍茫无边', startTime: 7.5, endTime: 11.0, words: [] },
            ] as any, 'test-spatial-seed');

            const spatialMap = buildElysiumSpatialMap(program, 1280, 720);
            expect(spatialMap.length).toBeGreaterThanOrEqual(3);

            // First shot starts at origin
            expect(spatialMap[0].anchor.x).toBe(0);
            expect(spatialMap[0].anchor.y).toBe(0);
            expect(spatialMap[0].anchor.z).toBe(0);
            expect(spatialMap[0].anchor.roll).toBe(0);

            // Subsequent shots are placed along a 3D corridor with varying coordinates
            const shot1 = spatialMap[1];
            expect(shot1.anchor.x).not.toBe(0);
            expect(shot1.anchor.y).not.toBe(0);
            expect(shot1.anchor.z).not.toBe(0);
            expect(shot1.anchor.roll).not.toBe(0);

            // Determinism: same input produces identical anchors
            const secondMap = buildElysiumSpatialMap(program, 1280, 720);
            expect(secondMap[1].anchor.x).toBe(shot1.anchor.x);
            expect(secondMap[1].anchor.y).toBe(shot1.anchor.y);
            expect(secondMap[1].anchor.z).toBe(shot1.anchor.z);

            // Progressive non-overlapping guarantee: each shot advances strictly forward in X with ample clearance (> 800px)
            for (let i = 1; i < spatialMap.length; i++) {
                expect(spatialMap[i].anchor.x).toBeGreaterThan(spatialMap[i - 1].anchor.x + 800);
            }
        });

        it('resolves continuous 3D camera trajectory with smooth transition, 3D swoop, and banking roll', async () => {
            const {
                buildElysiumSpatialMap,
                resolveElysiumContinuousCamera,
                easeElysiumFlight,
            } = await import('../src/elysium/elysiumSpatial');

            expect(easeElysiumFlight(0)).toBe(0);
            expect(easeElysiumFlight(1)).toBe(1);
            expect(easeElysiumFlight(0.5)).toBeCloseTo(0.5, 2);

            const program = compileSonnetProgram([
                { id: '1', fullText: '第一句歌词起航', startTime: 1.0, endTime: 4.0, words: [] },
                { id: '2', fullText: '第二句歌词飞跃', startTime: 4.5, endTime: 8.0, words: [] },
            ] as any, 'test-flight-seed');

            const spatialMap = buildElysiumSpatialMap(program, 1280, 720);
            expect(spatialMap.length).toBeGreaterThanOrEqual(2);

            // 1. In the middle of shot 0 (t = 2.0s): camera is locked on shot 0
            const steadyCam = resolveElysiumContinuousCamera(spatialMap, 2.0);
            expect(steadyCam.activeShotIndex).toBe(0);
            expect(steadyCam.flightProgress).toBe(0);
            expect(steadyCam.x).toBe(spatialMap[0].anchor.x);
            expect(steadyCam.y).toBe(spatialMap[0].anchor.y);

            // 2. Mid-flight handover between shot 0 and shot 1 (e.g. t = 4.2s)
            const flightCam = resolveElysiumContinuousCamera(spatialMap, 4.2);
            expect(flightCam.flightProgress).toBeGreaterThan(0);
            expect(flightCam.flightProgress).toBeLessThan(1);
            // Camera position is in between the two anchors
            expect(flightCam.x).not.toBe(spatialMap[0].anchor.x);
            // 3D swoop adds altitude / Z lift
            expect(flightCam.z).not.toBe(spatialMap[0].anchor.z);
            // Aircraft banking adds roll
            expect(flightCam.roll).not.toBe(0);
        });

        it('projects 3D coordinates into 2D viewport with true perspective scaling and Dutch rotation', async () => {
            const { projectElysium3DTo2D } = await import('../src/elysium/elysiumSpatial');

            const anchor = { x: 0, y: 0, z: 0, roll: 0, scale: 1.0 };
            const camera = { x: 0, y: 0, z: 0, roll: 0, activeShotIndex: 0, flightProgress: 0, targetShotIndex: 0 };

            // When camera is aligned with anchor at origin: perfectly centered, scale 1.0
            const projCenter = projectElysium3DTo2D(anchor, camera, 1280, 720, 1000);
            expect(projCenter.visible).toBe(true);
            expect(projCenter.screenX).toBe(640);
            expect(projCenter.screenY).toBe(360);
            expect(projCenter.scale).toBeCloseTo(1.0, 2);
            expect(projCenter.rotation).toBe(0);

            // When object is further away (z = +500): shrinks due to perspective (scale < 1.0)
            const projFar = projectElysium3DTo2D({ ...anchor, z: 500 }, camera, 1280, 720, 1000);
            expect(projFar.scale).toBeLessThan(1.0);
            expect(projFar.screenX).toBe(640);

            // When camera tilts with banking roll: projected rotation reflects delta
            const projRoll = projectElysium3DTo2D(anchor, { ...camera, roll: 0.05 }, 1280, 720, 1000);
            expect(projRoll.rotation).toBeCloseTo(-0.05, 3);
        });

        it('preserves history lyrics in resting spatial layout instead of vanishing when preserveHistory is true', () => {
            const glyph: ElysiumGlyphMotionProps = {
                baseX: 300,
                baseY: 400,
                enterX: 20,
                enterY: -10,
                entryRotation: 0.04,
                finalRotation: 0,
                startTime: 1.0,
                settleTime: 1.4,
                zDepth: 0,
            };

            const ctxBase: ElysiumGlyphContext = {
                time: 6.5, // Well past shotEndTime (5.0s)
                shotStartTime: 0.5,
                shotEndTime: 5.0,
                shotKind: 'editorial-column',
                role: 'hero',
                glyphIndex: 0,
                totalGlyphs: 4,
                motion: 1.0,
                preserveHistory: true,
            };

            // In 3D spatial matrix mode, past lyrics stay visible at full resting position!
            const historyResult = resolveElysiumGlyphTransform(glyph, ctxBase);
            expect(historyResult.visible).toBe(true);
            expect(historyResult.alpha).toBeCloseTo(1.0, 2);
            expect(historyResult.x).toBe(glyph.baseX);
            expect(historyResult.y).toBe(glyph.baseY);

            // Without preserveHistory (classic single-shot mode), it dissolves to alpha 0
            const classicResult = resolveElysiumGlyphTransform(glyph, { ...ctxBase, preserveHistory: false });
            expect(classicResult.visible).toBe(false);
            expect(classicResult.alpha).toBe(0);
        });

        it('never begins camera flight or abandons active shot while vocal singing is in progress', async () => {
            const {
                buildElysiumSpatialMap,
                resolveElysiumContinuousCamera,
            } = await import('../src/elysium/elysiumSpatial');

            const program = compileSonnetProgram([
                { id: '1', fullText: '正在演唱的第一句很长的歌词', startTime: 2.0, endTime: 5.0, words: [] },
                { id: '2', fullText: '接下来即将开始的第二句', startTime: 5.5, endTime: 9.0, words: [] },
            ] as any, 'test-vocal-guard-seed');

            const spatialMap = buildElysiumSpatialMap(program, 1280, 720);
            expect(spatialMap[0].vocalEndTime).toBe(5.0);

            // While singing (e.g. t = 2.5s, 3.8s, 4.95s), camera is strictly locked on shot 0
            const times = [2.0, 2.5, 3.8, 4.5, 4.95, 5.0];
            for (const t of times) {
                const cam = resolveElysiumContinuousCamera(spatialMap, t);
                expect(cam.activeShotIndex).toBe(0);
                expect(cam.flightProgress).toBe(0);
                expect(cam.x).toBe(spatialMap[0].anchor.x);
                expect(cam.y).toBe(spatialMap[0].anchor.y);
            }

            // Only AFTER vocal finishes (t = 5.2s), camera enters flight transition
            const flightCam = resolveElysiumContinuousCamera(spatialMap, 5.2);
            expect(flightCam.flightProgress).toBeGreaterThan(0);
            expect(flightCam.flightProgress).toBeLessThan(1);
        });

        it('clamps container scale and enforces safe viewport framing on wide lyrics across aspect ratios', async () => {
            const { buildElysiumTuning, ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            const tuning = buildElysiumTuning();

            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning,
                theme: { primaryColor: '#292e34', accentColor: '#d96c43', secondaryColor: '#6e7987' },
                isDaylight: true,
                paused: false,
                currentTime: { get: () => 3.0 },
                audioBands: { bass: { get: () => 0.5 }, vocal: { get: () => 0.8 } },
                audioPower: { get: () => 0.6 },
            };
            (runtimeInstance as any).pixi = {
                Color: { shared: { setValue: () => ({ toNumber: () => 0xd96c43 }) } },
                Graphics: class {
                    clear() {}
                    moveTo() { return this; }
                    lineTo() { return this; }
                    stroke() { return this; }
                    circle() { return this; }
                    fill() { return this; }
                },
            };

            // Test both landscape (16:9 1280x720) and portrait (9:16 720x1280)
            const viewports = [
                { w: 1280, h: 720 },
                { w: 720, h: 1280 },
            ];

            for (const vp of viewports) {
                let capturedScale = 1;
                let capturedPos = { x: 0, y: 0 };
                let capturedPivot = { x: 0, y: 0 };

                const mockContainer = {
                    pivot: { set: (x: number, y: number) => { capturedPivot = { x, y }; } },
                    scale: { set: (s: number) => { capturedScale = s; } },
                    position: { set: (x: number, y: number) => { capturedPos = { x, y }; } },
                    rotation: 0,
                    x: 0,
                    y: 0,
                    children: [],
                    addChild: () => {},
                    addChildAt: () => {},
                };

                // Create a wide line of 10 glyphs spanning 1400px
                const glyphs = Array.from({ length: 10 }, (_, i) => ({
                    display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                    baseX: 100 + i * 140, // 100 to 1360 (1260px wide)
                    baseY: vp.h * 0.5,
                    enterX: 0,
                    enterY: 0,
                    entryRotation: 0,
                    finalRotation: 0,
                    startTime: 2.0 + i * 0.3,
                    settleTime: 2.2 + i * 0.3,
                    zDepth: 0,
                    isTextGlyph: true,
                }));

                const mockShotView = {
                    shot: {
                        id: 'wide-shot',
                        kind: 'editorial-column',
                        startTime: 1.0,
                        endTime: 6.0,
                        camera: { zoom: 1, rotation: 0, x: 0, y: 0 },
                    },
                    container: mockContainer as any,
                    segments: [
                        {
                            role: 'hero',
                            fontScale: 1,
                            trackingGlyphs: glyphs,
                            glyphs,
                            guide: { container: { visible: false } },
                            frameDecor: null,
                        },
                    ],
                    baseX: vp.w * 0.5,
                    baseY: vp.h * 0.5,
                    basePivotX: vp.w * 0.5,
                    basePivotY: vp.h * 0.5,
                    mgLayer: { visible: true },
                    haloLayer: {},
                };

                const proj = {
                    screenX: vp.w * 0.5,
                    screenY: vp.h * 0.5,
                    scale: 1.0,
                    rotation: 0,
                    depth: 0,
                    visible: true,
                };

                // Run updateShot3D on shot
                (runtimeInstance as any).updateShot3D(mockShotView, 3.2, vp.w, vp.h, proj, 1.0, true);

                // 1. Scale should auto-fit so the 1260px wide content comfortably fits in the viewport
                expect(capturedScale).toBeLessThanOrEqual(1.04);
                expect(capturedScale * 1260).toBeLessThanOrEqual(vp.w * 0.88);

                // 2. Container position should keep the active focus safely inside the safe margin
                expect(capturedPos.x).toBeGreaterThanOrEqual(vp.w * 0.08);
                expect(capturedPos.x).toBeLessThanOrEqual(vp.w * 0.92);
                expect(capturedPos.y).toBeGreaterThanOrEqual(vp.h * 0.10);
                expect(capturedPos.y).toBeLessThanOrEqual(vp.h * 0.90);

                // 3. Container pivot should actively track the lyrics focus
                expect(Number.isFinite(capturedPivot.x)).toBe(true);
                expect(Number.isFinite(capturedPivot.y)).toBe(true);
            }
        });

        it('completely purges REC/FPS viewfinder overlay from backdrop and foreground containers', async () => {
            const { ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).backdropContainer = { visible: true };
            (runtimeInstance as any).foregroundContainer = { visible: true };
            (runtimeInstance as any).backdropGraphics = { clear: () => {} };
            (runtimeInstance as any).backdropHorizon = { clear: () => {} };
            (runtimeInstance as any).foregroundGraphics = { clear: () => {} };

            // Calling setupHud
            (runtimeInstance as any).setupHud(1280, 720);

            // Containers must be hidden
            expect((runtimeInstance as any).backdropContainer.visible).toBe(false);
            expect((runtimeInstance as any).foregroundContainer.visible).toBe(false);

            // Calling updateHudFrame
            (runtimeInstance as any).updateHudFrame(10.5, 1280, 720, 0.5, 0.6);
            expect((runtimeInstance as any).backdropContainer.visible).toBe(false);
            expect((runtimeInstance as any).foregroundContainer.visible).toBe(false);
        });

        it('never renders laser playhead or singing progress under background outline decoration layer', async () => {
            const { buildElysiumTuning, ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            const tuning = buildElysiumTuning();

            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning,
                theme: { primaryColor: '#292e34', accentColor: '#d96c43', secondaryColor: '#6e7987' },
                isDaylight: true,
                paused: false,
                currentTime: { get: () => 2.5 },
                audioBands: { bass: { get: () => 0.5 }, vocal: { get: () => 0.8 } },
                audioPower: { get: () => 0.6 },
            };

            let playheadDrawnCalls = 0;
            const mockPlayhead = {
                clear: () => {},
                moveTo: () => { playheadDrawnCalls++; return mockPlayhead; },
                lineTo: () => mockPlayhead,
                stroke: () => mockPlayhead,
                circle: () => mockPlayhead,
                fill: () => mockPlayhead,
            };

            (runtimeInstance as any).pixi = {
                Color: { shared: { setValue: () => ({ toNumber: () => 0xd96c43 }) } },
                Graphics: class {
                    constructor() { return mockPlayhead as any; }
                },
            };

            const mockContainer = {
                pivot: { set: () => {} },
                scale: { set: () => {} },
                position: { set: () => {} },
                rotation: 0,
                x: 0,
                y: 0,
                children: [],
                addChild: () => {},
                addChildAt: () => {},
            };

            const decoGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 200,
                baseY: 200,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.3,
                zDepth: -0.4,
                isTextGlyph: true,
            };

            // Shot with ONLY background decoration layer
            const mockShotView = {
                shot: {
                    id: 'deco-shot',
                    kind: 'editorial-column',
                    startTime: 1.0,
                    endTime: 5.0,
                    camera: { zoom: 1, rotation: 0, x: 0, y: 0 },
                },
                container: mockContainer as any,
                segments: [
                    {
                        role: 'decoration',
                        fontScale: 3.5,
                        trackingGlyphs: [decoGlyph],
                        glyphs: [decoGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                ],
                baseX: 640,
                baseY: 360,
                basePivotX: 640,
                basePivotY: 360,
                mgLayer: { visible: true },
                haloLayer: {},
            };

            const proj = { screenX: 640, screenY: 360, scale: 1.0, rotation: 0, depth: 0, visible: true };

            (runtimeInstance as any).updateShot3D(mockShotView, 2.5, 1280, 720, proj, 1.0, true);

            // Playhead drawing calls must be 0 for decoration layer!
            expect(playheadDrawnCalls).toBe(0);
            // Decoration glyph alpha remains ambient watermark, not flashing 1.0
            expect(decoGlyph.display.alpha).toBeLessThan(0.40);
        });

        it('completely hides background outline decoration layers on non-focus shots and preserves true 3D spatial positioning without safe-margin clamping', async () => {
            const { buildElysiumTuning, ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            const tuning = buildElysiumTuning();

            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning,
                theme: { primaryColor: '#292e34', accentColor: '#d96c43', secondaryColor: '#6e7987' },
                isDaylight: false,
                paused: false,
                currentTime: { get: () => 10.0 },
                audioBands: { bass: { get: () => 0 }, vocal: { get: () => 0 } },
                audioPower: { get: () => 0 },
            };

            (runtimeInstance as any).pixi = {
                Color: { shared: { setValue: () => ({ toNumber: () => 0xd96c43 }) } },
                Graphics: class {
                    clear() {}
                    moveTo() { return this; }
                    lineTo() { return this; }
                    stroke() { return this; }
                    circle() { return this; }
                    fill() { return this; }
                },
            };

            let capturedPos = { x: 0, y: 0 };
            const mockContainer = {
                pivot: { set: () => {}, x: 0, y: 0 },
                scale: { set: () => {} },
                position: { set: (x: number, y: number) => { capturedPos = { x, y }; } },
                rotation: 0,
                x: 0,
                y: 0,
                children: [],
                addChild: () => {},
                addChildAt: () => {},
            };

            const decoGlyph = {
                display: { alpha: 0.5, visible: true, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 200,
                baseY: 200,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.3,
                zDepth: 0,
                isTextGlyph: true,
            };

            const textGlyph = {
                display: { alpha: 0.8, visible: true, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 200,
                baseY: 200,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.3,
                zDepth: 0,
                isTextGlyph: true,
            };

            const mockShotView = {
                shot: {
                    id: 'past-shot',
                    kind: 'editorial-column',
                    startTime: 1.0,
                    endTime: 5.0,
                    camera: { zoom: 1, rotation: 0, x: 0, y: 0 },
                },
                container: mockContainer as any,
                segments: [
                    {
                        segmentIndex: 0,
                        role: 'decoration',
                        fontScale: 3.5,
                        trackingGlyphs: [decoGlyph],
                        glyphs: [decoGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                    {
                        segmentIndex: 0,
                        role: 'hero',
                        fontScale: 1.0,
                        trackingGlyphs: [textGlyph],
                        glyphs: [textGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                ],
                baseX: 640,
                baseY: 360,
                basePivotX: 640,
                basePivotY: 360,
                mgLayer: { visible: true },
                haloLayer: {},
            };

            // Non-focused shot positioned far off-screen to the left (e.g. screenX = -350)
            const proj = { screenX: -350, screenY: 360, scale: 0.8, rotation: 0, depth: 100, visible: true };

            // Call updateShot3D with isCurrentFocus = false
            (runtimeInstance as any).updateShot3D(mockShotView, 10.0, 1280, 720, proj, 0.22, false);

            // 1. Position must remain at true 3D projection (-350) and NOT be forced to minSafeX (e.g. 128)
            expect(capturedPos.x).toBe(-350);

            // 2. All decoration glyphs on non-focus shots must be completely hidden
            expect(decoGlyph.display.visible).toBe(false);
            expect(decoGlyph.display.alpha).toBe(0);

            // 3. Normal text glyphs remain visible for historical spatial presence
            expect(textGlyph.display.visible).toBe(true);
        });

        it('arbitrates background outline decoration in active shot so non-singing outline layers are hidden and never overlap', async () => {
            const { buildElysiumTuning, ElysiumPixiRuntime } = await import('../src/elysium/createElysiumPixiRuntime');
            const tuning = buildElysiumTuning();

            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning,
                theme: { primaryColor: '#292e34', accentColor: '#d96c43', secondaryColor: '#6e7987' },
                isDaylight: true,
                paused: false,
                currentTime: { get: () => 2.5 },
                audioBands: { bass: { get: () => 0 }, vocal: { get: () => 0 } },
                audioPower: { get: () => 0 },
            };

            (runtimeInstance as any).pixi = {
                Color: { shared: { setValue: () => ({ toNumber: () => 0xd96c43 }) } },
                Graphics: class {
                    clear() {}
                    moveTo() { return this; }
                    lineTo() { return this; }
                    stroke() { return this; }
                    circle() { return this; }
                    fill() { return this; }
                },
            };

            const mockContainer = {
                pivot: { set: () => {}, x: 0, y: 0 },
                scale: { set: () => {} },
                position: { set: () => {} },
                rotation: 0,
                x: 0,
                y: 0,
                children: [],
                addChild: () => {},
                addChildAt: () => {},
            };

            // Line 1 glyphs (Singing now: 2.0s - 3.5s)
            const line1TextGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 200,
                baseY: 200,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.5,
                zDepth: 0,
                isTextGlyph: true,
            };
            const line1DecoGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 180,
                baseY: 190,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.5,
                zDepth: 0,
                isTextGlyph: true,
            };

            // Line 2 glyphs (Not singing yet: 4.0s - 5.5s)
            const line2TextGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 200,
                baseY: 300,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 4.0,
                settleTime: 4.5,
                zDepth: 0,
                isTextGlyph: true,
            };
            const line2DecoGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 180,
                baseY: 290,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 4.0,
                settleTime: 4.5,
                zDepth: 0,
                isTextGlyph: true,
            };

            // Duplicate decoration glyph (e.g. dec2 from Sonnet retro collage)
            const duplicateDecoGlyph = {
                display: { alpha: 0, visible: false, scale: { set: () => {} }, position: { set: () => {} }, rotation: 0 },
                baseX: 250,
                baseY: 250,
                enterX: 0,
                enterY: 0,
                entryRotation: 0,
                finalRotation: 0,
                startTime: 2.0,
                settleTime: 2.5,
                zDepth: 0,
                isTextGlyph: true,
            };

            const mockShotView = {
                shot: {
                    id: 'multi-line-shot',
                    kind: 'editorial-column',
                    startTime: 1.0,
                    endTime: 6.0,
                    camera: { zoom: 1, rotation: 0, x: 0, y: 0 },
                },
                container: mockContainer as any,
                segments: [
                    // Decoration for line 1 (active)
                    {
                        segmentIndex: 0,
                        role: 'decoration',
                        fontScale: 3.5,
                        trackingGlyphs: [line1DecoGlyph],
                        glyphs: [line1DecoGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                    // Text for line 1 (active)
                    {
                        segmentIndex: 0,
                        role: 'hero',
                        fontScale: 1.0,
                        trackingGlyphs: [line1TextGlyph],
                        glyphs: [line1TextGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                    // Decoration for line 2 (not singing)
                    {
                        segmentIndex: 1,
                        role: 'decoration',
                        fontScale: 3.5,
                        trackingGlyphs: [line2DecoGlyph],
                        glyphs: [line2DecoGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                    // Text for line 2 (not singing)
                    {
                        segmentIndex: 1,
                        role: 'support',
                        fontScale: 0.9,
                        trackingGlyphs: [line2TextGlyph],
                        glyphs: [line2TextGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                    // Duplicate decoration (dec2)
                    {
                        segmentIndex: 0,
                        role: 'decoration',
                        fontScale: 2.5,
                        trackingGlyphs: [duplicateDecoGlyph],
                        glyphs: [duplicateDecoGlyph],
                        guide: { container: { visible: false } },
                        frameDecor: null,
                    },
                ],
                baseX: 640,
                baseY: 360,
                basePivotX: 640,
                basePivotY: 360,
                mgLayer: { visible: true },
                haloLayer: {},
            };

            const proj = { screenX: 640, screenY: 360, scale: 1.0, rotation: 0, depth: 0, visible: true };

            // When time = 2.5s (Line 1 is singing)
            (runtimeInstance as any).updateShot3D(mockShotView, 2.5, 1280, 720, proj, 1.0, true);

            // 1. Line 1 outline decoration must be visible as ambient watermark
            expect(line1DecoGlyph.display.visible).toBe(true);
            expect(line1DecoGlyph.display.alpha).toBeGreaterThan(0.15);

            // 2. Line 2 outline decoration (not singing) MUST BE HIDDEN to prevent overlap
            expect(line2DecoGlyph.display.visible).toBe(false);
            expect(line2DecoGlyph.display.alpha).toBe(0);

            // 3. Duplicate decoration (dec2) MUST BE HIDDEN to prevent outline stacking
            expect(duplicateDecoGlyph.display.visible).toBe(false);
            expect(duplicateDecoGlyph.display.alpha).toBe(0);

            // When time advances to 4.5s (Line 2 is now singing)
            (runtimeInstance as any).updateShot3D(mockShotView, 4.5, 1280, 720, proj, 1.0, true);

            // 4. Line 1 outline decoration is now hidden
            expect(line1DecoGlyph.display.visible).toBe(false);
            expect(line1DecoGlyph.display.alpha).toBe(0);

            // 5. Line 2 outline decoration is now visible
            expect(line2DecoGlyph.display.visible).toBe(true);
            expect(line2DecoGlyph.display.alpha).toBeGreaterThan(0.15);
        });

        it('supports hot setTuning on ElysiumPixiRuntime without tearing down WebGL or dropping canvas', async () => {
            const { ElysiumPixiRuntime, buildElysiumTuning } = await import('../src/elysium/createElysiumPixiRuntime');
            const runtimeInstance = Object.create(ElysiumPixiRuntime.prototype);
            (runtimeInstance as any).options = {
                tuning: buildElysiumTuning(),
                paused: false,
            };
            (runtimeInstance as any).destroyed = false;

            let renderedOnce = false;
            runtimeInstance.renderOnce = () => { renderedOnce = true; };

            runtimeInstance.setTuning({
                cameraIntensity: 0.85,
                typographyMotion: 1.25,
            });

            expect((runtimeInstance as any).options.tuning.cameraIntensity).toBe(0.85);
            expect((runtimeInstance as any).options.tuning.typographyMotion).toBe(1.25);
            expect(renderedOnce).toBe(false);

            (runtimeInstance as any).options.paused = true;
            runtimeInstance.setTuning({
                cameraIntensity: 0.4,
            });
            expect((runtimeInstance as any).options.tuning.cameraIntensity).toBe(0.4);
            expect(renderedOnce).toBe(true);
        });
    });
});




