// Independent, bespoke Pixi scene builder for the Syzygy (朔望) astronomical lyric visualizer.
// Builds complete celestial scenes: Keplerian orbits, coronal bursts, astrolabe reticles,
// and astronomical typographic compositions with zero dependency on Sonnet.
import type { Theme } from '../vendor/folia/types';
import { normalizeFontWeight, resolveThemeFontStack } from '../vendor/folia/utils/fontStacks';
import type {
    SyzygyParagraph,
    SyzygySegmentRole,
    SyzygySemanticSegment,
    SyzygyShot,
} from './syzygyTypes';
import { buildSyzygyShotLayout, type SyzygyGlyphLayout } from './syzygyLayout';
import { buildSyzygyCelestialMg, type CelestialMgView } from './syzygyCelestialMg';
import {
    resolveSyzygyGlyphTransform,
    type SyzygyGlyphContext,
    type SyzygyGlyphMotionProps,
} from './syzygyMotion';

type PixiModule = typeof import('pixi.js');

const colorNumber = (pixi: PixiModule, color: string) => pixi.Color.shared.setValue(color).toNumber();

export interface SyzygyGlyphView {
    container: import('pixi.js').Container;
    coreText: import('pixi.js').Text;
    haloText: import('pixi.js').Text | null;
    caRedText: import('pixi.js').Text | null;
    caCyanText: import('pixi.js').Text | null;
    bailyBeadGfx: import('pixi.js').Graphics | null;
    layout: SyzygyGlyphLayout;
    motionProps: SyzygyGlyphMotionProps;
    charIndex: number;
    totalChars: number;
    role: SyzygySegmentRole;
}

export interface SyzygySegmentView {
    segment: SyzygySemanticSegment;
    container: import('pixi.js').Container;
    glyphs: SyzygyGlyphView[];
    role: SyzygySegmentRole;
}

export interface SyzygyShotView {
    shot: SyzygyShot;
    container: import('pixi.js').Container;
    celestialMg: CelestialMgView;
    segments: SyzygySegmentView[];
    allGlyphs: SyzygyGlyphView[];
    hudContainer: import('pixi.js').Container;
    basePivotX: number;
    basePivotY: number;
    update: (time: number, bass: number, vocal: number, power: number) => void;
    destroy: () => void;
}

export interface SyzygySceneView {
    paragraph: SyzygyParagraph;
    container: import('pixi.js').Container;
    shots: SyzygyShotView[];
    activeShotIndex: number;
    update: (time: number, bass: number, vocal: number, power: number) => void;
    destroy: () => void;
}

export interface SyzygySceneBuildOptions {
    host: HTMLDivElement;
    theme: Theme;
    lyricsFontScale: number;
    staticMode: boolean;
    transparentBackground: boolean;
}

/**
 * Creates a Baily's Bead / diamond ring coronal flash spark.
 */
const createBailyBeadGraphics = (pixi: PixiModule, accentColor: number, size: number) => {
    const gfx = new pixi.Graphics();
    // 4-pointed radiant star with center core
    gfx.circle(0, 0, size * 0.35)
        .fill({ color: 0xffffff, alpha: 0.95 });
    gfx.circle(0, 0, size * 0.7)
        .fill({ color: accentColor, alpha: 0.55 });

    // Ray spikes
    const spikeLen = size * 2.4;
    gfx.moveTo(-spikeLen, 0).lineTo(spikeLen, 0).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    gfx.moveTo(0, -spikeLen).lineTo(0, spikeLen).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    gfx.moveTo(-spikeLen * 0.6, -spikeLen * 0.6).lineTo(spikeLen * 0.6, spikeLen * 0.6).stroke({ color: accentColor, width: 1, alpha: 0.6 });
    gfx.moveTo(-spikeLen * 0.6, spikeLen * 0.6).lineTo(spikeLen * 0.6, -spikeLen * 0.6).stroke({ color: accentColor, width: 1, alpha: 0.6 });

    gfx.alpha = 0;
    return gfx;
};

/**
 * Builds the astronomical HUD (precision reticles, crosshairs, coordinate frames).
 */
