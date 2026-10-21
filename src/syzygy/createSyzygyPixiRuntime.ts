// Bespoke Pixi WebGL director for the Syzygy (朔望) astronomical visualizer.
// Zero dependency on Sonnet scene builder; drives independent Keplerian orbits,
// astrolabe reticles, relativistic Doppler kinematics, and celestial camera trajectories.
import { deferStagePresentation } from '../folia/presentation';
import type { MotionValue } from 'framer-motion';
import type { AudioBands, SonnetTuning, Theme } from '../vendor/folia/types';
import type { SyzygyProgram } from './syzygyTypes';
import { findSyzygyParagraphIndex } from './syzygyProgram';
import { buildSyzygyScene, type SyzygySceneView } from './syzygySceneBuilder';
import {
    clamp01,
    resolveSyzygyCameraPath,
    resolveSyzygyCelestialBreath,
} from './syzygyMotion';
import { loadPixi } from '../vendor/folia/components/visualizer/loadPixi';
import { resolveThemeFontStack } from '../vendor/folia/utils/fontStacks';

type PixiModule = typeof import('pixi.js');

export interface SyzygySongMetadata {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
}

export interface SyzygySongContext {
    seed: string | number | undefined;
    program: SyzygyProgram;
    theme: Theme;
}

export interface SyzygyRuntimeOptions {
    host: HTMLDivElement;
    songSeed?: string | number;
    program: SyzygyProgram;
    theme: Theme;
    tuning: SonnetTuning;
    currentTime: MotionValue<number>;
    audioPower?: MotionValue<number>;
    audioBands?: AudioBands;
    lyricsFontScale: number;
    staticMode: boolean;
    transparentBackground: boolean;
    paused: boolean;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    signal?: AbortSignal;
    modulation?: Record<string, number>;
}

const colorNumber = (pixi: PixiModule, color: string) => pixi.Color.shared.setValue(color).toNumber();

export class SyzygyPixiRuntime {
    private readonly sceneCache = new Map<number, SyzygySceneView>();
    private activeParagraphIndex = -1;
    private destroyed = false;
    private resizeObserver: ResizeObserver | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    private sceneContainer!: import('pixi.js').Container;
    private creditsContainer!: import('pixi.js').Container;
    private swapCover: import('pixi.js').Graphics | null = null;

    private metadata: SyzygySongMetadata;

    private constructor(
        private readonly pixi: PixiModule,
        private readonly options: SyzygyRuntimeOptions,
        private readonly app: import('pixi.js').Application,
    ) {
        this.metadata = {
            title: options.songTitle,
            artist: options.songArtist,
            album: options.songAlbum,
        };
    }

    static async create(options: SyzygyRuntimeOptions): Promise<SyzygyPixiRuntime> {
        const pixi = await loadPixi();
        const app = new pixi.Application();
        const width = Math.max(options.host.clientWidth, 320);
        const height = Math.max(options.host.clientHeight, 240);

        await app.init({
            width,
            height,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: options.tuning?.textureResolution ?? 1,
            autoStart: false,
            sharedTicker: false,
            preference: 'webgl',
            powerPreference: 'high-performance',
        });

        // Ensure canvas styles occupy 100% of host
        if (app.canvas) {
            app.canvas.style.cssText = 'width: 100%; height: 100%; display: block;';
        }

        const present = app.render.bind(app);
        app.ticker.remove(app.render, app);
        app.render = () => { if (!deferStagePresentation()) present(); };
        app.ticker.add(app.render, app, pixi.UPDATE_PRIORITY.LOW);

        const runtime = new SyzygyPixiRuntime(pixi, options, app);
        runtime.sceneContainer = new pixi.Container();
        runtime.creditsContainer = new pixi.Container();
        app.stage.addChild(runtime.sceneContainer, runtime.creditsContainer);

        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Syzygy Pixi runtime creation aborted', 'AbortError');
        }

        runtime.install(options.host);
        runtime.buildCreditsCard();

        // Ticker loop
        app.ticker.add(runtime.renderFrame);
        if (!options.paused) {
            app.start();
        }

