// src/elysium/elysiumSpatial.ts
// 3D Spatial Typography Matrix & Continuous 3D Chase Camera Engine for Elysium.
// Synthesizes Sonnet's high-impact kinetic graphic hierarchy with Fume's continuous spatial follow-focus.
import type { SonnetProgram } from '../vendor/folia/components/visualizer/sonnet/types';
import { clamp01 } from '../vendor/folia/components/visualizer/sonnet/sonnetMotion';

export interface ElysiumSpatialAnchor {
    x: number;
    y: number;
    z: number;
    roll: number; // in radians
    scale: number;
}

export interface ElysiumSpatialShotMeta {
    globalIndex: number;
    paragraphIndex: number;
    shotIndex: number;
    shotId: string;
    startTime: number;
    endTime: number;
    vocalEndTime: number;
    anchor: ElysiumSpatialAnchor;
}

export interface ElysiumCameraState3D {
    x: number;
    y: number;
    z: number;
    roll: number;
    activeShotIndex: number;
    flightProgress: number; // 0 if locked/idle, 0..1 during transition
    targetShotIndex: number;
}

export interface ElysiumProjectedFrame {
    screenX: number;
    screenY: number;
    scale: number;
    rotation: number;
    depth: number;
    visible: boolean;
}

/**
 * Smooth Hermite S-curve flight easing with gentle departure and cushioned arrival.
 */
