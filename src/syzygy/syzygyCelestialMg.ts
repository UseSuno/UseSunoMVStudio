// Procedural astronomical background graphics, Kepler orbits, astrolabe rings, and coronal flares for Syzygy.
import type { Theme } from '../vendor/folia/types';
import type { SyzygyShot } from './syzygyTypes';

type PixiModule = typeof import('pixi.js');

const colorNumber = (pixi: PixiModule, color: string) => pixi.Color.shared.setValue(color).toNumber();

export interface CelestialMgView {
    container: import('pixi.js').Container;
    update: (time: number, bass: number, vocal: number, power: number) => void;
    destroy: () => void;
}

/**
 * Builds procedural celestial background graphics tailored to the shot seed and theme.
 */
export const buildSyzygyCelestialMg = (
    pixi: PixiModule,
    shot: SyzygyShot,
    theme: Theme,
    width: number,
    height: number,
): CelestialMgView => {
    const { Container, Graphics } = pixi;
    const container = new Container();

    const primaryCol = colorNumber(pixi, theme.primaryColor);
    const accentCol = colorNumber(pixi, theme.accentColor);
    const secondaryCol = colorNumber(pixi, theme.secondaryColor);

    const centerX = width / 2;
    const centerY = height / 2;
    const minDim = Math.min(width, height);
    const baseRadius = minDim * 0.38;

    // 1. Static/Drifting Astrolabe Orbit Ring Layer
    const orbitGfx = new Graphics();
    container.addChild(orbitGfx);

    // Draw Keplerian concentric orbit ellipses
    orbitGfx.ellipse(centerX, centerY, baseRadius, baseRadius * 0.65)
        .stroke({ color: primaryCol, width: 1.2, alpha: 0.22 });

    orbitGfx.ellipse(centerX, centerY, baseRadius * 1.35, baseRadius * 0.88)
        .stroke({ color: accentCol, width: 1, alpha: 0.14 });

    orbitGfx.circle(centerX, centerY, baseRadius * 0.5)
        .stroke({ color: secondaryCol, width: 1, alpha: 0.18 });

    // Tick marks around the outer ring
    const tickCount = 36;
    for (let i = 0; i < tickCount; i++) {
        const rad = (i / tickCount) * Math.PI * 2;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const r1 = baseRadius * 1.32;
        const r2 = baseRadius * (i % 6 === 0 ? 1.40 : 1.36);
        orbitGfx.moveTo(centerX + cos * r1, centerY + sin * (r1 * 0.88))
            .lineTo(centerX + cos * r2, centerY + sin * (r2 * 0.88))
            .stroke({ color: primaryCol, width: i % 6 === 0 ? 1.5 : 1, alpha: i % 6 === 0 ? 0.35 : 0.15 });
    }

    // Celestial coordinate axes lines
    orbitGfx.moveTo(centerX - width * 0.42, centerY)
        .lineTo(centerX + width * 0.42, centerY)
        .stroke({ color: primaryCol, width: 0.8, alpha: 0.12 });
    orbitGfx.moveTo(centerX, centerY - height * 0.42)
        .lineTo(centerX, centerY + height * 0.42)
        .stroke({ color: primaryCol, width: 0.8, alpha: 0.12 });

    // 2. Coronal Flare & Eclipse Disk Layer
    const coronaGfx = new Graphics();
    container.addChild(coronaGfx);

    // 3. Stardust particles along the elliptical orbit
    const particleCount = 28;
    const particles = Array.from({ length: particleCount }, (_, idx) => {
        const pGfx = new Graphics();
        pGfx.circle(0, 0, 1.5 + (idx % 3) * 0.8)
            .fill({ color: idx % 2 === 0 ? primaryCol : accentCol, alpha: 0.4 + (idx % 3) * 0.2 });
        container.addChild(pGfx);
        return {
            gfx: pGfx,
            orbitSpeed: 0.08 + (idx % 5) * 0.04,
            baseAngle: (idx / particleCount) * Math.PI * 2,
            radiusScale: 0.5 + (idx % 4) * 0.25,
        };
    });

    const update = (time: number, bass: number, vocal: number, power: number) => {
        const localTime = time - shot.startTime;

        // Slow celestial rotation of the astrolabe
        orbitGfx.pivot.set(centerX, centerY);
        orbitGfx.position.set(centerX, centerY);
        orbitGfx.rotation = localTime * 0.018 * (shot.celestialSeed % 2 === 0 ? 1 : -1);

        // Update particles along Keplerian orbits
        particles.forEach(p => {
            const angle = p.baseAngle + localTime * p.orbitSpeed * (1 + power * 0.4);
            const rX = baseRadius * p.radiusScale;
            const rY = baseRadius * 0.65 * p.radiusScale;
            p.gfx.position.set(
                centerX + Math.cos(angle) * rX,
                centerY + Math.sin(angle) * rY,
            );
        });

        // Dynamic Eclipse & Coronal Flare
        coronaGfx.clear();
        if (shot.coronaStrength > 0) {
            const pulse = Math.sin(time * 3.5) * 0.08 + bass * 0.25;
            const coronaRadius = baseRadius * 0.48 * (1 + pulse);
            const peakAlpha = Math.min(0.45, (0.16 + bass * 0.28) * shot.coronaStrength);

            // Layered coronal radiation glow
            coronaGfx.circle(centerX, centerY, coronaRadius * 1.35)
                .fill({ color: accentCol, alpha: peakAlpha * 0.25 });
            coronaGfx.circle(centerX, centerY, coronaRadius * 1.15)
                .fill({ color: secondaryCol, alpha: peakAlpha * 0.45 });
            coronaGfx.circle(centerX, centerY, coronaRadius)
                .stroke({ color: primaryCol, width: 2 + bass * 3, alpha: peakAlpha * 0.85 });

            // Ray spikes radiating from corona center
            const rayCount = 12;
            for (let r = 0; r < rayCount; r++) {
                const rayAngle = (r / rayCount) * Math.PI * 2 + localTime * 0.05;
                const rayLen = coronaRadius * (1.2 + Math.sin(r * 17 + time * 5) * 0.2 + bass * 0.3 + vocal * 0.2);
                coronaGfx.moveTo(centerX + Math.cos(rayAngle) * coronaRadius, centerY + Math.sin(rayAngle) * coronaRadius)
                    .lineTo(centerX + Math.cos(rayAngle) * rayLen, centerY + Math.sin(rayAngle) * rayLen)
                    .stroke({ color: accentCol, width: 1.2, alpha: peakAlpha * 0.6 });
            }
        }
    };

    const destroy = () => {
        container.destroy({ children: true });
    };

    return {
        container,
        update,
        destroy,
    };
};
