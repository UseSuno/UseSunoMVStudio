// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import React, { useEffect, useRef } from 'react';
import { type MotionValue } from 'framer-motion';
import { type AudioBands, type Theme, type AuroraTuning } from '../../../types';
import { parseColorChannels } from '../colorMix';

// src/components/visualizer/aurora/AuroraCanvas.tsx
// Aurora sky layer: pre-rendered ray-curtain textures composited each frame with
// drifting/swaying transforms, plus twinkling stars, occasional shooting stars and
// slow dust. Continuous values live in MotionValues read inside one RAF loop;
// nothing here writes React state per frame.

interface AuroraCanvasProps {
    theme: Theme;
    isDaylight?: boolean;
    audioPower: MotionValue<number>;
    audioBands: AudioBands;
    staticMode?: boolean;
    paused?: boolean;
    tuning: AuroraTuning;
}

interface CurtainSpec {
    baseX: number;
    widthRatio: number;
    drift: number;
    speed: number;
    phase: number;
    sway: number;
    hueShift: number;
    yOffset: number;
}

interface ShootingStar {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
}

const CURTAIN_COUNT = 6;
const STAR_COUNT = 70;
const DUST_COUNT = 36;

const buildCurtainSpecs = (): CurtainSpec[] => {
    const rand = (offset: number) => {
        const x = Math.sin(offset * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
    };

    return Array.from({ length: CURTAIN_COUNT }, (_, i) => ({
        baseX: (i / CURTAIN_COUNT) * 1.08 - 0.04 + rand(i * 3 + 1) * 0.08,
        widthRatio: 0.26 + rand(i * 3 + 2) * 0.3,
        drift: 0.03 + rand(i * 5 + 3) * 0.06,
        speed: 0.05 + rand(i * 5 + 4) * 0.09,
        phase: rand(i * 5 + 5) * Math.PI * 2,
        sway: 0.08 + rand(i * 7 + 6) * 0.1,
        hueShift: (i / (CURTAIN_COUNT - 1)) * 2 - 1,
        yOffset: rand(i * 7 + 7) * 0.14,
    }));
};

// Converts a #rrggbb color to [h, s, l] (h in degrees, s/l in 0..1).
const hexToHsl = (hex: string): [number, number, number] => {
    const channels = parseColorChannels(hex);
    const r = channels?.r ?? 255;
    const g = channels?.g ?? 255;
    const b = channels?.b ?? 255;
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) {
        return [0, 0, l];
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rn) {
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
        h = ((bn - rn) / d + 2) * 60;
    } else {
        h = ((rn - gn) / d + 4) * 60;
    }
    return [h, s, l];
};

// Pre-renders one curtain as vertical ray streaks with a bright lower edge.
const renderCurtainTexture = (
    width: number,
    height: number,
    hueBase: number,
    hueSpread: number,
    sat: number,
    light: number,
): HTMLCanvasElement | null => {
    const doc = typeof document === 'undefined' ? null : document;
    if (!doc) {
        return null;
    }
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(width));
    canvas.height = Math.max(2, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    const rand = (offset: number) => {
        const x = Math.sin((hueBase + offset) * 91.7 + width * 0.13) * 43758.5453;
        return x - Math.floor(x);
    };

    const rayWidth = Math.max(4, canvas.width / 55);
    const rayCount = Math.ceil(canvas.width / rayWidth);

    // Softening the rays while pre-rendering keeps the per-frame cost at plain
    // drawImage calls while the texture itself looks like glowing gas, not rain.
    ctx.filter = `blur(${Math.max(4, rayWidth * 0.9)}px)`;

    for (let i = 0; i < rayCount; i++) {
        const x = i * rayWidth;
        const t = i / rayCount;
        // Per-ray height and top position come from layered pseudo-noise so the
        // lower edge forms an organic waving silhouette.
        const edgeWave = Math.sin(t * 9 + hueBase) * 0.5 + Math.sin(t * 23 + hueBase * 2) * 0.3;
        const topY = canvas.height * (0.02 + rand(i * 3) * 0.2 + edgeWave * 0.06);
        const rayLength = canvas.height * (0.6 + rand(i * 7 + 1) * 0.42 + edgeWave * 0.12);
        const hue = hueBase + (t - 0.5) * hueSpread + (rand(i * 11 + 2) - 0.5) * 10;
        const rayAlpha = 0.12 + rand(i * 13 + 3) * 0.24;

        const gradient = ctx.createLinearGradient(0, topY + rayLength, 0, topY);
        gradient.addColorStop(0, `hsla(${hue}, ${sat}%, ${Math.min(78, light + 14)}%, ${rayAlpha})`);
        gradient.addColorStop(0.18, `hsla(${hue}, ${sat}%, ${light}%, ${rayAlpha * 0.55})`);
        gradient.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, topY, rayWidth * 2.2, rayLength);

        // Bright lower edge of the curtain.
        const edgeGradient = ctx.createLinearGradient(0, topY + rayLength, 0, topY + rayLength - rayLength * 0.12);
        edgeGradient.addColorStop(0, `hsla(${hue}, ${Math.min(100, sat + 10)}%, ${Math.min(90, light + 28)}%, ${rayAlpha * 1.6})`);
        edgeGradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        ctx.fillStyle = edgeGradient;
        ctx.fillRect(x, topY + rayLength - rayLength * 0.12, rayWidth + 1, rayLength * 0.12);
    }

    ctx.filter = 'none';
    return canvas;
};

