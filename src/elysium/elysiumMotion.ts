// Pure absolute-time motion mathematics for Elysium visualizer.
// Extends and reimagines Sonnet typography with high-tension tactile snap entry and staggered spatial drift exit.
import { clamp01, easeSonnetInOut } from '../vendor/folia/components/visualizer/sonnet/sonnetMotion';
import type { SonnetShotKind } from '../vendor/folia/components/visualizer/sonnet/types';
import type { SonnetSegmentRole } from '../vendor/folia/components/visualizer/sonnet/sonnetTypographyLayout';
import { isSonnetEmphasisRole } from '../vendor/folia/components/visualizer/sonnet/sonnetTypographyLayout';

export interface ElysiumGlyphMotionProps {
    baseX: number;
    baseY: number;
    enterX: number;
    enterY: number;
    entryRotation: number;
    finalRotation: number;
    startTime: number;
    settleTime: number;
    zDepth: number;
    caOffset?: number;
    ghostDuration?: number;
}

export interface ElysiumGlyphContext {
    time: number;
    shotStartTime: number;
    shotEndTime: number;
    shotKind: SonnetShotKind;
    role: SonnetSegmentRole;
    glyphIndex: number;
    totalGlyphs: number;
    motion: number;
    preserveHistory?: boolean;
}

export interface ElysiumResolvedGlyphFrame {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    alpha: number;
    visible: boolean;
    haloAlpha: number;
    haloScale: number;
    caOffset: number;
    ghostProgress: number;
    ghostActive: boolean;
}

/**
 * Tactile PV-style elastic overshoot snap curve.
 * Rapidly accelerates toward 1.0, slightly overshoots with dynamic damping, then locks cleanly onto 1.0.
 */
export const easeElysiumSnap = (t: number): number => {
    const u = clamp01(t);
    if (u >= 1) return 1;
    const base = 1 - Math.pow(1 - u, 3.2);
    const overshoot = Math.sin(u * Math.PI) * Math.pow(1 - u, 1.2) * 0.28;
    return base + overshoot;
};

/**
 * Accelerating exit curve for graceful dissipation.
 */
export const easeElysiumExit = (t: number): number => {
    const u = clamp01(t);
    return Math.pow(u, 2.2);
};

/**
 * Resolves complete 2D transform, alpha, halo, and chromatic dispersion for an Elysium glyph at absolute time `time`.
 */