export function easeElysiumFlight(t: number): number {
    const u = clamp01(t);
    // Smooth quintic / easeInOutCubic curve
    return u < 0.5
        ? 4 * u * u * u
        : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * Builds deterministic 3D spatial layout anchors for all shots across the entire song program.
 * Organizes phrases into a 3D typographic corridor/matrix with dynamic X/Y/Z distribution.
 */
export function buildElysiumSpatialMap(
    program: SonnetProgram,
    viewportWidth: number,
    viewportHeight: number,
): ElysiumSpatialShotMeta[] {
    const result: ElysiumSpatialShotMeta[] = [];
    let globalIndex = 0;

    const w = Math.max(320, viewportWidth);
    const h = Math.max(240, viewportHeight);

    // Guaranteed non-overlapping 3D corridor step metrics:
    // A lyric line spans up to 75% of viewport width. To guarantee that
    // consecutive and background shots never overlap in 2D perspective projection,
    // each shot advances forward along a strictly progressive corridor with ample clearance.
    const stepX = Math.max(w * 1.15, 880);
    const stepY = Math.max(h * 0.48, 280);

    let curX = 0;
    let curY = 0;
    let curZ = 0;
    let curRoll = 0;

    program.paragraphs.forEach((paragraph, pIdx) => {
        paragraph.shots.forEach((shot, sIdx) => {
            if (globalIndex === 0) {
                curX = 0;
                curY = 0;
                curZ = 0;
                curRoll = 0;
            } else {
                // Progressive forward advance: strictly positive dx ensures every shot
                // moves forward in space, eliminating looping or spatial stacking.
                const stepVariation = 0.94 + (((globalIndex * 19 + 7) % 21) / 100);
                const dx = stepX * stepVariation;

                // Organic vertical wave elevation (alternating gentle peaks and valleys)
                const dy = Math.sin(globalIndex * 1.25) * (stepY * 0.48);

                // Multi-tier 3D Z-depth field: shifts past/future shots into genuine depth planes
                const zCycle = (globalIndex - 1) % 4;
                let dz = 0;
                switch (zCycle) {
                    case 0:
                        dz = -75; // Deep forward plunge
                        break;
                    case 1:
                        dz = 65;  // Pull-back vantage
                        break;
                    case 2:
                        dz = -50; // Moderate depth
                        break;
                    case 3:
                    default:
                        dz = 70;  // High vantage
                        break;
                }

                const dRoll = Math.sin(globalIndex * 1.35) * 0.020;

                curX += dx;
                curY = dy;
                curZ = dz;
                curRoll = dRoll;
            }

            // Determine actual vocal end time for current shot (excludes visual exit tail)
            const shotLines = paragraph.lines.filter(l => shot.lineIndices.includes(l.sourceIndex));
            let vocalEndTime = shot.startTime;
            if (shotLines.length > 0) {
                vocalEndTime = Math.max(...shotLines.map(l => l.line.endTime));
            } else {
                vocalEndTime = Math.max(shot.startTime, shot.endTime - 0.3);
            }
            vocalEndTime = Math.max(shot.startTime + 0.1, Math.min(shot.endTime, vocalEndTime));

            result.push({
                globalIndex,
                paragraphIndex: pIdx,
                shotIndex: sIdx,
                shotId: shot.id,
                startTime: shot.startTime,
                endTime: shot.endTime,
                vocalEndTime,
                anchor: {
                    x: curX,
                    y: curY,
                    z: curZ,
                    roll: curRoll,
                    scale: 1.0,
                },
            });

            globalIndex++;
        });
    });

    return result;
}

/**
 * Calculates continuous 3D camera trajectory for any timestamp.
 * Includes smooth flight transitions, parabolic 3D swoop, and aircraft-style banking into curves.
 * Guarantees that active singing shots remain 100% visible and well-framed until singing completes.
 */
export function resolveElysiumContinuousCamera(
    spatialMap: ElysiumSpatialShotMeta[],
    time: number,
): ElysiumCameraState3D {
    if (spatialMap.length === 0) {
        return { x: 0, y: 0, z: 0, roll: 0, activeShotIndex: 0, flightProgress: 0, targetShotIndex: 0 };
    }

    if (spatialMap.length === 1) {
        const a = spatialMap[0].anchor;
        return { x: a.x, y: a.y, z: a.z, roll: a.roll, activeShotIndex: 0, flightProgress: 0, targetShotIndex: 0 };
    }

    // 1. Locate current active shot based on time
    let activeIdx = 0;
    for (let i = 0; i < spatialMap.length; i++) {
        if (time >= spatialMap[i].startTime) {
            activeIdx = i;
        } else {
            break;
        }
    }

    const curMeta = spatialMap[activeIdx];
    const nextMeta = spatialMap[activeIdx + 1] ?? null;

    // 2. Determine if we are in flight transition to next shot
    if (nextMeta) {
        const vocalEnd = curMeta.vocalEndTime ?? (curMeta.endTime - 0.25);
        const gap = nextMeta.startTime - vocalEnd;
        let flightStartTime: number;
        let flightEndTime: number;

        if (gap >= 0.8) {
            // Generous gap: hold camera steadily on current shot's completed lyrics,
            // then glide smoothly to arrive at next shot just before it starts singing
            const flightDuration = Math.min(1.2, Math.max(0.55, gap * 0.6));
            flightEndTime = nextMeta.startTime - 0.08;
            flightStartTime = Math.max(vocalEnd + 0.15, flightEndTime - flightDuration);
        } else if (gap >= 0.25) {
            // Moderate gap: hold brief pause after singing finishes, then transition
            flightStartTime = vocalEnd + 0.05;
            flightEndTime = Math.max(flightStartTime + 0.35, nextMeta.startTime);
        } else if (gap >= 0) {
            // Tight gap: start transition immediately after current shot completes vocal
            flightStartTime = Math.max(curMeta.startTime + 0.2, vocalEnd);
            flightEndTime = flightStartTime + Math.max(0.35, gap + 0.12);
        } else {
            // Overlapping timestamps: balance between current vocal and incoming vocal
            const midpoint = (vocalEnd + nextMeta.startTime) / 2;
            flightStartTime = Math.max(curMeta.startTime + 0.2, midpoint - 0.15);
            flightEndTime = flightStartTime + 0.35;
        }

        if (time >= flightStartTime) {
            const flightDuration = Math.max(0.01, flightEndTime - flightStartTime);
            const rawProgress = clamp01((time - flightStartTime) / flightDuration);
            const easedProgress = easeElysiumFlight(rawProgress);

            const a1 = curMeta.anchor;
            const a2 = nextMeta.anchor;

            // Linear position interpolation
            const baseX = a1.x + (a2.x - a1.x) * easedProgress;
            const baseY = a1.y + (a2.y - a1.y) * easedProgress;
            const baseZ = a1.z + (a2.z - a1.z) * easedProgress;
            const baseRoll = a1.roll + (a2.roll - a1.roll) * easedProgress;

            // 3D Swoop arc: pull back in Z mid-flight to reveal space with wide view (zoom out)
            const swoopZ = -Math.sin(rawProgress * Math.PI) * 75;

            // Dynamic banking roll: bank subtly into the direction of motion
            const dx = a2.x - a1.x;
            const bankingRoll = Math.sin(rawProgress * Math.PI) * (dx > 0 ? -0.022 : 0.022);

            // Active shot index: NEVER abandon curMeta while curMeta vocal is still singing!
            const canSwitchActive = time >= vocalEnd;
            const activeShotIndex = canSwitchActive && (rawProgress >= 0.5 || time >= nextMeta.startTime)
                ? activeIdx + 1
                : activeIdx;

            return {
                x: baseX,
                y: baseY,
                z: baseZ + swoopZ,
                roll: baseRoll + bankingRoll,
                activeShotIndex,
                flightProgress: rawProgress,
                targetShotIndex: activeIdx + 1,
            };
        }
    }

    // 3. Steady state within active shot
    const a = curMeta.anchor;
    return {
        x: a.x,
        y: a.y,
        z: a.z,
        roll: a.roll,
        activeShotIndex: activeIdx,
        flightProgress: 0,
        targetShotIndex: activeIdx,
    };
}

/**
 * Projects a 3D spatial anchor to 2D viewport coordinates using perspective projection.
 */
export function projectElysium3DTo2D(
    anchor: ElysiumSpatialAnchor,
    camera: ElysiumCameraState3D,
    viewportWidth: number,
    viewportHeight: number,
    focalLength = 950,
): ElysiumProjectedFrame {
    const dx = anchor.x - camera.x;
    const dy = anchor.y - camera.y;
    const dz = anchor.z - camera.z;

    // Apply inverse camera roll
    const cosR = Math.cos(-camera.roll);
    const sinR = Math.sin(-camera.roll);
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;

    // Perspective depth
    const dist = focalLength + dz;
    if (dist < 100) {
        // Behind camera or too close to render
        return {
            screenX: viewportWidth / 2,
            screenY: viewportHeight / 2,
            scale: 0,
            rotation: 0,
            depth: dz,
            visible: false,
        };
    }

    const perspScale = focalLength / dist;
    const screenX = viewportWidth / 2 + rx * perspScale;
    const screenY = viewportHeight / 2 + ry * perspScale;
    const screenRot = anchor.roll - camera.roll;
    // Scale clamp: prevent excessive perspective magnification that could push text offscreen
    const totalScale = Math.min(1.04, Math.max(0.35, anchor.scale * perspScale));

    // Cull if completely outside broad frustum
    const margin = Math.max(viewportWidth, viewportHeight) * 1.6;
    const inBounds = screenX >= -margin
        && screenX <= viewportWidth + margin
        && screenY >= -margin
        && screenY <= viewportHeight + margin;

    return {
        screenX,
        screenY,
        scale: totalScale,
        rotation: screenRot,
        depth: dz,
        visible: inBounds && totalScale > 0.05,
    };
}