const buildAstrometricHud = (
    pixi: PixiModule,
    width: number,
    height: number,
    theme: Theme,
    shot: SyzygyShot,
) => {
    const { Container, Graphics, Text, TextStyle } = pixi;
    const hud = new Container();

    const primaryCol = colorNumber(pixi, theme.primaryColor);
    const accentCol = colorNumber(pixi, theme.accentColor);
    const gfx = new Graphics();
    hud.addChild(gfx);

    const marginX = width * 0.05;
    const marginY = height * 0.06;

    // Corner targeting reticles
    const reticleSize = 14;
    const corners = [
        { x: marginX, y: marginY },
        { x: width - marginX, y: marginY },
        { x: marginX, y: height - marginY },
        { x: width - marginX, y: height - marginY },
    ];

    corners.forEach(c => {
        gfx.moveTo(c.x - reticleSize, c.y).lineTo(c.x + reticleSize, c.y).stroke({ color: primaryCol, width: 1, alpha: 0.28 });
        gfx.moveTo(c.x, c.y - reticleSize).lineTo(c.x, c.y + reticleSize).stroke({ color: primaryCol, width: 1, alpha: 0.28 });
        gfx.circle(c.x, c.y, 2).fill({ color: accentCol, alpha: 0.45 });
    });

    // Outer framing boundary ticks
    const tickStep = 60;
    for (let x = marginX + tickStep; x < width - marginX; x += tickStep) {
        gfx.moveTo(x, marginY - 3).lineTo(x, marginY + 3).stroke({ color: primaryCol, width: 0.8, alpha: 0.18 });
        gfx.moveTo(x, height - marginY - 3).lineTo(x, height - marginY + 3).stroke({ color: primaryCol, width: 0.8, alpha: 0.18 });
    }

    // Top astronomical telemetry readout
    const monoFont = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace';
    const topStyle = new TextStyle({
        fontFamily: monoFont,
        fontSize: Math.max(9, Math.min(12, width * 0.011)),
        fill: primaryCol,
        letterSpacing: 1.5,
    });

    const topText = new Text({
        text: `✦ SYZYGY ASTROMETRY · EPOCH J2026.5 · TRANSIT #${shot.celestialSeed % 99 + 1}`,
        style: topStyle,
    });
    topText.alpha = 0.38;
    topText.position.set(marginX + reticleSize * 1.5, marginY - 6);
    hud.addChild(topText);

    return hud;
};

/**
 * Builds an independent Syzygy paragraph scene with all shots and astronomical typography.
 */
