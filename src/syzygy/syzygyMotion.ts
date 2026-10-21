// Pure mathematical motion curves and camera trajectories for the Syzygy visualizer.
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
import type { SyzygyShotKind } from './syzygyTypes';

/**
 * Gravitational Hyperbolic Inflow Ease:
 * Simulates an astronomical body falling into a gravity well, experiencing
 * strong tidal acceleration, a crisp micro-overshoot snap (1.038), and instant stabilization.
 */
export const easeSyzygyGravitationalSnap = (t: number): number => {
    const u = clamp01(t);
    if (u >= 1) return 1;
    // Steep cubic surge
    const base = 1 - Math.pow(1 - u, 3.5);
    // Damped gravitational tidal overshoot peaking around u = 0.7
    const tidalOvershoot = Math.sin(u * Math.PI) * Math.pow(1 - u, 1.2) * 0.32;
    return base + tidalOvershoot;
};

/**
 * Stardust Dissolution Ease:
 * Smooth accelerating centrifugal escape curve.
 */
export const easeSyzygyStardustDissolve = (t: number): number => {
    const u = clamp01(t);
    return Math.pow(u, 2.4);
};

const cubicCoordinate = (point1: number, point2: number, time: number) => {
    const inverse = 1 - time;
    return 3 * inverse * inverse * time * point1
        + 3 * inverse * time * time * point2
        + time * time * time;
};

export const resolveCubicBezier = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    value: number,
) => {
    const target = clamp01(value);
    if (target === 0 || target === 1) return target;
    let low = 0;
    let high = 1;
    let parameter = target;
    for (let iteration = 0; iteration < 12; iteration += 1) {
        const x = cubicCoordinate(x1, x2, parameter);
        if (x < target) low = parameter;
        else high = parameter;
        parameter = (low + high) / 2;
    }
    return cubicCoordinate(y1, y2, parameter);
};

/**
 * Cubic S-curve velocity easing (Hermite cubic spline) from Lumiere:
 * First derivative is strictly zero at t = 0 and t = 1, ensuring zero initial jerk
 * and silky deceleration into rest anchors.
 */