        return runtime;
    }

    install(host: HTMLDivElement) {
        if (!host.contains(this.app.canvas)) {
            host.appendChild(this.app.canvas);
        }
        this.resizeToHost();

        this.resizeObserver = new ResizeObserver(() => this.resizeToHost());
        this.resizeObserver.observe(host);

        // Frame export capture listener
        host.ownerDocument.defaultView?.addEventListener('verse:before-capture', this.captureFrame);
    }

    setSongMetadata(meta: SyzygySongMetadata) {
        this.metadata = { ...this.metadata, ...meta };
        this.buildCreditsCard();
    }

    resizeToHost() {
        if (this.destroyed) return;
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);

        if (width === this.lastWidth && height === this.lastHeight) return;
        this.lastWidth = width;
        this.lastHeight = height;

        this.app.renderer.resize(width, height);
        // Clear cached scenes to recompute layouts at new dimensions
        this.clearScenes();
        this.buildCreditsCard();
        this.syncAtTime(this.options.currentTime.get());
    }

    private clearScenes() {
        this.sceneCache.forEach(scene => scene.destroy());
        this.sceneCache.clear();
        this.sceneContainer.removeChildren();
        this.activeParagraphIndex = -1;
    }

    private getOrCreateScene(paraIndex: number): SyzygySceneView | null {
        if (paraIndex < 0 || !this.options.program.paragraphs[paraIndex]) return null;

        let scene = this.sceneCache.get(paraIndex);
        if (!scene) {
            const paragraph = this.options.program.paragraphs[paraIndex];
            scene = buildSyzygyScene(
                this.pixi,
                {
                    host: this.options.host,
                    theme: this.options.theme,
                    lyricsFontScale: this.options.lyricsFontScale,
                    staticMode: this.options.staticMode,
                    transparentBackground: this.options.transparentBackground,
                },
                paragraph,
            );
            this.sceneCache.set(paraIndex, scene);
            this.sceneContainer.addChild(scene.container);
        }
        return scene;
    }

    private buildCreditsCard() {
        const { Container, Graphics, Text, TextStyle } = this.pixi;
        this.creditsContainer.removeChildren();

        const width = this.lastWidth || 1280;
        const height = this.lastHeight || 720;
        const theme = this.options.theme;
        const primaryCol = colorNumber(this.pixi, theme.primaryColor);
        const accentCol = colorNumber(this.pixi, theme.accentColor);

        const card = new Container();
        this.creditsContainer.addChild(card);

        const title = this.metadata.title || '';
        const artist = this.metadata.artist || '';
        const album = this.metadata.album || '';

        if (!title && !artist) {
            this.creditsContainer.visible = false;
            return;
        }

        const baseFontFamily = resolveThemeFontStack(theme);
        const monoFont = '"IBM Plex Mono", Consolas, monospace';

        // Astronomical reticle badge
        const badgeGfx = new Graphics();
        const badgeW = Math.min(width * 0.5, 480);
        const badgeH = 160;
        const bx = (width - badgeW) / 2;
        const by = (height - badgeH) / 2;

        badgeGfx.rect(bx, by, badgeW, badgeH)
            .stroke({ color: primaryCol, width: 1, alpha: 0.25 });
        badgeGfx.circle(bx, by, 3).fill({ color: accentCol, alpha: 0.7 });
        badgeGfx.circle(bx + badgeW, by, 3).fill({ color: accentCol, alpha: 0.7 });
        badgeGfx.circle(bx, by + badgeH, 3).fill({ color: accentCol, alpha: 0.7 });
        badgeGfx.circle(bx + badgeW, by + badgeH, 3).fill({ color: accentCol, alpha: 0.7 });

        card.addChild(badgeGfx);

        // Song Title
        const titleStyle = new TextStyle({
            fontFamily: baseFontFamily,
            fontWeight: '800',
            fontSize: Math.min(36, width * 0.032),
            fill: '#ffffff',
            align: 'center',
            dropShadow: {
                color: theme.accentColor,
                alpha: 0.85,
                blur: 16,
                distance: 0,
            },
        });
        const titleText = new Text({ text: title, style: titleStyle });
        titleText.anchor.set(0.5);
        titleText.position.set(width / 2, by + 50);
        card.addChild(titleText);

        // Artist & Epoch annotation
        const subStyle = new TextStyle({
            fontFamily: monoFont,
            fontSize: Math.min(14, width * 0.014),
            fill: theme.primaryColor,
            letterSpacing: 2,
        });
        const subLine = [artist, album].filter(Boolean).join(' · ');
        const subText = new Text({ text: subLine ? `✦ ${subLine} ✦` : '✦ SYZYGY ✦', style: subStyle });
        subText.anchor.set(0.5);
        subText.alpha = 0.75;
        subText.position.set(width / 2, by + 95);
        card.addChild(subText);

        const epochText = new Text({
            text: 'CELESTIAL RECORD · CONJUNCTION J2026.5',
            style: new TextStyle({
                fontFamily: monoFont,
                fontSize: 10,
                fill: theme.primaryColor,
                letterSpacing: 1.5,
            }),
        });
        epochText.anchor.set(0.5);
        epochText.alpha = 0.4;
        epochText.position.set(width / 2, by + 130);
        card.addChild(epochText);

        card.alpha = 0;
        this.creditsContainer.visible = false;
    }

    private syncAtTime(time: number) {
        const paragraphs = this.options.program.paragraphs;
        if (!paragraphs || paragraphs.length === 0) return;

        const currentParaIndex = findSyzygyParagraphIndex(this.options.program, time);

        // Scene switching
        if (currentParaIndex !== this.activeParagraphIndex) {
            this.sceneCache.forEach((s, idx) => {
                s.container.visible = (idx === currentParaIndex);
            });
            this.activeParagraphIndex = currentParaIndex;
        }

        const activeScene = this.getOrCreateScene(currentParaIndex);
        if (!activeScene) return;

        activeScene.container.visible = true;

        // Audio reactivity inputs
        const bass = this.options.audioBands?.bass?.get() ?? 0;
        const vocal = this.options.audioBands?.vocal?.get() ?? 0;
        const power = this.options.audioPower?.get() ?? 0;

        activeScene.update(time, bass, vocal, power);

        // Camera positioning & focal tracking
        const activeShotView = activeScene.shots.find(s => time >= s.shot.startTime && time <= s.shot.endTime)
            ?? activeScene.shots[0];

        if (activeShotView) {
            const shot = activeShotView.shot;
            const progress = clamp01((time - shot.startTime) / Math.max(0.1, shot.duration));
            const cam = resolveSyzygyCameraPath(shot.kind, progress, shot.orbitAngle);
            const breath = resolveSyzygyCelestialBreath(time, shot.celestialSeed);

            const width = this.lastWidth || 1280;
            const height = this.lastHeight || 720;

            activeShotView.container.position.set(
                width / 2 + (cam.x + breath.x) * width,
                height / 2 + (cam.y + breath.y) * height,
            );
            activeShotView.container.scale.set(cam.zoom + breath.zoom);
            activeShotView.container.rotation = cam.rotation + breath.rotation;
        }

        // Outro Credits display
        const lastPara = paragraphs[paragraphs.length - 1];
        const songEndTime = lastPara ? lastPara.endTime : 0;
        if (songEndTime > 0 && time >= songEndTime - 0.2) {
            this.creditsContainer.visible = true;
            const outroProgress = clamp01((time - (songEndTime - 0.2)) / 0.8);
            this.creditsContainer.alpha = outroProgress;
        } else {
            this.creditsContainer.visible = false;
        }
    }

    private readonly renderFrame = () => {
        if (this.destroyed) return;
        const time = this.options.currentTime.get();
        this.syncAtTime(time);
        this.app.render();
    };

    readonly captureFrame = (timeOverride?: number | Event) => {
        if (this.destroyed) return;
        const targetTime = typeof timeOverride === 'number'
            ? timeOverride
            : this.options.currentTime.get();
        this.syncAtTime(targetTime);
        this.app.render();
    };

    async swapSong(song: SyzygySongContext, _signal?: AbortSignal): Promise<void> {
        if (this.destroyed) return;
        // Fade through cosmic void
        const width = this.lastWidth || 1280;
        const height = this.lastHeight || 720;

        if (!this.swapCover) {
            this.swapCover = new this.pixi.Graphics();
            this.app.stage.addChild(this.swapCover);
        }

        const bgCol = colorNumber(this.pixi, song.theme.backgroundColor);

        // Brief smooth black hole transit
        this.swapCover.clear()
            .rect(0, 0, width, height)
            .fill({ color: bgCol, alpha: 0.9 });

        this.clearScenes();
        this.options.program = song.program;
        this.options.theme = song.theme;
        this.options.songSeed = song.seed;

        this.syncAtTime(this.options.currentTime.get());

        // Dissolve cover
        if (this.swapCover) {
            this.app.stage.removeChild(this.swapCover);
            this.swapCover.destroy();
            this.swapCover = null;
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.options.host.ownerDocument.defaultView?.removeEventListener('verse:before-capture', this.captureFrame);
        this.resizeObserver?.disconnect();
        this.app.ticker.remove(this.renderFrame);
        this.clearScenes();
        this.creditsContainer.destroy({ children: true });
        this.app.destroy(true, { children: true, texture: false });
    }
}
