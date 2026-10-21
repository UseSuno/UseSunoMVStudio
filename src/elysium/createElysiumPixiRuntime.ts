import { deferStagePresentation, isLayeredPresentation } from '../folia/presentation';
import type { MotionValue } from 'framer-motion';
import type { AudioBands, SonnetTuning, Theme } from '../vendor/folia/types';
import type { SonnetProgram } from '../vendor/folia/components/visualizer/sonnet/types';
import { findSonnetParagraphIndexAtTime } from '../vendor/folia/components/visualizer/sonnet/sonnetProgram';
import { buildSonnetIconDataUrl, buildSonnetIconTextureKey, resolveSonnetIconNames } from '../vendor/folia/components/visualizer/sonnet/sonnetIcons';
import {
    clamp01,
    resolveSonnetAnimationScale,
    resolveSonnetFocusWeights,
    resolveSonnetSmoothedCameraFocus,
} from '../vendor/folia/components/visualizer/sonnet/sonnetMotion';
import { buildSonnetScene, type SceneView, type ShotView } from '../vendor/folia/components/visualizer/sonnet/sonnetSceneBuilder';
import { getSonnetTexturePool } from '../vendor/folia/components/visualizer/sonnet/sonnetTexturePool';
import {
    destroySonnetContainerChildren,
    unloadSonnetDisplayTree,
} from '../vendor/folia/components/visualizer/sonnet/sonnetPixiResources';
import {
    buildSonnetCreditsPoster,
    hasSonnetCreditsMetadata,
    resolveSonnetCreditsFrame,
} from '../vendor/folia/components/visualizer/sonnet/sonnetCredits';
import { loadPixi } from '../vendor/folia/components/visualizer/loadPixi';
import { sonnetDebugState } from '../vendor/folia/components/visualizer/sonnet/sonnetDebug';
import { resolveSonnetSegmentCameraFocus } from '../vendor/folia/components/visualizer/sonnet/sonnetCameraTracking';
import {
    resolveElysiumGlyphTransform,
    easeElysiumSnap,
    resolveElysiumIsDaylight,
} from './elysiumMotion';
import {
    buildElysiumSpatialMap,
    resolveElysiumContinuousCamera,
    projectElysium3DTo2D,
    type ElysiumSpatialShotMeta,
    type ElysiumProjectedFrame,
} from './elysiumSpatial';

// src/elysium/createElysiumPixiRuntime.ts
// Elysium visualizer runtime: modern cinema-grade kinetic typography & spatial datum visualizer.
// Purges Sonnet's vintage editorial clutter and features high-tension snap entry,
// real-time active singing vocal highlighting with laser playhead tracking,
// cinema reticle viewport HUD, and spatial Z-axis plunge camera dynamics.
type PixiModule = typeof import('pixi.js');

export interface ElysiumSongMetadata {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
}

export interface ElysiumSongContext {
    seed: string | number | undefined;
    program: SonnetProgram;
    theme: Theme;
    isDaylight?: boolean;
}

export const ELYSIUM_SONG_SWAP_MS = 560;
const ELYSIUM_SWAP_STAGE_PROGRESS = 0.35;

