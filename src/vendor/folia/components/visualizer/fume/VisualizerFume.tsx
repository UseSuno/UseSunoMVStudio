import { colorWithAlpha } from '../colorMix';
// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import { DEFAULT_FUME_TUNING, FumeTuning } from '../../../types';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import { buildFumeBackgroundScene } from '../FumeBackground';
import { getRecentCompletedLine, getUpcomingLines } from '../runtime';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';

import { createFumePainter, VisualizerProps, ViewportSize, FumeArticleLayout, StaticBlockSnapshot, CameraTarget, CameraRetargetState, clamp, LAYOUT_REBUILD_DEBOUNCE_MS, resolveFumePassedFadeDuration, buildLayoutCacheKey, buildArticleLayout, resolveArticleOverviewCamera } from './fumePainter';
let lastFumeLayoutCache: {
    key: string;
    article: FumeArticleLayout | null;
} | null = null;
const VisualizerFume: React.FC<VisualizerProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        subtitleTheme,
        audioPower,
        audioBands,
        showText = true,
        seed,
        staticMode = false,
        lyricsFontScale = 1,
        subtitleFontScale = 1,
        fumeTuning,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        paused = false,
    } = props;
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const currentLineIndexRef = useRef(currentLineIndex);
    const cameraInitializedRef = useRef(false);
    const cameraRetargetRef = useRef<CameraRetargetState>({
        sourceLineIndex: -1,
        startedAt: 0,
        duration: 0.18,
        fromX: 0,
        fromY: 0,
        fromScale: 1,
        bridgeMode: 'none',
        bridgeWaypointX: 0,
        bridgeWaypointY: 0,
        bridgeWaypointScale: 1,
        bridgeWaypointPhase: 0.36,
    });
    const cameraRef = useRef<CameraTarget>({
        x: 0,
        y: 0,
        velocityX: 0,
        velocityY: 0,
        focusX: 0,
        focusY: 0,
        scale: 1,
        velocityScale: 0,
        focusScale: 1,
    });
    const staticBlockSnapshotCacheRef = useRef<Map<string, StaticBlockSnapshot>>(new Map());
    const layoutBuildVersionRef = useRef(0);
    const hasResolvedArticleRef = useRef(false);
    const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
    const [article, setArticle] = useState<FumeArticleLayout | null>(null);
    const [isLayoutPending, setIsLayoutPending] = useState(false);
    const [hasPrintedContent, setHasPrintedContent] = useState(false);
    const hasPrintedContentRef = useRef(false);

    useEffect(() => {
        currentLineIndexRef.current = currentLineIndex;
    }, [currentLineIndex]);

    useEffect(() => {
        const element = viewportRef.current;
        if (!element) {
            return;
        }

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            const nextWidth = entry.contentRect.width;
            const nextHeight = entry.contentRect.height;
            setViewport(previous => (
                previous.width === nextWidth && previous.height === nextHeight
                    ? previous
                    : { width: nextWidth, height: nextHeight }
            ));
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const runtime = useMemo(() => {
        const activeLine = lines[currentLineIndex] ?? null;
        const timeNow = currentTime.get();
        return {
            activeLine,
            recentCompletedLine: getRecentCompletedLine({
                lines,
                currentLineIndex,
                currentTime: timeNow,
                getLineEndTime: getLineRenderEndTime,
            }),
            nextLines: getUpcomingLines(lines, currentLineIndex, 2),
        };
    }, [currentLineIndex, lines]);
    const resolvedFumeTuning = useMemo<FumeTuning>(() => ({
        hidePrintSymbols: fumeTuning?.hidePrintSymbols ?? DEFAULT_FUME_TUNING.hidePrintSymbols,
        disableGeometricBackground: fumeTuning?.disableGeometricBackground ?? DEFAULT_FUME_TUNING.disableGeometricBackground,
        backgroundObjectOpacity: clamp(
            fumeTuning?.backgroundObjectOpacity ?? DEFAULT_FUME_TUNING.backgroundObjectOpacity,
            0,
            1,
        ),
        textHoldRatio: clamp(fumeTuning?.textHoldRatio ?? DEFAULT_FUME_TUNING.textHoldRatio, 0, 1),
        cameraTrackingMode: fumeTuning?.cameraTrackingMode === 'stepped' || fumeTuning?.cameraTrackingMode === 'smooth'
            ? fumeTuning.cameraTrackingMode
            : DEFAULT_FUME_TUNING.cameraTrackingMode,
        cameraSpeed: clamp(fumeTuning?.cameraSpeed ?? DEFAULT_FUME_TUNING.cameraSpeed, 0.55, 1.85),
        glowIntensity: clamp(fumeTuning?.glowIntensity ?? DEFAULT_FUME_TUNING.glowIntensity, 0, 1.8),
        heroScale: clamp(fumeTuning?.heroScale ?? DEFAULT_FUME_TUNING.heroScale, 0.82, 1.32),
    }), [fumeTuning]);
    const layoutTheme = useMemo(
        () => ({
            name: theme.name,
            fontStyle: theme.fontStyle,
            fontFamily: theme.fontFamily,
            fontFamilyStack: theme.fontFamilyStack,
            fontWeight: theme.fontWeight,
        }),
        [theme.fontFamily, theme.fontFamilyStack, theme.fontStyle, theme.fontWeight, theme.name],
    );
    const layoutFumeTuning = useMemo<FumeTuning>(() => ({
        ...DEFAULT_FUME_TUNING,
        heroScale: resolvedFumeTuning.heroScale,
    }), [resolvedFumeTuning.heroScale]);

    useEffect(() => {
        const requestVersion = layoutBuildVersionRef.current + 1;
        layoutBuildVersionRef.current = requestVersion;

        if (viewport.width <= 0 || viewport.height <= 0 || lines.length === 0) {
            hasResolvedArticleRef.current = false;
            setArticle(null);
            setIsLayoutPending(false);
            return;
        }

        setIsLayoutPending(true);

        let rafId = 0;
        let timeoutId = 0;
        const delay = hasResolvedArticleRef.current ? LAYOUT_REBUILD_DEBOUNCE_MS : 0;

        rafId = window.requestAnimationFrame(() => {
            timeoutId = window.setTimeout(() => {
                if (layoutBuildVersionRef.current !== requestVersion) {
                    return;
                }

                const layoutCacheKey = buildLayoutCacheKey(lines, viewport, layoutTheme, lyricsFontScale, layoutFumeTuning);
                const nextArticle = lastFumeLayoutCache?.key === layoutCacheKey
                    ? lastFumeLayoutCache.article
                    : buildArticleLayout(lines, viewport, layoutTheme, lyricsFontScale, layoutFumeTuning);
                if (layoutBuildVersionRef.current !== requestVersion) {
                    return;
                }

                lastFumeLayoutCache = {
                    key: layoutCacheKey,
                    article: nextArticle,
                };
                hasResolvedArticleRef.current = nextArticle !== null;
                setArticle(nextArticle);
                setIsLayoutPending(false);
            }, delay);
        });

        return () => {
            window.cancelAnimationFrame(rafId);
            window.clearTimeout(timeoutId);
        };
    }, [layoutFumeTuning, layoutTheme, lines, lyricsFontScale, viewport]);
    const lastRenderableLine = useMemo(() => {
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            const line = lines[index];
            if (line?.fullText.trim().length) {
                return line;
            }
        }
        return null;
    }, [lines]);
    const overviewStartTime = useMemo(() => {
        if (!lastRenderableLine) {
            return Number.POSITIVE_INFINITY;
        }

        const lineStartTime = lastRenderableLine.startTime;
        const lineRenderEndTime = getLineRenderEndTime(lastRenderableLine);
        return lineStartTime + Math.max(lineRenderEndTime - lineStartTime, 0) * 0.5;
    }, [lastRenderableLine]);
    const backgroundScene = useMemo(
        () => buildFumeBackgroundScene({
            viewport,
            world: {
                width: article?.width ?? Math.max(viewport.width * 1.8, viewport.width),
                height: article?.height ?? Math.max(viewport.height * 1.8, viewport.height),
            },
            paperBounds: article?.paperBounds,
            seed: `${seed ?? 'fume'}:${theme.name}`,
        }),
        [article?.height, article?.paperBounds, article?.width, seed, theme.name, viewport],
    );
    const overviewCamera = useMemo(
        () => (article ? resolveArticleOverviewCamera(article, viewport) : null),
        [article, viewport],
    );
    const cameraSpeed = resolvedFumeTuning.cameraSpeed;
    const glowIntensity = resolvedFumeTuning.glowIntensity;
    const backgroundObjectOpacity = resolvedFumeTuning.backgroundObjectOpacity;
    const showPrintStamp = !resolvedFumeTuning.hidePrintSymbols;
    const textHoldRatio = resolvedFumeTuning.textHoldRatio;
    const passedFadeDuration = useMemo(
        () => resolveFumePassedFadeDuration(lines, textHoldRatio),
        [lines, textHoldRatio],
    );
    const translationFontSize = `clamp(${(1.05 * lyricsFontScale).toFixed(3)}rem, ${(2.2 * lyricsFontScale).toFixed(3)}vw, ${(1.2 * lyricsFontScale).toFixed(3)}rem)`;
    const upcomingFontSize = `clamp(${(0.875 * lyricsFontScale).toFixed(3)}rem, ${(1.8 * lyricsFontScale).toFixed(3)}vw, ${(1 * lyricsFontScale).toFixed(3)}rem)`;

    useEffect(() => {
        staticBlockSnapshotCacheRef.current.clear();
    }, [
        article,
        theme.name,
        theme.primaryColor,
        theme.secondaryColor,
        theme.accentColor,
        theme.fontStyle,
        theme.fontFamily,
        theme.fontFamilyStack,
    ]);

    useEffect(() => {
        hasPrintedContentRef.current = false;
        setHasPrintedContent(false);
    }, [article]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const options = { resolvedFumeTuning, lines, canvas, dpr: window.devicePixelRatio || 1, article, viewport, theme, currentTime, audioPower, audioBands, cameraInitializedRef, cameraRef, cameraRetargetRef, currentLineIndexRef, staticBlockSnapshotCacheRef, hasPrintedContentRef, setHasPrintedContent, backgroundScene, staticMode, backgroundObjectOpacity, showText, overviewCamera, overviewStartTime, cameraSpeed, glowIntensity, passedFadeDuration, showPrintStamp, textHoldRatio };
        const painter = createFumePainter(options);
        if (!painter) return;
        let frameId = 0;
        const draw = () => { painter.draw(performance.now()); if (!paused) frameId = window.requestAnimationFrame(draw); };
        const offTime = currentTime.on('change', () => {
            if (paused) { window.cancelAnimationFrame(frameId); frameId = requestAnimationFrame(draw); }
        });
        draw();
        return () => {
            offTime();
            painter.dispose();
            window.cancelAnimationFrame(frameId);
        };
    }, [
        article,
        audioBands,
        audioPower,
        backgroundScene,
        backgroundObjectOpacity,
        cameraSpeed,
        currentTime,
        glowIntensity,
        passedFadeDuration,
        showPrintStamp,
        showText,
        paused,
        staticMode,
        textHoldRatio,
        theme,
        viewport.height,
        viewport.width,
    ]);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={{
                ...props,
                background: {
                    ...props.background,
                    common: {
                        ...props.background?.common,
                        disableGeometricBackground: Boolean(props.background?.common?.disableGeometricBackground)
                            || resolvedFumeTuning.disableGeometricBackground,
                    },
                },
            }}
        >
            <div ref={viewportRef} className="relative z-10 h-full w-full pointer-events-none">
                {(article || lines.length === 0) && (
                    <motion.div
                        initial={false}
                        animate={{
                            opacity: 1,
                            scale: article && showText ? (hasPrintedContent ? 1 : 0.985) : 1,
                        }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        className="absolute left-1/2 top-0 -translate-x-1/2"
                        style={{
                            width: viewport.width,
                            height: viewport.height,
                        }}
                    >
                        <canvas data-capture-ready={!isLayoutPending} ref={canvasRef} className="absolute inset-0 h-full w-full" />
                    </motion.div>
                )}

                {isLayoutPending && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <div
                            className="flex min-w-40 flex-col items-center gap-4 rounded-3xl border px-6 py-5"
                            style={{
                                backgroundColor: theme.backgroundColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, 0.24),
                                boxShadow: `0 18px 60px ${colorWithAlpha(theme.backgroundColor, 0.52)}`,
                            }}
                        >
                            <Hourglass
                                size={24}
                                className="animate-pulse"
                                style={{ color: colorWithAlpha(theme.primaryColor, 0.78) }}
                            />
                            <div className="flex w-28 flex-col gap-2.5">
                                <div
                                    className="h-2 rounded-full animate-pulse"
                                    style={{ backgroundColor: colorWithAlpha(theme.primaryColor, 0.32) }}
                                />
                                <div
                                    className="h-2 rounded-full animate-pulse"
                                    style={{
                                        width: '78%',
                                        backgroundColor: colorWithAlpha(theme.primaryColor, 0.22),
                                    }}
                                />
                                <div
                                    className="h-2 rounded-full animate-pulse"
                                    style={{
                                        width: '56%',
                                        backgroundColor: colorWithAlpha(theme.secondaryColor, 0.2),
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={runtime.activeLine}
                recentCompletedLine={runtime.recentCompletedLine}
                nextLines={runtime.nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={translationFontSize}
                upcomingFontSize={upcomingFontSize}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                subtitleFontScale={subtitleFontScale}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
                subtitleContentMode={subtitleContentMode}
            />
        </VisualizerShell>
    );
};

export default VisualizerFume;