export const resolveElysiumGlyphTransform = (
    glyph: ElysiumGlyphMotionProps,
    ctx: ElysiumGlyphContext,
): ElysiumResolvedGlyphFrame => {
    const { time, shotStartTime, shotEndTime, shotKind, role, glyphIndex, totalGlyphs, motion } = ctx;

    // 1. Pre-entry check: before character arrival timestamp
    if (time < glyph.startTime) {
        return {
            x: glyph.baseX,
            y: glyph.baseY,
            scale: 0.8,
            rotation: glyph.finalRotation,
            alpha: 0,
            visible: false,
            haloAlpha: 0,
            haloScale: 0.8,
            caOffset: 0,
            ghostProgress: 0,
            ghostActive: false,
        };
    }

    // 2. Entrance phase calculation
    const rawEnterDuration = Math.max(0.08, glyph.settleTime - glyph.startTime);
    // Crisp snappy entrance duration
    const enterDuration = Math.min(0.40, Math.max(0.18, rawEnterDuration * 0.72));
    const enterU = clamp01((time - glyph.startTime) / enterDuration);
    const enterSnappedProgress = easeElysiumSnap(enterU);
    const enterOffset = (1 - clamp01(enterSnappedProgress)) * motion;

    // Dynamic trajectory arc: add subtle normal curvature to straight linear vector
    const directDist = Math.hypot(glyph.enterX, glyph.enterY) || 24;
    const normX = (glyph.enterY / directDist) || 0;
    const normY = (-glyph.enterX / directDist) || 1;
    const arcCurvature = Math.sin(enterU * Math.PI) * (directDist * 0.26) * (glyphIndex % 2 === 0 ? 1 : -1) * motion;

    const entryOffsetX = glyph.enterX * enterOffset + normX * arcCurvature;
    const entryOffsetY = glyph.enterY * enterOffset + normY * arcCurvature;

    // Entrance scale & rotation impulse
    const isHero = isSonnetEmphasisRole(role);
    let baseScale: number;
    if (isHero && shotKind === 'type-impact') {
        // Dramatic impact zoom: 0.48 -> 1.05 -> 1.00
        baseScale = 0.48 + enterSnappedProgress * 0.52;
    } else if (isHero) {
        // Hero elastic presence: 0.65 -> 1.04 -> 1.00
        baseScale = 0.65 + enterSnappedProgress * 0.35;
    } else {
        // Support text snap: 0.82 -> 1.02 -> 1.00
        baseScale = 0.82 + enterSnappedProgress * 0.18;
    }

    const entryRotationImpulse = glyph.entryRotation * enterOffset * 1.4
        + Math.sin(enterU * Math.PI) * 0.02 * (glyphIndex % 2 === 0 ? 1 : -1);
    const currentRotation = glyph.finalRotation + entryRotationImpulse;

    // Entrance alpha
    const enterAlpha = enterU < 0.12 ? enterU / 0.12 : 1.0;

    // 3. Exit phase calculation (Choreographed Staggered Departure)
    // Exit starts near the end of the shot
    const shotDuration = Math.max(0.2, shotEndTime - shotStartTime);
    const exitLeadWindow = Math.min(0.52, Math.max(0.22, shotDuration * 0.20));
    const shotExitStart = shotEndTime - exitLeadWindow;

    // Staggered departure wave per character
    const safeTotalGlyphs = Math.max(1, totalGlyphs);
    const staggerDelay = (glyphIndex / safeTotalGlyphs) * (exitLeadWindow * 0.48);
    const charExitStart = shotExitStart + staggerDelay;
    const charExitDuration = Math.max(0.14, exitLeadWindow * 0.62);

    let exitAlpha = 1.0;
    let exitLiftX = 0;
    let exitLiftY = 0;
    let exitScale = 1.0;
    let exitRotation = 0;
    let exitCAFlare = 1.0;

    if (time >= charExitStart) {
        if (ctx.preserveHistory) {
            // In 3D spatial matrix mode (Sonnet + Fume), characters remain settled in their
            // pristine architectural coordinates; the spatial shot container manages history alpha.
            exitAlpha = 1.0;
            exitLiftX = 0;
            exitLiftY = 0;
            exitScale = 1.0;
            exitRotation = 0;
            exitCAFlare = 1.0;
        } else {
            const exitU = clamp01((time - charExitStart) / charExitDuration);
            const exitEased = easeElysiumExit(exitU);

            // Smooth alpha falloff
            exitAlpha = Math.max(0, 1 - Math.pow(exitU, 1.6));

            // Spatial lift-off / drift along layout angle
            const baseLiftDirX = glyph.enterX !== 0 ? -glyph.enterX * 0.7 : 14 * (glyphIndex % 2 === 0 ? 1 : -1);
            const baseLiftDirY = glyph.enterY !== 0 ? -glyph.enterY * 0.7 : -26;

            exitLiftX = baseLiftDirX * exitEased * motion;
            exitLiftY = baseLiftDirY * exitEased * motion;

            // Elegant dimensional dissolve: text expands subtly into light
            exitScale = 1.0 + exitEased * 0.14;
            exitRotation = glyph.entryRotation * exitEased * 1.8;

            // Prismatic flare on exit
            exitCAFlare = 1.0 + exitEased * 1.6;
        }
    }

    // Combined alpha and visibility
    const combinedAlpha = enterAlpha * exitAlpha;
    const visible = combinedAlpha > 0.005;

    // Combined coordinates
    const finalX = glyph.baseX + entryOffsetX + exitLiftX;
    const finalY = glyph.baseY + entryOffsetY + exitLiftY;
    const finalScale = baseScale * exitScale;
    const finalRotation = currentRotation + exitRotation;

    // Halo properties
    const haloAlpha = (1 - enterU * 0.28) * exitAlpha;
    const haloScale = finalScale * (1.08 - enterU * 0.08);

    // Chromatic dispersion (starts separated on impact, merges, then flares slightly on exit)
    let caOffset = 0;
    if (glyph.caOffset) {
        const mergeEased = easeSonnetInOut(enterU);
        const currentEnterCA = glyph.caOffset * (1 - mergeEased * 0.8);
        caOffset = currentEnterCA * exitCAFlare;
    }

    // Ghost afterimage progress (one-shot during entrance)
    const ghostDuration = glyph.ghostDuration || 0.4;
    const ghostProgress = clamp01((time - glyph.startTime) / ghostDuration);
    const ghostActive = visible && ghostProgress > 0 && ghostProgress < 1 && exitAlpha > 0.8;

    return {
        x: finalX,
        y: finalY,
        scale: finalScale,
        rotation: finalRotation,
        alpha: combinedAlpha,
        visible,
        haloAlpha,
        haloScale,
        caOffset,
        ghostProgress,
        ghostActive,
    };
};

/**
 * Resolves whether the current theme/palette environment represents daylight (Warm Paper)
 * for Elysium visualizer elements.
 */
export function resolveElysiumIsDaylight(theme?: { backgroundColor?: string }, propIsDaylight?: boolean): boolean {
    if (typeof propIsDaylight === 'boolean') return propIsDaylight;
    const bg = (theme?.backgroundColor || '').toLowerCase();
    if (bg === '#ece7db' || bg === '#f6f3eb' || bg === '#e9e4d9') return true;
    if (bg.startsWith('#') && bg.length >= 7) {
        const r = parseInt(bg.substring(1, 3), 16) / 255;
        const g = parseInt(bg.substring(3, 5), 16) / 255;
        const b = parseInt(bg.substring(5, 7), 16) / 255;
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        return luma > 0.42;
    }
    return false;
}