export function formatElysiumTimecode(seconds: number): string {
    const s = Math.max(0, seconds);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const frames = Math.floor((s * 30) % 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export { resolveElysiumIsDaylight } from './elysiumMotion';

export function buildElysiumTuning(tuning?: Partial<SonnetTuning>): SonnetTuning {
    return {
        cameraIntensity: 1,
        typographyMotion: 1,
        mgDensity: 1,
        showOnlyText: false,
        textureResolution: 1.5,
        enableTransitions: true,
        postProcessEnabled: false,
        postProcessGrain: 0.2,
        postProcessContrast: 0,
        postProcessRgbShift: 0,
        postProcessHalftone: 0,
        postProcessVignette: 0.85,
        postProcessLensDistortion: 0.3,
        postProcessLensDispersion: 0.6,
        ...tuning,
        // Enforce Elysium distinction: purge Sonnet's vintage editorial clutter
        showGuide: false, // No vintage 5-line musical staff
        showBackgroundMg: false, // No Sonnet retro molecules, cuboids, cyber mountains
        showFixedGeo: false, // No retro postal stamps / hatches
        showGiantDecorativeText: false, // No giant decorative background alphabet letters
        showBackgroundDecor: false, // No retro clip-art icons (anchors, gears, leaves)
        outerFrameMode: 'none', // No vintage magazine borders
    };
}

interface ElysiumIconTextures {
    textures: Map<string, import('pixi.js').Texture>;
    urls: Set<string>;
}

export interface ElysiumRuntimeOptions {
    host: HTMLDivElement;
    songSeed?: string | number;
    program: SonnetProgram;
    theme: Theme;
    tuning: SonnetTuning;
    currentTime: MotionValue<number>;
    audioPower?: MotionValue<number>;
    audioBands?: AudioBands;
    lyricsFontScale: number;
    staticMode: boolean;
    transparentBackground: boolean;
    paused: boolean;
    isDaylight?: boolean;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    signal?: AbortSignal;
    modulation?: Record<string, number>;
}

export class ElysiumPixiRuntime {
    private readonly sceneCache = new Map<number, SceneView>();
    private readonly iconTextures = new Map<string, import('pixi.js').Texture>();
    private readonly iconUrls = new Set<string>();
    private activeParagraphIndex = -1;
    private spatialMap: ElysiumSpatialShotMeta[] = [];
    private destroyed = false;
    private songSwap: {
        pending: ElysiumSongContext | null;
        pendingIcons: ElysiumIconTextures | null;
        staged: { scene: SceneView; index: number } | null;
        startedAt: number;
        settle: () => void;
        detachAbort: () => void;
    } | null = null;
    private swapCover: import('pixi.js').Graphics | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    private backdropContainer!: import('pixi.js').Container;
    private backdropGraphics!: import('pixi.js').Graphics;
    private backdropHorizon!: import('pixi.js').Graphics;
    private sceneContainer!: import('pixi.js').Container;
    private foregroundContainer!: import('pixi.js').Container;
    private foregroundGraphics!: import('pixi.js').Graphics;
    private creditsContainer!: import('pixi.js').Container;
    private overlayContainer!: import('pixi.js').Container;
    private outroBlurFilter: import('pixi.js').BlurFilter | null = null;
    private outroBlurScene: SceneView | null = null;

    private constructor(
        private readonly pixi: PixiModule,
        private readonly options: ElysiumRuntimeOptions,
        private readonly app: import('pixi.js').Application,
    ) { }

    static async create(options: ElysiumRuntimeOptions) {
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
            resolution: options.tuning.textureResolution,
            autoStart: false,
            sharedTicker: false,
            preference: 'webgl',
            powerPreference: 'high-performance',
        });
        const present = app.render.bind(app);
        app.ticker.remove(app.render, app);
        app.render = () => { if (!deferStagePresentation()) present(); };
        app.ticker.add(app.render, app, pixi.UPDATE_PRIORITY.LOW);
        const runtime = new ElysiumPixiRuntime(pixi, options, app);
        runtime.backdropContainer = new pixi.Container();
        runtime.backdropGraphics = new pixi.Graphics();
        runtime.backdropHorizon = new pixi.Graphics();
        runtime.backdropContainer.addChild(runtime.backdropGraphics, runtime.backdropHorizon);

        runtime.sceneContainer = new pixi.Container();

        runtime.foregroundContainer = new pixi.Container();
        runtime.foregroundGraphics = new pixi.Graphics();
        runtime.foregroundContainer.addChild(runtime.foregroundGraphics);

        runtime.creditsContainer = new pixi.Container();
        runtime.overlayContainer = new pixi.Container();
        app.stage.addChild(
            runtime.backdropContainer,
            runtime.sceneContainer,
            runtime.foregroundContainer,
            runtime.creditsContainer,
            runtime.overlayContainer,
        );

        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Elysium runtime creation was cancelled', 'AbortError');
        }
        app.canvas.dataset.captureReady = 'false';
        options.host.appendChild(app.canvas);
        app.canvas.style.cssText = 'width:100%;height:100%;display:block';
        await runtime.preloadIcons();
        if (options.signal?.aborted) {
            runtime.destroy();
            throw new DOMException('Elysium runtime creation was cancelled', 'AbortError');
        }
        runtime.install();
        return runtime;
    }

    private captureFrame = () => { if (isLayeredPresentation()) this.renderFrame(); else this.renderOnce(); };

    private install() {
        this.options.host.ownerDocument.defaultView?.addEventListener('verse:before-capture', this.captureFrame);
        this.resizeToHost();
        this.app.ticker.add(this.renderFrame);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.destroyed || !this.resizeToHost()) return;
            if (this.options.paused) this.renderOnce();
        });
        this.resizeObserver.observe(this.options.host);
        this.renderOnce();
        this.app.canvas.dataset.captureReady = 'true';
        if (!this.options.paused) this.app.start();
    }

    private resizeToHost() {
        if (this.destroyed) return false;
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);
        if (width === this.lastWidth && height === this.lastHeight) return false;
        this.lastWidth = width;
        this.lastHeight = height;
        this.app.renderer.resize(width, height);
        if (this.songSwap?.staged) {
            this.destroyScene(this.songSwap.staged.scene);
            this.songSwap.staged = null;
        }
        this.clearScenes();
        this.drawCredits(width, height);
        this.setupHud(width, height);
        return true;
    }

    private drawCredits(width: number, height: number) {
        destroySonnetContainerChildren(this.creditsContainer);
        if (this.options.tuning.showOnlyText) return;
        const metadata = {
            title: this.options.songTitle,
            artist: this.options.songArtist,
            album: this.options.songAlbum,
        };
        if (!hasSonnetCreditsMetadata(metadata)) return;
        this.creditsContainer.addChild(buildSonnetCreditsPoster(
            this.pixi,
            this.options.theme,
            metadata,
            width,
            height,
            this.options.lyricsFontScale,
        ));
        this.creditsContainer.pivot.set(width / 2, height / 2);
        this.creditsContainer.position.set(width / 2, height / 2);
        this.creditsContainer.visible = false;
    }

    setSongMetadata(metadata: ElysiumSongMetadata) {
        if (this.destroyed) return;
        const changed = this.options.songTitle !== metadata.title
            || this.options.songArtist !== metadata.artist
            || this.options.songAlbum !== metadata.album;
        if (!changed) return;

        this.options.songTitle = metadata.title;
        this.options.songArtist = metadata.artist;
        this.options.songAlbum = metadata.album;
        if (this.lastWidth > 0 && this.lastHeight > 0) {
            this.drawCredits(this.lastWidth, this.lastHeight);
            if (this.options.paused) this.renderOnce();
        }
    }

    private clearOutroBlur() {
        if (this.outroBlurFilter && this.outroBlurScene) {
            this.outroBlurScene.container.filters = (this.outroBlurScene.container.filters ?? [])
                .filter(filter => filter !== this.outroBlurFilter);
            this.outroBlurFilter.destroy();
        }
        this.outroBlurFilter = null;
        this.outroBlurScene = null;
    }

    private updateOutroBlur(scene: SceneView, strength: number) {
        if (strength <= 0) {
            this.clearOutroBlur();
            return;
        }
        if (this.outroBlurScene !== scene) this.clearOutroBlur();
        if (!this.outroBlurFilter) {
            this.outroBlurFilter = new this.pixi.BlurFilter({
                strength: 0,
                quality: 2,
                kernelSize: 5,
                resolution: 0.75,
            });
            this.outroBlurFilter.repeatEdgePixels = true;
            scene.container.filters = [...(scene.container.filters ?? []), this.outroBlurFilter];
            this.outroBlurScene = scene;
        }
        this.outroBlurFilter.strength = strength;
    }

    private setupHud(_width: number, _height: number) {
        if (this.destroyed) return;
        // REC / FPS / Viewfinder technical overlay removed per user request
        this.backdropGraphics.clear();
        this.backdropHorizon.clear();
        this.foregroundGraphics.clear();
        this.backdropContainer.visible = false;
        this.foregroundContainer.visible = false;
    }

    private updateHudFrame(
        _time: number,
        _width: number,
        _height: number,
        _audioBass: number,
        _audioPower: number,
        _activeShotGlobal?: number,
        _totalShotsGlobal?: number,
        _flightProgress?: number,
    ) {
        this.backdropContainer.visible = false;
        this.foregroundContainer.visible = false;
    }

    private async loadIconTextures(theme: Theme): Promise<ElysiumIconTextures> {
        const loaded: ElysiumIconTextures = { textures: new Map(), urls: new Set() };
        if (this.options.tuning.showOnlyText || !this.options.tuning.showBackgroundDecor) return loaded;
        const names = resolveSonnetIconNames(theme.lyricsIcons);
        const resolution = this.options.tuning.textureResolution;
        const texturePool = getSonnetTexturePool(this.pixi);
        await Promise.all(names.map(async (name, index) => {
            const size = 192 + (index % 4) * 32;
            const colors = [
                theme.accentColor,
                theme.secondaryColor,
                theme.primaryColor,
            ];
            const color = colors[index % colors.length];
            const key = buildSonnetIconTextureKey(name, color, 3.5, size, resolution);
            const url = buildSonnetIconDataUrl(name, color, 3.5, size);
            if (!url) return;
            try {
                loaded.textures.set(key, await texturePool.acquire(url));
                loaded.urls.add(url);
            } catch {
                // Ignore optional decorative icon failures
            }
        }));
        return loaded;
    }

    private releaseIconUrls(urls: Set<string>) {
        const texturePool = getSonnetTexturePool(this.pixi);
        urls.forEach(url => {
            texturePool.release(url);
        });
        urls.clear();
    }

    private async preloadIcons() {
        const loaded = await this.loadIconTextures(this.options.theme);
        loaded.textures.forEach((texture, key) => this.iconTextures.set(key, texture));
        loaded.urls.forEach(url => this.iconUrls.add(url));
    }

    private clearScenes() {
        this.clearOutroBlur();
        this.sceneCache.forEach(scene => {
            this.destroyScene(scene);
        });
        this.sceneCache.clear();
        this.activeParagraphIndex = -1;
        this.spatialMap = [];
    }

    private rebuildSpatialMap(width: number, height: number) {
        this.spatialMap = buildElysiumSpatialMap(this.options.program, width, height);
    }

    private destroyScene(scene: SceneView) {
        if (this.outroBlurScene === scene) this.clearOutroBlur();
        this.sceneContainer.removeChild(scene.container);
        unloadSonnetDisplayTree(scene.container);
        scene.container.filters = null;
        scene.shots.forEach(shot => {
            shot.haloLayer.filters = null;
        });
        scene.postProcessFilters.forEach(filter => filter.destroy());
        scene.container.destroy({ children: true });
    }

    private buildScene(
        song: ElysiumSongContext,
        iconTextures: Map<string, import('pixi.js').Texture>,
        index: number,
    ) {
        const elysiumTuning = buildElysiumTuning(this.options.tuning);
        return buildSonnetScene(this.pixi, {
            programSeed: song.program.seed,
            host: this.options.host,
            theme: song.theme,
            tuning: elysiumTuning,
            lyricsFontScale: this.options.lyricsFontScale,
            staticMode: this.options.staticMode,
            transparentBackground: this.options.transparentBackground,
        }, iconTextures, song.program.paragraphs[index]);
    }

    private get liveSong(): ElysiumSongContext {
        return {
            seed: this.options.songSeed,
            program: this.options.program,
            theme: this.options.theme,
            isDaylight: this.options.isDaylight,
        };
    }

    private ensureScene(index: number) {
        if (index < 0 || index >= this.options.program.paragraphs.length) return null;
        const cached = this.sceneCache.get(index);
        if (cached) return cached;
        const scene = this.buildScene(this.liveSong, this.iconTextures, index);
        this.sceneCache.set(index, scene);
        this.sceneContainer.addChild(scene.container);
        return scene;
    }

    private updateShot3D(
        view: ShotView,
        time: number,
        width: number,
        height: number,
        proj: ElysiumProjectedFrame,
        shotAlpha: number,
        isCurrentFocus: boolean,
    ) {
        const motion = this.options.tuning.typographyMotion * resolveSonnetAnimationScale(this.options.theme) * this.mod('motionScale');
        const camera = this.options.tuning.cameraIntensity * resolveSonnetAnimationScale(this.options.theme) * this.mod('cameraScale');

        let currentFocusX = view.basePivotX;
        let currentFocusY = view.basePivotY;

        let trackSegments = view.segments.filter(s => s.role !== 'decoration' && s.trackingGlyphs.length > 0);
        if (trackSegments.length === 0) {
            trackSegments = view.segments.filter(s => s.trackingGlyphs.length > 0);
        }

        if (isCurrentFocus && trackSegments.length > 0) {
            const focusRanges = trackSegments.map(segment => ({
                startTime: segment.trackingGlyphs[0]?.startTime ?? view.shot.startTime,
                endTime: segment.trackingGlyphs.at(-1)?.startTime ?? view.shot.endTime,
            }));
            const resolveFocusAtTime = (focusTime: number) => {
                let focusX = 0;
                let focusY = 0;
                const focusWeights = resolveSonnetFocusWeights(focusRanges, focusTime);
                for (let i = 0; i < trackSegments.length; i++) {
                    const seg = trackSegments[i];
                    if (seg.trackingGlyphs.length === 0) continue;
                    const weight = focusWeights[i] ?? 0;
                    const pos = resolveSonnetSegmentCameraFocus(seg.trackingGlyphs, focusTime, 0.88);
                    focusX += pos.x * weight;
                    focusY += pos.y * weight;
                }
                return { x: focusX, y: focusY };
            };
            const focusTime = Math.max(view.shot.startTime, Math.min(time, view.shot.endTime));
            const smoothedFocus = resolveSonnetSmoothedCameraFocus(
                focusTime,
                view.shot.startTime,
                view.shot.endTime,
                resolveFocusAtTime,
            );

            currentFocusX = smoothedFocus.x;
            currentFocusY = smoothedFocus.y;
        }

        // Full tracking weight when active so singing characters stay centered and in-bounds
        const trackWeight = isCurrentFocus ? Math.min(1.0, 0.92 * camera) : 0;
        view.container.pivot.set(
            view.basePivotX + (currentFocusX - view.basePivotX) * trackWeight,
            view.basePivotY + (currentFocusY - view.basePivotY) * trackWeight,
        );

        // Entrance Z-plunge (only on active focus shot)
        const shotElapsed = Math.max(0, time - view.shot.startTime);
        const plungeDuration = 0.38;
        const plungeU = clamp01(shotElapsed / plungeDuration);
        const plungeSnapped = easeElysiumSnap(plungeU);
        const entrancePlunge = isCurrentFocus ? (1 + (1 - clamp01(plungeSnapped)) * 0.08 * motion) : 1.0;

        let initialScale = proj.scale * entrancePlunge;

        // Bounding box protection: ensure long lyric lines fit comfortably within viewport bounds
        if (trackSegments.length > 0) {
            let minGlyphX = Number.POSITIVE_INFINITY;
            let maxGlyphX = Number.NEGATIVE_INFINITY;
            let minGlyphY = Number.POSITIVE_INFINITY;
            let maxGlyphY = Number.NEGATIVE_INFINITY;

            for (const seg of trackSegments) {
                for (const g of seg.trackingGlyphs) {
                    if (g.isBackgroundShape) continue;
                    if (g.baseX < minGlyphX) minGlyphX = g.baseX;
                    if (g.baseX > maxGlyphX) maxGlyphX = g.baseX;
                    if (g.baseY < minGlyphY) minGlyphY = g.baseY;
                    if (g.baseY > maxGlyphY) maxGlyphY = g.baseY;
                }
            }

            if (minGlyphX < maxGlyphX) {
                const contentW = (maxGlyphX - minGlyphX) + 72;
                const contentH = (maxGlyphY - minGlyphY) + 60;
                if (contentW * initialScale > width * 0.84) {
                    initialScale = Math.min(initialScale, (width * 0.84) / contentW);
                }
                if (contentH * initialScale > height * 0.76) {
                    initialScale = Math.min(initialScale, (height * 0.76) / contentH);
                }
            }
        }

        const totalContainerScale = isCurrentFocus
            ? Math.max(0.40, Math.min(1.04, initialScale))
            : Math.max(0.35, Math.min(1.04, proj.scale));
        view.container.scale.set(totalContainerScale);
        view.container.rotation = proj.rotation;

        // Viewport safe-margin clamping: ensure current singing focus point stays strictly inside safe bounds
        let finalPosX = proj.screenX;
        let finalPosY = proj.screenY;

        if (isCurrentFocus) {
            const relX = currentFocusX - view.container.pivot.x;
            const relY = currentFocusY - view.container.pivot.y;
            const cosR = Math.cos(proj.rotation);
            const sinR = Math.sin(proj.rotation);
            const projectedFocusX = proj.screenX + (relX * cosR - relY * sinR) * totalContainerScale;
            const projectedFocusY = proj.screenY + (relX * sinR + relY * cosR) * totalContainerScale;

            const safeMarginX = Math.max(48, width * 0.10);
            const safeMarginY = Math.max(36, height * 0.12);
            const minSafeX = safeMarginX;
            const maxSafeX = width - safeMarginX;
            const minSafeY = safeMarginY;
            const maxSafeY = height - safeMarginY;

            if (projectedFocusX < minSafeX) {
                finalPosX += (minSafeX - projectedFocusX);
            } else if (projectedFocusX > maxSafeX) {
                finalPosX += (maxSafeX - projectedFocusX);
            }

            if (projectedFocusY < minSafeY) {
                finalPosY += (minSafeY - projectedFocusY);
            } else if (projectedFocusY > maxSafeY) {
                finalPosY += (maxSafeY - projectedFocusY);
            }
        }

        view.container.position.set(finalPosX, finalPosY);
        view.container.alpha = shotAlpha;

        // Purge Sonnet's vintage geometric clutter
        view.mgLayer.visible = false;
        if (view.mgBackgroundLayer) view.mgBackgroundLayer.visible = false;
        if (view.mgGeoLayer) view.mgGeoLayer.visible = false;
        if (view.mgParticleLayer) view.mgParticleLayer.visible = false;
        if (view.mgFixedGeoLayer) view.mgFixedGeoLayer.visible = false;

        // Lazy-init Elysium Laser Playhead Layer on this shot
        if (!(view as any).elysiumPlayheadLayer) {
            const playhead = new this.pixi.Graphics();
            const children = view.container.children ?? [];
            const haloIdx = children.indexOf(view.haloLayer);
            if (haloIdx >= 0) {
                view.container.addChildAt(playhead, haloIdx + 1);
            } else {
                view.container.addChild(playhead);
            }
            (view as any).elysiumPlayheadLayer = playhead;
        }
        const playhead = (view as any).elysiumPlayheadLayer as import('pixi.js').Graphics;
        playhead.clear();

        const isDaylight = Boolean(this.options.isDaylight);
        const accentNum = this.pixi.Color.shared.setValue(this.options.theme?.accentColor || '#ff0055').toNumber();

        // Identify active text segment for this shot to arbitrate background outline decorations
        const textSegments = view.segments.filter(s => s.role !== 'decoration' && s.trackingGlyphs.length > 0);
        let activeTextSegmentIndex = -1;
        if (isCurrentFocus && textSegments.length > 0) {
            for (const seg of textSegments) {
                const segStart = seg.trackingGlyphs[0]?.startTime ?? view.shot.startTime;
                const segEnd = seg.trackingGlyphs.at(-1)?.startTime ?? view.shot.endTime;
                const safeEnd = Math.max(segStart + 0.35, segEnd + 0.35);
                if (time >= segStart && time < safeEnd) {
                    activeTextSegmentIndex = seg.segmentIndex;
                    break;
                }
            }
            if (activeTextSegmentIndex === -1) {
                if (time < (textSegments[0].trackingGlyphs[0]?.startTime ?? view.shot.startTime)) {
                    activeTextSegmentIndex = textSegments[0].segmentIndex;
                } else {
                    let closestSeg = textSegments[0];
                    let minDiff = Number.POSITIVE_INFINITY;
                    for (const seg of textSegments) {
                        const segStart = seg.trackingGlyphs[0]?.startTime ?? view.shot.startTime;
                        const diff = Math.abs(time - segStart);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestSeg = seg;
                        }
                    }
                    activeTextSegmentIndex = closestSeg.segmentIndex;
                }
            }
        }

        // Decoration arbitration:
        // 1. If not current focus shot (!isCurrentFocus): ALL decoration outline segments are hidden completely.
        // 2. On current focus shot: ONLY the FIRST decoration segment matching the currently active text line is shown.
        //    All other decoration segments (other lines, duplicate decorations, dec2) are completely suppressed.
        let allowedDecoSegment: ShotView['segments'][number] | null = null;
        if (isCurrentFocus) {
            if (activeTextSegmentIndex >= 0) {
                allowedDecoSegment = view.segments.find(
                    s => s.role === 'decoration' && s.segmentIndex === activeTextSegmentIndex
                ) ?? null;
            }
            if (!allowedDecoSegment) {
                allowedDecoSegment = view.segments.find(s => s.role === 'decoration') ?? null;
            }
        }

        view.segments.forEach(segmentView => {
            segmentView.guide.container.visible = false;
            if (segmentView.frameDecor) segmentView.frameDecor.container.visible = false;

            const isGiantDecorativeText = segmentView.role === 'decoration';

            // Complete suppression of disallowed decoration segments (prevents overlap of multiple outline layers
            // and completely silences outline layers on all non-focus background shots)
            if (isGiantDecorativeText && segmentView !== allowedDecoSegment) {
                segmentView.glyphs.forEach(glyph => {
                    glyph.display.visible = false;
                    glyph.display.alpha = 0;
                });
                return;
            }

            const textGlyphs = segmentView.glyphs.filter(g => g.isTextGlyph !== false);
            const totalGlyphs = segmentView.glyphs.length;

            segmentView.glyphs.forEach((glyph, glyphIndex) => {
                const showTextGlyph = glyph.isTextGlyph !== false;
                const glyphVisible = isGiantDecorativeText
                    ? (showTextGlyph && !this.options.tuning.showOnlyText)
                    : (this.options.tuning.showOnlyText
                        ? showTextGlyph
                        : (!glyph.isBackgroundShape || this.options.tuning.showBackgroundDecor));

                // In 3D spatial matrix (Sonnet + Fume), characters settle into coordinates on exit
                const resolved = resolveElysiumGlyphTransform(
                    glyph,
                    {
                        time,
                        shotStartTime: view.shot.startTime,
                        shotEndTime: view.shot.endTime,
                        shotKind: view.shot.kind,
                        role: segmentView.role,
                        glyphIndex,
                        totalGlyphs,
                        motion,
                        preserveHistory: true,
                    },
                );

                // Simulated Parallax 3D effect within glyphs
                const depth = glyph.zDepth || 0;
                const parallaxScale = this.mod('parallaxScale');
                const parallaxX = (isCurrentFocus ? depth * 14 * parallaxScale : 0);
                const parallaxY = (isCurrentFocus ? depth * 10 * parallaxScale : 0);
                const depthScale = 1 + depth * 0.25 * parallaxScale;

                // Active vocal singing detection (ONLY on currently focused shot and NEVER on background decoration layer)
                const textIdx = textGlyphs.indexOf(glyph);
                let isSinging = false;
                let singProgress = 0;
                if (isCurrentFocus && !isGiantDecorativeText && textIdx >= 0 && glyph.startTime <= time) {
                    const nextG = textGlyphs[textIdx + 1];
                    const singEnd = nextG ? nextG.startTime : Math.max(glyph.startTime + 0.35, glyph.settleTime + 0.25);
                    const safeSingEnd = singEnd <= glyph.startTime ? glyph.startTime + 0.3 : singEnd;
                    if (time >= glyph.startTime && time < safeSingEnd) {
                        isSinging = true;
                        singProgress = clamp01((time - glyph.startTime) / (safeSingEnd - glyph.startTime));
                    }
                }

                const vocalBounce = isSinging ? (1 + Math.sin(singProgress * Math.PI) * 0.06) : 1.0;
                const isPaused = Boolean(this.options.paused);
                const isPreShot = time < view.shot.startTime;

                let targetAlpha: number;
                let targetVisible: boolean;
                let targetScale: number;
                let targetX: number;
                let targetY: number;
                let targetRotation: number;

                if (isPaused || isPreShot) {
                    targetAlpha = glyphVisible ? (isGiantDecorativeText ? (isDaylight ? 0.28 : 0.20) : (isCurrentFocus ? 0.90 : 0.65)) : 0;
                    targetVisible = glyphVisible && (isCurrentFocus || !isGiantDecorativeText);
                    targetScale = depthScale;
                    targetX = glyph.baseX + parallaxX;
                    targetY = glyph.baseY + parallaxY;
                    targetRotation = glyph.finalRotation;
                } else if (isGiantDecorativeText) {
                    // Background outline decorative layer: serene ambient watermark, no singing progress or brightness spike
                    targetAlpha = (glyphVisible && isCurrentFocus) ? (isDaylight ? 0.28 : 0.20) : 0;
                    targetVisible = glyphVisible && isCurrentFocus;
                    targetScale = (resolved.scale || 1.0) * depthScale;
                    targetX = resolved.x + parallaxX;
                    targetY = resolved.y + parallaxY;
                    targetRotation = resolved.rotation;
                } else {
                    const isUpcomingInShot = isCurrentFocus && time >= view.shot.startTime && time < glyph.startTime;
                    targetAlpha = isUpcomingInShot
                        ? 0.52
                        : (isSinging ? 1.0 : (resolved.alpha > 0 ? Math.max(0.88, resolved.alpha) : 0));
                    targetVisible = glyphVisible && (isUpcomingInShot || resolved.visible);
                    targetScale = (isUpcomingInShot ? 1.0 : resolved.scale) * depthScale * vocalBounce;
                    targetX = (isUpcomingInShot ? glyph.baseX : resolved.x) + parallaxX;
                    targetY = (isUpcomingInShot ? glyph.baseY : resolved.y) + parallaxY;
                    targetRotation = isUpcomingInShot ? glyph.finalRotation : resolved.rotation;
                }

                glyph.display.alpha = targetAlpha;
                glyph.display.visible = targetVisible;
                glyph.display.scale.set(targetScale);
                glyph.display.position.set(targetX, targetY);
                glyph.display.rotation = targetRotation;

                // Precision Optical Laser Playhead (Only on currently focused shot and active foreground singing glyph, NEVER on background outline decoration)
                if (isCurrentFocus && isSinging && !isGiantDecorativeText && !isPaused && !isPreShot && targetVisible && !this.options.tuning.showOnlyText) {
                    const charSize = (view.debugInfo?.baseFontSize || 48) * (segmentView.fontScale || 1);
                    const halfW = charSize * 0.48;
                    const cos = Math.cos(targetRotation);
                    const sin = Math.sin(targetRotation);

                    const ox = -sin * (charSize * 0.52);
                    const oy = cos * (charSize * 0.52);
                    const tx = cos * halfW;
                    const ty = sin * halfW;

                    const startX = targetX + ox - tx;
                    const startY = targetY + oy - ty;
                    const endX = targetX + ox + tx;
                    const endY = targetY + oy + ty;

                    const headX = startX + (endX - startX) * singProgress;
                    const headY = startY + (endY - startY) * singProgress;

                    const beamThickness = isDaylight ? 2.0 : 2.4;
                    playhead.moveTo(startX, startY).lineTo(endX, endY)
                        .stroke({ color: accentNum, width: beamThickness, alpha: isDaylight ? 0.85 : 0.95 });

                    if (!isDaylight) {
                        playhead.moveTo(startX - tx * 0.15, startY - ty * 0.15).lineTo(endX + tx * 0.15, endY + ty * 0.15)
                            .stroke({ color: accentNum, width: beamThickness * 2.2, alpha: 0.35 });
                    }

                    const spotRadius = isDaylight ? 2.6 : 3.0;
                    playhead.circle(headX, headY, spotRadius).fill({ color: isDaylight ? accentNum : 0xffffff, alpha: 0.95 });

                    const tickSize = 4.0;
                    const normScale = tickSize / (charSize * 0.52);
                    playhead.moveTo(headX - ox * normScale, headY - oy * normScale)
                        .lineTo(headX + ox * normScale, headY + oy * normScale)
                        .stroke({ color: isDaylight ? accentNum : 0xffffff, width: 1.8, alpha: 1.0 });

                    const rayDist = 14;
                    const rayScale = rayDist / (charSize * 0.52);
                    playhead.moveTo(startX, startY)
                        .lineTo(endX, endY)
                        .lineTo(endX + ox * rayScale + tx * 0.1, endY + oy * rayScale + ty * 0.1)
                        .lineTo(startX + ox * rayScale - tx * 0.1, startY + oy * rayScale - ty * 0.1)
                        .fill({ color: accentNum, alpha: isDaylight ? 0.05 : 0.12 });
                }

                // Halos (active focus shot only, not decoration)
                if (glyph.halo) {
                    glyph.halo.alpha = isCurrentFocus && !isGiantDecorativeText ? resolved.haloAlpha : 0;
                    glyph.halo.scale.set(resolved.haloScale);
                    glyph.halo.position.set(targetX, targetY);
                    glyph.halo.rotation = targetRotation;
                }

                // Chromatic Aberration (active focus shot only, not decoration)
                if (glyph.caCyan && glyph.caRed && glyph.caOffset) {
                    glyph.caCyan.visible = isCurrentFocus && !isGiantDecorativeText && targetVisible && !isDaylight && !this.options.tuning.showOnlyText;
                    glyph.caRed.visible = isCurrentFocus && !isGiantDecorativeText && targetVisible && !isDaylight && !this.options.tuning.showOnlyText;
                    if (isCurrentFocus && !isGiantDecorativeText && !isDaylight) {
                        const caDist = (resolved.caOffset || glyph.caOffset * 0.5) * this.mod('caScale');
                        glyph.caCyan.position.set(-caDist, caDist * 0.5);
                        glyph.caRed.position.set(caDist, -caDist * 0.5);
                        glyph.caCyan.blendMode = 'screen';
                        glyph.caRed.blendMode = 'screen';
                    }
                }

                // Ghosts (active focus shot only, not decoration)
                if (glyph.ghosts && glyph.ghostDuration) {
                    const ghostActive = isCurrentFocus && !isGiantDecorativeText && resolved.ghostActive && glyphVisible && !this.options.tuning.showOnlyText;
                    const ghostU = resolved.ghostProgress;
                    const envelope = ghostU <= 0.2
                        ? ghostU / 0.2
                        : Math.pow(1 - (ghostU - 0.2) / 0.8, 2);
                    const spread = (1 - Math.pow(1 - ghostU, 3)) * this.mod('ghostScale');
                    for (const ghost of glyph.ghosts) {
                        ghost.node.visible = ghostActive;
                        if (!ghostActive) continue;
                        ghost.node.position.set(ghost.dirX * spread, ghost.dirY * spread);
                        ghost.node.alpha = envelope * ghost.alphaBase * resolved.alpha;
                    }
                }

                glyph.updateAnimation?.(time);
            });
        });
    }

    updateShot(view: ShotView, time: number, width: number, height: number, _shakeIntensity: number) {
        const defaultProj: ElysiumProjectedFrame = {
            screenX: width / 2,
            screenY: height / 2,
            scale: 1.0,
            rotation: 0,
            depth: 0,
            visible: true,
        };
        this.updateShot3D(view, time, width, height, defaultProj, 1.0, true);
    }

    private renderFrame = () => {
        if (this.destroyed) return;
        this.advanceSongSwap();
        if (this.options.program.paragraphs.length === 0) {
            sonnetDebugState.activeShot = null;
            sonnetDebugState.paragraphIndex = -1;
            return;
        }

        const time = this.options.currentTime.get();
        const width = Math.max(this.options.host.clientWidth, 320);
        const height = Math.max(this.options.host.clientHeight, 240);

        if (this.spatialMap.length === 0 || this.lastWidth !== width || this.lastHeight !== height) {
            this.rebuildSpatialMap(width, height);
        }

        // 1. Resolve continuous 3D camera trajectory
        const camera3D = resolveElysiumContinuousCamera(this.spatialMap, time);
        const activeMeta = this.spatialMap[camera3D.activeShotIndex] ?? this.spatialMap[0];
        this.activeParagraphIndex = activeMeta?.paragraphIndex ?? 0;

        // 2. Spatial Window of active + history + upcoming shots
        const minVisibleIdx = Math.max(0, camera3D.activeShotIndex - 1);
        const maxVisibleIdx = Math.min(this.spatialMap.length - 1, camera3D.activeShotIndex + 1);

        // 3. Ensure needed scenes are cached
        const neededParagraphs = new Set<number>();
        for (let i = minVisibleIdx; i <= maxVisibleIdx; i++) {
            neededParagraphs.add(this.spatialMap[i].paragraphIndex);
        }
        neededParagraphs.forEach(pIdx => this.ensureScene(pIdx));

        // Prune distant scenes
        this.sceneCache.forEach((scene, pIdx) => {
            if (!neededParagraphs.has(pIdx) && Math.abs(pIdx - this.activeParagraphIndex) > 2) {
                this.destroyScene(scene);
                this.sceneCache.delete(pIdx);
            }
        });

        // 4. Update HUD frame with 3D chase status
        const audioBass = this.options.audioBands?.bass?.get() ?? 0;
        const audioPower = this.options.audioPower?.get() ?? 0;
        this.updateHudFrame(time, width, height, audioBass, audioPower, camera3D.activeShotIndex, this.spatialMap.length, camera3D.flightProgress);

        // 5. Hide all shots by default in cached scenes & ensure identity transforms on containers
        this.sceneCache.forEach(scene => {
            scene.container.visible = true;
            scene.container.position.set(0, 0);
            scene.container.scale.set(1, 1);
            scene.container.rotation = 0;
            scene.container.alpha = 1.0;
            if (scene.container.children[0]) {
                scene.container.children[0].visible = false;
            }
            scene.shots.forEach(shot => {
                shot.container.visible = false;
            });
        });

        // 6. Project and render shots in the 3D window
        const isDaylight = Boolean(this.options.isDaylight);
        for (let i = minVisibleIdx; i <= maxVisibleIdx; i++) {
            const meta = this.spatialMap[i];
            const scene = this.sceneCache.get(meta.paragraphIndex);
            if (!scene) continue;
            const shotView = scene.shots[meta.shotIndex];
            if (!shotView) continue;

            const proj = projectElysium3DTo2D(meta.anchor, camera3D, width, height, 950);
            if (!proj.visible) {
                shotView.container.visible = false;
                continue;
            }

            shotView.container.visible = true;
            const isCurrentFocus = i === camera3D.activeShotIndex;
            const isPast = i < camera3D.activeShotIndex;
            const isFuture = i > camera3D.activeShotIndex;

            let shotAlpha = 1.0;
            if (isPast) {
                const dist = camera3D.activeShotIndex - i;
                shotAlpha = dist === 1
                    ? (isDaylight ? 0.28 : 0.22)
                    : (isDaylight ? 0.14 : 0.10);
            } else if (isFuture) {
                const dist = i - camera3D.activeShotIndex;
                shotAlpha = dist === 1
                    ? (isDaylight ? 0.22 : 0.18)
                    : (isDaylight ? 0.10 : 0.08);
            } else {
                shotAlpha = 1.0;
            }

            try {
                this.updateShot3D(shotView, time, width, height, proj, shotAlpha, isCurrentFocus);
            } catch (err) {
                console.warn('[Elysium] updateShot3D error:', err);
            }
        }

        // 7. Song outro / Credits poster handling
        const finalParagraph = this.options.program.paragraphs.at(-1);
        const creditsFrame = resolveSonnetCreditsFrame(
            time,
            finalParagraph?.endTime ?? Number.POSITIVE_INFINITY,
        );
        const hasCredits = this.creditsContainer.children.length > 0;
        if (!creditsFrame.active || !hasCredits) {
            this.clearOutroBlur();
        } else {
            const lastScene = this.sceneCache.get(this.options.program.paragraphs.length - 1);
            if (lastScene) this.updateOutroBlur(lastScene, creditsFrame.lyricBlur);
        }
        this.creditsContainer.visible = creditsFrame.active && hasCredits && !this.options.tuning.showOnlyText;
        this.creditsContainer.alpha = creditsFrame.posterAlpha;
        this.creditsContainer.position.set(
            width / 2,
            height / 2 + creditsFrame.posterOffsetY * height,
        );
        this.creditsContainer.scale.set(creditsFrame.posterScale);

        // Set debug state
        const activeScene = this.sceneCache.get(this.activeParagraphIndex);
        sonnetDebugState.activeShot = activeScene?.shots[activeMeta?.shotIndex ?? 0]?.debugInfo ?? null;
        sonnetDebugState.paragraphIndex = this.activeParagraphIndex;
    };

    renderOnce() {
        if (this.destroyed || !this.app.canvas.isConnected) return;
        this.renderFrame();
        if (this.destroyed) return;
        this.app.renderer.render(this.app.stage);
    }

    async swapSong(next: ElysiumSongContext, signal?: AbortSignal): Promise<void> {
        if (this.destroyed) return;
        const isCoverWorthwhile = next.seed !== this.options.songSeed
            && !this.songSwap
            && this.lastWidth > 0
            && this.options.program.paragraphs.length > 0
            && !signal?.aborted;

        const pendingIcons = await this.loadIconTextures(next.theme);
        if (this.destroyed || signal?.aborted) {
            this.releaseIconUrls(pendingIcons.urls);
            return;
        }
        if (!isCoverWorthwhile) {
            this.commitSongContext(next, pendingIcons);
            return;
        }

        await new Promise<void>(resolve => {
            const onAbort = () => this.settleSongSwap();
            this.songSwap = {
                pending: next,
                pendingIcons,
                staged: null,
                startedAt: performance.now(),
                settle: resolve,
                detachAbort: () => signal?.removeEventListener('abort', onAbort),
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            if (this.options.paused) this.app.start();
        });
    }

    private commitSongContext(
        next: ElysiumSongContext,
        icons: ElysiumIconTextures,
        staged?: { scene: SceneView; index: number } | null,
    ) {
        this.options.songSeed = next.seed;
        this.options.program = next.program;
        this.options.theme = next.theme;
        this.options.isDaylight = next.isDaylight ?? resolveElysiumIsDaylight(next.theme);
        this.releaseIconUrls(this.iconUrls);
        this.iconTextures.clear();
        icons.textures.forEach((texture, key) => this.iconTextures.set(key, texture));
        icons.urls.forEach(url => this.iconUrls.add(url));
        this.clearScenes();
        if (staged) {
            staged.scene.container.visible = true;
            this.sceneCache.set(staged.index, staged.scene);
            this.activeParagraphIndex = staged.index;
        }
        if (this.lastWidth > 0 && this.lastHeight > 0) {
            this.drawCredits(this.lastWidth, this.lastHeight);
            this.setupHud(this.lastWidth, this.lastHeight);
        }
    }

    private settleSongSwap() {
        const swap = this.songSwap;
        if (!swap) return;
        this.songSwap = null;
        swap.detachAbort();
        if (this.destroyed) {
            if (swap.pendingIcons) this.releaseIconUrls(swap.pendingIcons.urls);
            if (swap.staged) this.destroyScene(swap.staged.scene);
        } else {
            if (swap.pending && swap.pendingIcons) {
                this.commitSongContext(swap.pending, swap.pendingIcons, swap.staged);
            } else if (swap.staged) {
                this.destroyScene(swap.staged.scene);
            }
            if (this.options.paused) this.app.stop();
        }
        this.disposeSwapCover();
        swap.settle();
    }

    private disposeSwapCover() {
        if (!this.swapCover) return;
        this.app.stage.removeChild(this.swapCover);
        this.swapCover.destroy();
        this.swapCover = null;
    }

    private advanceSongSwap() {
        const swap = this.songSwap;
        if (!swap) return;
        const progress = (performance.now() - swap.startedAt) / ELYSIUM_SONG_SWAP_MS;
        if (swap.pending && swap.pendingIcons && !swap.staged && progress >= ELYSIUM_SWAP_STAGE_PROGRESS) {
            const index = findSonnetParagraphIndexAtTime(
                swap.pending.program,
                this.options.currentTime.get(),
            );
            if (index >= 0 && index < swap.pending.program.paragraphs.length) {
                const scene = this.buildScene(swap.pending, swap.pendingIcons.textures, index);
                scene.container.visible = false;
                this.sceneContainer.addChild(scene.container);
                swap.staged = { scene, index };
            }
        }
        if (swap.pending && swap.pendingIcons && progress >= 0.5) {
            this.commitSongContext(swap.pending, swap.pendingIcons, swap.staged);
            swap.pending = null;
            swap.pendingIcons = null;
            swap.staged = null;
        }
        if (progress >= 1) {
            this.settleSongSwap();
            return;
        }

        if (!this.swapCover) {
            this.swapCover = new this.pixi.Graphics();
            this.app.stage.addChild(this.swapCover);
        }
        const cover = this.swapCover;
        cover.alpha = 1 - Math.abs(progress * 2 - 1);
        cover.clear();
        cover
            .rect(0, 0, this.lastWidth, this.lastHeight)
            .fill({ color: this.pixi.Color.shared.setValue(this.options.theme.backgroundColor).toNumber() });
    }

    private mod(key: string): number {
        const value = this.options.modulation?.[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : 1;
    }

    setTuning(tuning: SonnetTuning) {
        if (this.destroyed) return;
        this.options.tuning = buildElysiumTuning(tuning);
        if (this.options.paused) this.renderOnce();
    }

    setModulation(modulation: Record<string, number>) {
        if (this.destroyed) return;
        this.options.modulation = modulation;
        if (this.options.paused) this.renderOnce();
    }

    setPaused(paused: boolean) {
        if (this.destroyed) return;
        this.options.paused = paused;
        if (paused) {
            this.app.stop();
            this.renderOnce();
        } else {
            this.app.start();
        }
    }

    destroy() {
        this.options.host.ownerDocument.defaultView?.removeEventListener('verse:before-capture', this.captureFrame);
        if (this.destroyed) return;
        this.destroyed = true;
        sonnetDebugState.activeShot = null;
        sonnetDebugState.paragraphIndex = -1;
        this.settleSongSwap();
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.app.stop();
        this.app.ticker.remove(this.renderFrame);
        this.clearScenes();
        destroySonnetContainerChildren(this.backdropContainer);
        destroySonnetContainerChildren(this.foregroundContainer);
        destroySonnetContainerChildren(this.creditsContainer);
        destroySonnetContainerChildren(this.overlayContainer);
        this.iconTextures.clear();
        this.releaseIconUrls(this.iconUrls);
        this.app.destroy({ removeView: true }, { children: true, texture: true });
    }
}