interface AuroraCanvasImpl {
    curtains: CurtainSpec[];
    textures: Array<HTMLCanvasElement | null>;
    stars: Array<{ x: number; y: number; r: number; phase: number }>;
    dust: Array<{ x: number; y: number; speed: number; wobble: number; alpha: number }>;
    shooting: ShootingStar | null;
    nextShootingAt: number;
    width: number;
    height: number;
}

const AuroraCanvas: React.FC<AuroraCanvasProps> = ({
    theme,
    isDaylight = false,
    audioPower,
    audioBands,
    staticMode = false,
    paused = false,
    tuning,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const themeRef = useRef(theme);
    const daylightRef = useRef(isDaylight);
    const tuningRef = useRef(tuning);
    themeRef.current = theme;
    daylightRef.current = isDaylight;
    tuningRef.current = tuning;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const state: AuroraCanvasImpl = {
            curtains: buildCurtainSpecs(),
            textures: [],
            stars: [],
            dust: [],
            shooting: null,
            nextShootingAt: 5,
            width: 0,
            height: 0,
        };

        let frameId = 0;
        let lastElapsed = 0;
        let texturesDirty = true;
        const startedAt = performance.now();
        const intensityScale = theme.animationIntensity === 'calm'
            ? 0.65
            : theme.animationIntensity === 'chaotic'
                ? 1.45
                : 1;

        const ensureLayout = () => {
            const parent = canvas.parentElement;
            const width = parent?.clientWidth || window.innerWidth;
            const height = parent?.clientHeight || window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const pixelWidth = Math.max(1, Math.floor(width * dpr));
            const pixelHeight = Math.max(1, Math.floor(height * dpr));
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
                texturesDirty = true;
            }
            if (state.width !== width || state.height !== height) {
                state.width = width;
                state.height = height;
                texturesDirty = true;
                state.stars = Array.from({ length: STAR_COUNT }, (_, i) => {
                    const rand = (offset: number) => {
                        const x = Math.sin((i + 1) * (offset + 3.7)) * 43758.5453;
                        return x - Math.floor(x);
                    };
                    return {
                        x: rand(1) * width,
                        y: rand(2) * height * 0.75,
                        r: 0.6 + rand(3) * 1.3,
                        phase: rand(4) * Math.PI * 2,
                    };
                });
                state.dust = Array.from({ length: DUST_COUNT }, (_, i) => {
                    const rand = (offset: number) => {
                        const x = Math.sin((i + 1) * (offset + 9.1)) * 24634.6345;
                        return x - Math.floor(x);
                    };
                    return {
                        x: rand(1) * width,
                        y: rand(2) * height,
                        speed: 6 + rand(3) * 14,
                        wobble: rand(4) * Math.PI * 2,
                        alpha: 0.04 + rand(5) * 0.1,
                    };
                });
            }
        };

        const rebuildTextures = () => {
            const currentTheme = themeRef.current;
            const currentTuning = tuningRef.current;
            const [accentHue, accentSat, accentLight] = hexToHsl(currentTheme.accentColor || currentTheme.primaryColor);
            const spectrum = currentTuning.colorMode !== 'theme';
            // Spectrum mode spreads hues around the theme accent so AI/custom themes
            // shift the whole aurora palette, while staying recognizably "aurora".
            const sat = spectrum ? Math.max(70, Math.round(accentSat * 100) || 85) : Math.max(30, Math.round(accentSat * 100));
            const light = isDaylight ? 62 : 60;

            state.textures = state.curtains.map((curtain) => {
                const texWidth = state.width * curtain.widthRatio * 1.5;
                const texHeight = state.height * 1.25;
                const spread = spectrum ? 95 : 12;
                const hueBase = spectrum
                    ? accentHue + curtain.hueShift * spread + (isDaylight ? 0 : -8)
                    : 0;
                const texture = renderCurtainTexture(
                    texWidth,
                    texHeight,
                    hueBase,
                    spread * 0.5,
                    sat,
                    light,
                );
                if (texture && spectrum) {
                    // Theme mode tinting: repaint rays towards the theme hues by compositing.
                    const tctx = texture.getContext('2d');
                    if (tctx) {
                        tctx.globalCompositeOperation = 'source-atop';
                        const primaryChannels = parseColorChannels(currentTheme.primaryColor);
                        const accentChannels = parseColorChannels(currentTheme.accentColor || currentTheme.primaryColor);
                        const pr = primaryChannels?.r ?? 248;
                        const pg = primaryChannels?.g ?? 250;
                        const pb = primaryChannels?.b ?? 252;
                        const ar = accentChannels?.r ?? pr;
                        const ag = accentChannels?.g ?? pg;
                        const ab = accentChannels?.b ?? pb;
                        const tint = tctx.createLinearGradient(0, 0, texture.width, 0);
                        tint.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, 0.55)`);
                        tint.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0.55)`);
                        tctx.fillStyle = tint;
                        tctx.fillRect(0, 0, texture.width, texture.height);
                        tctx.globalCompositeOperation = 'source-over';
                    }
                }
                return texture;
            });
            texturesDirty = false;
        };

        const drawSky = () => {
            const currentTheme = themeRef.current;
            const bgChannels = parseColorChannels(currentTheme.backgroundColor);
            const br = bgChannels?.r ?? 15;
            const bg = bgChannels?.g ?? 23;
            const bb = bgChannels?.b ?? 42;
            const night = mixTowards(br, bg, bb, isDaylight ? 0 : 0.38);
            const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
            gradient.addColorStop(0, `rgb(${night[0]}, ${night[1]}, ${night[2]})`);
            gradient.addColorStop(1, `rgb(${br}, ${bg}, ${bb})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, state.width, state.height);
        };

        const drawStars = (elapsed: number, treble: number) => {
            const currentTheme = themeRef.current;
            const starChannels = parseColorChannels(currentTheme.primaryColor);
            const sr = starChannels?.r ?? 248;
            const sg = starChannels?.g ?? 250;
            const sb = starChannels?.b ?? 252;
            for (const star of state.stars) {
                const twinkle = 0.35 + 0.65 * (Math.sin(elapsed * (0.6 + star.r * 0.7) + star.phase) * 0.5 + 0.5);
                const alpha = (isDaylight ? 0.1 : 0.28) * twinkle * (0.7 + treble * 0.6);
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${Math.min(0.6, alpha)})`;
                ctx.fill();
            }
        };

        const drawShootingStar = (elapsed: number, delta: number, treble: number) => {
            const currentTheme = themeRef.current;
            const starChannels = parseColorChannels(currentTheme.primaryColor);
            const sr = starChannels?.r ?? 248;
            const sg = starChannels?.g ?? 250;
            const sb = starChannels?.b ?? 252;
            if (!state.shooting && elapsed > state.nextShootingAt) {
                const fromLeft = Math.random() > 0.5;
                state.shooting = {
                    x: fromLeft ? state.width * (0.1 + Math.random() * 0.3) : state.width * (0.6 + Math.random() * 0.3),
                    y: state.height * (0.05 + Math.random() * 0.25),
                    vx: (fromLeft ? 1 : -1) * (420 + Math.random() * 260),
                    vy: 160 + Math.random() * 140,
                    life: 0,
                    maxLife: 0.8 + Math.random() * 0.5,
                };
            }
            const star = state.shooting;
            if (!star) {
                return;
            }
            star.life += delta;
            star.x += star.vx * delta;
            star.y += star.vy * delta;
            const fade = 1 - star.life / star.maxLife;
            if (fade <= 0 || star.x < -80 || star.x > state.width + 80) {
                state.shooting = null;
                state.nextShootingAt = elapsed + 6 + Math.random() * 9;
                return;
            }
            const tailX = star.x - star.vx * 0.16;
            const tailY = star.y - star.vy * 0.16;
            const gradient = ctx.createLinearGradient(star.x, star.y, tailX, tailY);
            gradient.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.75 * fade * (0.6 + treble * 0.4)})`);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(star.x, star.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
        };

        const drawDust = (elapsed: number, delta: number) => {
            const currentTheme = themeRef.current;
            const dustChannels = parseColorChannels(currentTheme.secondaryColor);
            const dr = dustChannels?.r ?? 203;
            const dg = dustChannels?.g ?? 213;
            const db = dustChannels?.b ?? 225;
            for (const mote of state.dust) {
                mote.y += mote.speed * delta;
                if (mote.y > state.height + 8) {
                    mote.y = -8;
                }
                const x = mote.x + Math.sin(elapsed * 0.4 + mote.wobble) * 14;
                ctx.beginPath();
                ctx.arc(x, mote.y, 1.1, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${dr}, ${dg}, ${db}, ${mote.alpha})`;
                ctx.fill();
            }
        };

        const drawCurtains = (elapsed: number, power: number, bass: number) => {
            const currentTuning = tuningRef.current;
            const intensity = Math.max(0, currentTuning.ribbonIntensity) * intensityScale;
            const speed = Math.max(0, currentTuning.flowSpeed) * (paused ? 0.15 : 1);
            const swell = 0.55 + bass * 0.75 + power * 0.35;

            state.curtains.forEach((curtain, index) => {
                const texture = state.textures[index];
                if (!texture) {
                    return;
                }
                const phase = elapsed * curtain.speed * speed + curtain.phase;
                const drawX = curtain.baseX * state.width
                    + Math.sin(phase) * curtain.drift * state.width
                    - state.width * 0.06;
                const drawY = state.height * (curtain.yOffset - 0.18)
                    + Math.sin(phase * 0.6 + 1.3) * state.height * 0.02;
                const sway = Math.sin(phase * 0.8 + curtain.phase) * curtain.sway;
                const breathe = 0.72 + 0.28 * Math.sin(phase * 1.7 + index);
                const alpha = Math.min(0.9, intensity * swell * breathe * (isDaylight ? 0.35 : 0.62));

                ctx.save();
                ctx.globalAlpha = Math.max(0, alpha);
                ctx.translate(drawX + texture.width / 2, drawY + texture.height / 2);
                ctx.transform(1, 0, sway, 1, 0, 0);
                ctx.drawImage(
                    texture,
                    -texture.width / 2,
                    -texture.height / 2,
                    texture.width,
                    texture.height,
                );
                // Second, phase-shifted pass creates shimmering interference.
                ctx.globalAlpha = Math.max(0, alpha * 0.4);
                ctx.transform(1, 0, -sway * 1.6, 1.04, 0, 0);
                ctx.drawImage(
                    texture,
                    -texture.width / 2,
                    -texture.height / 2 + texture.height * 0.05,
                    texture.width,
                    texture.height,
                );
                ctx.restore();
            });
        };

        let lastFrameAt = 0;
        const renderFrame = (elapsed: number, delta: number) => {
            ensureLayout();
            if (texturesDirty) {
                rebuildTextures();
            }
            const currentPower = paused ? 0.16 : audioPower.get();
            const bass = paused ? 0.1 : audioBands.bass.get();
            const treble = paused ? 0.08 : audioBands.treble.get();

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, state.width, state.height);

            drawSky();
            drawStars(elapsed, treble);

            ctx.globalCompositeOperation = 'lighter';
            drawCurtains(elapsed, currentPower, bass);
            drawShootingStar(elapsed, delta, treble);
            ctx.globalCompositeOperation = 'source-over';

            drawDust(elapsed, delta);
        };

        if (staticMode) {
            renderFrame(12, 0.016);
            return;
        }

        const tick = (now: number) => {
            const delta = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.05) : 0.016;
            lastFrameAt = now;
            const elapsed = (now - startedAt) / 1000;
            lastElapsed = elapsed;
            renderFrame(elapsed, delta);
            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);

        const resizeObserver = new ResizeObserver(() => {
            renderFrame(lastElapsed, 0.016);
        });
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        return () => {
            window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
        };
    }, [audioPower, audioBands, staticMode, paused, isDaylight]);

    return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
};

// Darkens a base rgb triple towards night sky values.
const mixTowards = (r: number, g: number, b: number, amount: number): [number, number, number] => [
    Math.round(r * (1 - amount)),
    Math.round(g * (1 - amount)),
    Math.round(b * (1 - amount) + 8 * amount),
];

export default AuroraCanvas;