export const easeInOutCubic = (value: number): number => {
    const t = clamp01(value);
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/**
 * 3rd-order Bézier curve point evaluation for curved orbital flight trajectories:
 * B(s) = (1-s)^3 P0 + 3(1-s)^2 s C1 + 3(1-s) s^2 C2 + s^3 P1
 */
export const resolveCubicBezierFlightPoint = (
    p0: { x: number; y: number },
    c1: { x: number; y: number },
    c2: { x: number; y: number },
    p1: { x: number; y: number },
    s: number,
): { x: number; y: number } => {
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    return {
        x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
        y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    };
};

/**
 * Natural deceleration curve inspired by Tempera (cubic-bezier 0.22, 1, 0.36, 1):
 * Decisive initial approach with silky, extended deceleration tail into the typographic resting anchor.
 */
export const easeSyzygyEnter = (value: number) => resolveCubicBezier(0.22, 1, 0.36, 1, value);

/**
 * Smooth S-curve for opacity reveal (cubic-bezier 0.62, 0, 0.32, 1).
 */
export const easeSyzygyInOut = (value: number) => resolveCubicBezier(0.62, 0, 0.32, 1, value);

/**
 * Soft back cushion for organic scale settling with mild elastic overshoot.
 */
export const easeSyzygySoftBack = (value: number) => {
    const t = clamp01(value);
    const c = 1.35;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export interface SyzygyResolvedCamera {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
}

/**
 * Resolves camera movement frame according to the astronomical shot kind and playback progress.
 */
export const resolveSyzygyCameraPath = (
    kind: SyzygyShotKind,
    progress: number,
    orbitAngle: number,
): SyzygyResolvedCamera => {
    const u = clamp01(progress);
    // Continuous smooth progression
    const eased = u * 0.5 + (1 - Math.cos(u * Math.PI)) * 0.25;

    switch (kind) {
        case 'syzygy-corona': {
            // Rapid focal approach on eclipse corona, settling into majestic scale
            const zoomIn = 1.0 + (1 - Math.pow(1 - u, 2)) * 0.12;
            const driftX = Math.sin(eased * Math.PI * 0.5) * 0.03;
            const driftY = -Math.sin(eased * Math.PI * 0.5) * 0.02;
            return {
                x: driftX,
                y: driftY,
                zoom: zoomIn,
                rotation: -0.008 + eased * 0.016,
            };
        }
        case 'orbital-sweep': {
            // Elliptical Keplerian orbit trajectory sweep
            const angle = orbitAngle + eased * 0.35;
            return {
                x: Math.cos(angle) * 0.08 - 0.04,
                y: Math.sin(angle) * 0.05,
                zoom: 0.98 + Math.sin(eased * Math.PI) * 0.06,
                rotation: Math.sin(angle) * 0.02,
            };
        }
        case 'celestial-chart': {
            // Precision star chart lateral scan
            return {
                x: -0.06 + eased * 0.12,
                y: 0.02 - eased * 0.04,
                zoom: 1.0 + eased * 0.03,
                rotation: -0.005 + eased * 0.008,
            };
        }
        case 'gravity-lens': {
            // Radial gravitational pulse
            const lensImpulse = Math.sin(u * Math.PI) * 0.04;
            return {
                x: -0.02 + eased * 0.04,
                y: 0.015 - eased * 0.03,
                zoom: 1.02 + lensImpulse + eased * 0.05,
                rotation: (eased - 0.5) * 0.015,
            };
        }
        case 'zenith-tableau': {
            // Minimal deep-cosmos tranquil drift
            return {
                x: -0.015 + eased * 0.03,
                y: 0.01 - eased * 0.02,
                zoom: 1.0 + eased * 0.02,
                rotation: (eased - 0.5) * 0.004,
            };
        }
        case 'meteor-cascade': {
            // High-tension diagonal star-track slash
            return {
                x: -0.08 + eased * 0.16,
                y: -0.05 + eased * 0.10,
                zoom: 0.96 + eased * 0.10,
                rotation: -0.02 + eased * 0.035,
            };
        }
        default:
            return { x: 0, y: 0, zoom: 1, rotation: 0 };
    }
};

/**
 * Organic celestial breathing float based on gravitational wave harmonics.
 */
export const resolveSyzygyCelestialBreath = (time: number, phase = 0) => {
    const tau = time * Math.PI * 2;
    return {
        x: (Math.sin(tau * 0.12 + phase) * 0.6 + Math.sin(tau * 0.28 + phase * 1.5) * 0.4) * 0.005,
        y: (Math.cos(tau * 0.10 + phase * 2.1) * 0.6 + Math.sin(tau * 0.25 + phase * 0.8) * 0.4) * 0.005,
        zoom: Math.sin(tau * 0.08 + phase) * 0.002,
        rotation: Math.sin(tau * 0.06 + phase * 2.7) * 0.0015,
    };
};

export interface SyzygyGlyphMotionProps {
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

export interface SyzygyGlyphContext {
    time: number;
    shotStartTime: number;
    shotEndTime: number;
    shotKind: string;
    role: string;
    glyphIndex: number;
    totalGlyphs: number;
    motion: number;
}

export interface SyzygyResolvedGlyphFrame {
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
 * Resolves celestial gravitational snap entrance and stardust dissolution exit
 * for a glyph in the Syzygy visualizer.
 */
export const resolveSyzygyGlyphTransform = (
    glyph: SyzygyGlyphMotionProps,
    ctx: SyzygyGlyphContext,
): SyzygyResolvedGlyphFrame => {
    const { time, shotStartTime, shotEndTime, shotKind, role, glyphIndex, totalGlyphs, motion } = ctx;

    // 1. Pre-arrival check
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

    // 2. Gravitational Curved Inflow (Cubic Bézier Trajectory inspired by Lumiere)
    const rawEnterDuration = Math.max(0.10, glyph.settleTime - glyph.startTime);
    const enterDuration = Math.min(0.55, Math.max(0.22, rawEnterDuration));
    const enterU = clamp01((time - glyph.startTime) / enterDuration);
    const snapProgress = easeSyzygyGravitationalSnap(enterU);

    // Orbital curved tangent trajectory: 3rd-order Bézier curve along celestial gravitational field
    const directDist = Math.hypot(glyph.enterX, glyph.enterY) || 28;
    const chordAngle = Math.atan2(-glyph.enterY, -glyph.enterX);
    const normalAngle = chordAngle + Math.PI * 0.5;
    const arcCurvature = directDist * 0.36 * motion;

    const p0 = { x: glyph.enterX, y: glyph.enterY };
    const p1 = { x: 0, y: 0 };
    const c1 = {
        x: p0.x + Math.cos(chordAngle) * (directDist * 0.38) + Math.cos(normalAngle) * arcCurvature,
        y: p0.y + Math.sin(chordAngle) * (directDist * 0.38) + Math.sin(normalAngle) * arcCurvature,
    };
    const c2 = {
        x: p1.x - Math.cos(chordAngle) * (directDist * 0.32) + Math.cos(normalAngle) * (arcCurvature * 0.35),
        y: p1.y - Math.sin(chordAngle) * (directDist * 0.32) + Math.sin(normalAngle) * (arcCurvature * 0.35),
    };

    const s = easeInOutCubic(enterU);
    const flightPt = resolveCubicBezierFlightPoint(p0, c1, c2, p1, s);
    const entryOffsetX = flightPt.x * motion;
    const entryOffsetY = flightPt.y * motion;

    // Kinetic scale
    const isHero = role === 'hero' || role === 'semi-hero';
    let baseScale: number;
    if (isHero && shotKind === 'type-impact') {
        baseScale = 0.52 + snapProgress * 0.48;
    } else if (isHero) {
        baseScale = 0.68 + snapProgress * 0.32;
    } else {
        baseScale = 0.82 + snapProgress * 0.18;
    }

    const flightLift = Math.sin(s * Math.PI);
    const bankingImpulse = (glyph.enterX > 0 ? 1 : -1) * 0.08 * flightLift * motion;
    const entryRotationImpulse = glyph.entryRotation * (1 - s) + bankingImpulse;
    const currentRotation = glyph.finalRotation + entryRotationImpulse;

    // Alpha ramp
    const enterAlpha = enterU < 0.10 ? enterU / 0.10 : 1.0;

    // 3. Stardust Dissolution Exit Phase
    const shotDuration = Math.max(0.2, shotEndTime - shotStartTime);
    const exitLeadWindow = Math.min(0.55, Math.max(0.22, shotDuration * 0.22));
    const shotExitStart = shotEndTime - exitLeadWindow;

    const safeTotalGlyphs = Math.max(1, totalGlyphs);
    const staggerDelay = (glyphIndex / safeTotalGlyphs) * (exitLeadWindow * 0.46);
    const charExitStart = shotExitStart + staggerDelay;
    const charExitDuration = Math.max(0.14, exitLeadWindow * 0.62);

    let exitAlpha = 1.0;
    let exitLiftX = 0;
    let exitLiftY = 0;
    let exitScale = 1.0;
    let exitRotation = 0;
    let exitCAFlare = 1.0;

    if (time >= charExitStart) {
        const exitU = clamp01((time - charExitStart) / charExitDuration);
        const exitEased = easeSyzygyStardustDissolve(exitU);

        exitAlpha = Math.max(0, 1 - Math.pow(exitU, 1.7));

        // Retrograde drift along celestial tangent
        const baseLiftDirX = glyph.enterX !== 0 ? -glyph.enterX * 0.72 : 16 * (glyphIndex % 2 === 0 ? 1 : -1);
        const baseLiftDirY = glyph.enterY !== 0 ? -glyph.enterY * 0.72 : -28;

        exitLiftX = baseLiftDirX * exitEased * motion;
        exitLiftY = baseLiftDirY * exitEased * motion;

        exitScale = 1.0 + exitEased * 0.18;
        exitRotation = glyph.entryRotation * exitEased * 2.0;
        exitCAFlare = 1.0 + exitEased * 1.8;
    }

    const combinedAlpha = enterAlpha * exitAlpha;
    const visible = combinedAlpha > 0.005;

    const finalX = glyph.baseX + entryOffsetX + exitLiftX;
    const finalY = glyph.baseY + entryOffsetY + exitLiftY;
    const finalScale = baseScale * exitScale;
    const finalRotation = currentRotation + exitRotation;

    // Halo & Coronal Radiance
    const haloAlpha = enterU < 1.0 ? (1 - enterU * 0.25) * combinedAlpha : 0.75 * combinedAlpha;
    const haloScale = enterU < 1.0 ? 1.08 - enterU * 0.08 : 1.0;

    // Chromatic aberration offset
    const baseCA = (glyph.caOffset ?? 4);
    const currentCA = baseCA * (1 - enterU * 0.7) * exitCAFlare;

    // Ghost afterimage
    const ghostActive = enterU > 0.05 && enterU < 0.85 && isHero;
    const ghostProgress = enterU;

    return {
        x: finalX,
        y: finalY,
        scale: finalScale,
        rotation: finalRotation,
        alpha: combinedAlpha,
        visible,
        haloAlpha,
        haloScale,
        caOffset: currentCA,
        ghostProgress,
        ghostActive,
    };
};