export const buildSyzygyScene = (
    pixi: PixiModule,
    options: SyzygySceneBuildOptions,
    paragraph: SyzygyParagraph,
): SyzygySceneView => {
    const { Container, Text, TextStyle } = pixi;
    const width = Math.max(options.host.clientWidth, 320);
    const height = Math.max(options.host.clientHeight, 240);

    const sceneContainer = new Container();

    const primaryColorHex = options.theme.primaryColor;
    const accentColorHex = options.theme.accentColor;
    const accentCol = colorNumber(pixi, accentColorHex);

    const baseFontFamily = resolveThemeFontStack(options.theme);
    const renderWeight = normalizeFontWeight(options.theme.fontWeight) ?? 600;

    const shotViews: SyzygyShotView[] = paragraph.shots.map(shot => {
        const shotContainer = new Container();
        sceneContainer.addChild(shotContainer);

        // 1. Procedural Celestial MG Layer (Astrolabe, orbits, corona, stardust)
        const celestialMg = buildSyzygyCelestialMg(pixi, shot, options.theme, width, height);
        shotContainer.addChild(celestialMg.container);

        // 2. Astrometric HUD (Precision reticles, ticks, telemetry)
        const hudContainer = buildAstrometricHud(pixi, width, height, options.theme, shot);
        shotContainer.addChild(hudContainer);

        // 3. Typographic Layout
        const segmentLayouts = buildSyzygyShotLayout(shot, width, height, options.lyricsFontScale);
        const segmentViews: SyzygySegmentView[] = [];
        const allGlyphs: SyzygyGlyphView[] = [];

        const textLayer = new Container();
        shotContainer.addChild(textLayer);

        segmentLayouts.forEach(segLayout => {
            const segContainer = new Container();
            textLayer.addChild(segContainer);

            const isHero = segLayout.segment.role === 'hero';
            const isSemiHero = segLayout.segment.role === 'semi-hero';
            const isAnnotation = segLayout.segment.role === 'annotation';

            // Text Styles tailored to celestial role
            const fontSize = segLayout.fontSize;
            const coreWeight = isHero ? 800 : isSemiHero ? 700 : isAnnotation ? 400 : renderWeight;

            const coreStyle = new TextStyle({
                fontFamily: isAnnotation ? '"IBM Plex Mono", Consolas, monospace' : baseFontFamily,
                fontWeight: String(coreWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize,
                fill: isAnnotation ? primaryColorHex : isHero ? '#ffffff' : primaryColorHex,
                align: 'center',
                letterSpacing: isAnnotation ? 1.5 : isHero ? 1.0 : 0.5,
                dropShadow: isHero ? {
                    color: accentColorHex,
                    alpha: 0.75,
                    blur: Math.max(8, fontSize * 0.22),
                    distance: 0,
                } : undefined,
                padding: Math.max(16, fontSize * 0.3),
            });

            const haloStyle = (isHero || isSemiHero) ? new TextStyle({
                fontFamily: baseFontFamily,
                fontWeight: String(coreWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize,
                fill: accentColorHex,
                align: 'center',
                dropShadow: {
                    color: accentColorHex,
                    alpha: 0.9,
                    blur: Math.max(16, fontSize * 0.45),
                    distance: 0,
                },
                padding: Math.max(24, fontSize * 0.5),
            }) : null;

            // Relativistic Doppler Chromatic Aberration Styles
            const caCyanStyle = (isHero || isSemiHero) ? new TextStyle({
                fontFamily: baseFontFamily,
                fontWeight: String(coreWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize,
                fill: '#00e5ff',
                align: 'center',
            }) : null;

            const caRedStyle = (isHero || isSemiHero) ? new TextStyle({
                fontFamily: baseFontFamily,
                fontWeight: String(coreWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize,
                fill: '#ff3366',
                align: 'center',
            }) : null;

            const glyphViews: SyzygyGlyphView[] = segLayout.glyphs.map((gLayout, gIdx) => {
                const glyphContainer = new Container();
                glyphContainer.position.set(gLayout.baseX, gLayout.baseY);
                segContainer.addChild(glyphContainer);

                // Halo glow layer
                let haloText: import('pixi.js').Text | null = null;
                if (haloStyle) {
                    haloText = new Text({ text: gLayout.char, style: haloStyle });
                    haloText.anchor.set(0.5);
                    haloText.alpha = 0;
                    glyphContainer.addChild(haloText);
                }

                // Chromatic aberration layers
                let caCyanText: import('pixi.js').Text | null = null;
                let caRedText: import('pixi.js').Text | null = null;
                if (caCyanStyle && caRedStyle) {
                    caCyanText = new Text({ text: gLayout.char, style: caCyanStyle });
                    caCyanText.anchor.set(0.5);
                    caCyanText.alpha = 0;
                    glyphContainer.addChild(caCyanText);

                    caRedText = new Text({ text: gLayout.char, style: caRedStyle });
                    caRedText.anchor.set(0.5);
                    caRedText.alpha = 0;
                    glyphContainer.addChild(caRedText);
                }

                // Core crisp text
                const coreText = new Text({ text: gLayout.char, style: coreStyle });
                coreText.anchor.set(0.5);
                coreText.alpha = 0;
                glyphContainer.addChild(coreText);

                // Baily's bead spark for hero characters
                let bailyBeadGfx: import('pixi.js').Graphics | null = null;
                if (isHero) {
                    bailyBeadGfx = createBailyBeadGraphics(pixi, accentCol, fontSize * 0.45);
                    glyphContainer.addChild(bailyBeadGfx);
                }

                const motionProps: SyzygyGlyphMotionProps = {
                    baseX: gLayout.baseX,
                    baseY: gLayout.baseY,
                    enterX: gLayout.enterX,
                    enterY: gLayout.enterY,
                    entryRotation: gLayout.rotation * 0.5,
                    finalRotation: gLayout.rotation,
                    startTime: gLayout.startTime,
                    settleTime: gLayout.settleTime,
                    zDepth: gLayout.zDepth,
                    caOffset: isHero ? 6 : 3,
                };

                const gView: SyzygyGlyphView = {
                    container: glyphContainer,
                    coreText,
                    haloText,
                    caRedText,
                    caCyanText,
                    bailyBeadGfx,
                    layout: gLayout,
                    motionProps,
                    charIndex: gIdx,
                    totalChars: segLayout.glyphs.length,
                    role: segLayout.segment.role,
                };

                allGlyphs.push(gView);
                return gView;
            });

            segmentViews.push({
                segment: segLayout.segment,
                container: segContainer,
                glyphs: glyphViews,
                role: segLayout.segment.role,
            });
        });

        // Frame update function for this shot
        const update = (time: number, bass: number, vocal: number, power: number) => {
            // Update procedural background
            celestialMg.update(time, bass, vocal, power);

            // Update all glyphs
            allGlyphs.forEach(gv => {
                const ctx: SyzygyGlyphContext = {
                    time,
                    shotStartTime: shot.startTime,
                    shotEndTime: shot.endTime,
                    shotKind: shot.kind,
                    role: gv.role,
                    glyphIndex: gv.charIndex,
                    totalGlyphs: gv.totalChars,
                    motion: 1.0,
                };

                const resolved = resolveSyzygyGlyphTransform(gv.motionProps, ctx);

                if (!resolved.visible) {
                    gv.container.visible = false;
                    return;
                }

                gv.container.visible = true;

                // Microgravity Libration drift when settled
                let libX = 0;
                let libY = 0;
                let libRot = 0;
                if (time >= gv.motionProps.settleTime && time < shot.endTime - 0.4) {
                    const libT = time - gv.motionProps.settleTime;
                    libX = Math.sin(libT * 1.35 + gv.charIndex * 0.5) * 1.5;
                    libY = Math.cos(libT * 1.10 + gv.charIndex * 0.7) * 1.5;
                    libRot = Math.sin(libT * 0.8 + gv.charIndex * 0.3) * 0.003;
                }

                gv.container.position.set(resolved.x + libX, resolved.y + libY);
                gv.container.scale.set(resolved.scale);
                gv.container.rotation = resolved.rotation + libRot;

                // Core alpha
                gv.coreText.alpha = resolved.alpha;

                // Coronal Halo Glow
                if (gv.haloText) {
                    const audioBoost = bass * 0.35 + vocal * 0.2;
                    gv.haloText.alpha = Math.min(1.0, resolved.haloAlpha * (1 + audioBoost));
                    gv.haloText.scale.set(resolved.haloScale);
                }

                // Relativistic Doppler Chromatic Aberration
                if (gv.caCyanText && gv.caRedText) {
                    if (resolved.caOffset > 0.4) {
                        const caAlpha = Math.min(0.55, resolved.caOffset * 0.12) * resolved.alpha;
                        gv.caCyanText.visible = true;
                        gv.caCyanText.alpha = caAlpha;
                        gv.caCyanText.position.set(-resolved.caOffset, 0);

                        gv.caRedText.visible = true;
                        gv.caRedText.alpha = caAlpha;
                        gv.caRedText.position.set(resolved.caOffset, 0);
                    } else {
                        gv.caCyanText.visible = false;
                        gv.caRedText.visible = false;
                    }
                }

                // Baily's Bead coronal flash at lock-in
                if (gv.bailyBeadGfx) {
                    const enterDuration = Math.max(0.12, gv.motionProps.settleTime - gv.motionProps.startTime);
                    const enterU = (time - gv.motionProps.startTime) / enterDuration;
                    if (enterU >= 0.72 && enterU <= 0.98) {
                        const flashPhase = (enterU - 0.72) / 0.26;
                        const flashAlpha = Math.sin(flashPhase * Math.PI) * 0.95;
                        gv.bailyBeadGfx.visible = true;
                        gv.bailyBeadGfx.alpha = flashAlpha;
                        gv.bailyBeadGfx.scale.set(0.8 + flashAlpha * 0.5);
                    } else {
                        gv.bailyBeadGfx.visible = false;
                    }
                }
            });
        };

        const destroy = () => {
            celestialMg.destroy();
            hudContainer.destroy({ children: true });
            shotContainer.destroy({ children: true });
        };

        // Center pivot for camera transformations
        shotContainer.pivot.set(width / 2, height / 2);
        shotContainer.position.set(width / 2, height / 2);

        return {
            shot,
            container: shotContainer,
            celestialMg,
            segments: segmentViews,
            allGlyphs,
            hudContainer,
            basePivotX: width / 2,
            basePivotY: height / 2,
            update,
            destroy,
        };
    });

    const update = (time: number, bass: number, vocal: number, power: number) => {
        shotViews.forEach(sv => {
            // Only update active shot or shots in close temporal proximity
            if (time >= sv.shot.startTime - 0.2 && time <= sv.shot.endTime + 0.2) {
                sv.container.visible = true;
                sv.update(time, bass, vocal, power);
            } else {
                sv.container.visible = false;
            }
        });
    };

    const destroy = () => {
        shotViews.forEach(sv => sv.destroy());
        sceneContainer.destroy({ children: true });
    };

    return {
        paragraph,
        container: sceneContainer,
        shots: shotViews,
        activeShotIndex: 0,
        update,
        destroy,
    };
};
