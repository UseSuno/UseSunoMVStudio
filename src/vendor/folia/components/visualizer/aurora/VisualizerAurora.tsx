// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, MotionValue, Variants, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DEFAULT_AURORA_TUNING, Line, Theme, Word as WordType, AudioBands, type AuroraTuning } from '../../../types';
import { getLineRenderEndTime, getLineRenderHints } from '../../../utils/lyrics/renderHints';
import { useVisualizerRuntime } from '../runtime';
import { type VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';
import { buildPostLyricLayoutUnits, buildDisplayWordsFromLayoutUnits } from '../../../utils/lyrics/cjkSemanticLayout';
import { buildWordGraphemeTimings } from '../../../utils/lyrics/graphemeTiming';
import { resolveThemeFontStack } from '../../../utils/fontStacks';
import { resolveWordColor } from '../wordColoring';
import { mixColors } from '../colorMix';
import AuroraCanvas from './AuroraCanvas';

// src/components/visualizer/aurora/VisualizerAurora.tsx
// Aurora visualizer: night-sky canvas (ray curtains, stars, dust) under Classic-style
// word animation. Words ascend into place like columns of light, the per-char glow
// hue drifts across the line like an aurora band, and passed words dissolve upward.
// The animation pipeline follows the house standard: word three-state machine driven
// by renderHints, two-layer text (body + glow), spring enters, tiered line transitions.

type VisualizerAuroraProps = VisualizerSharedProps;

interface WordLayoutConfig {
    id: string;
    y: number;
    rotate: number;
    scale: number;
    marginRight: string;
    passedDriftY: number;
    passedRotate: number;
}

interface AuroraLineRenderProfile {
    lineRenderEndTime: number;
    lineTransitionMode: 'normal' | 'fast' | 'none';
    wordRevealMode: 'normal' | 'fast' | 'instant';
    wordLookahead: number;
}

let auroraMeasureCanvas: HTMLCanvasElement | null = null;

const measureWordWidth = (text: string, pxSize: number, fontStack: string): number => {
    if (typeof document === 'undefined') {
        return text.length * pxSize * 0.65;
    }
    if (!auroraMeasureCanvas) {
        auroraMeasureCanvas = document.createElement('canvas');
    }
    const context = auroraMeasureCanvas.getContext('2d');
    if (!context) {
        return text.length * pxSize * 0.65;
    }
    context.font = `700 ${pxSize}px ${fontStack}`;
    return context.measureText(text).width;
};

const resolveAuroraLineRenderProfile = (line: Line | null | undefined): AuroraLineRenderProfile | null => {
    if (!line) {
        return null;
    }
    const renderHints = getLineRenderHints(line);
    const wordRevealMode = renderHints?.wordRevealMode ?? 'normal';

    return {
        lineRenderEndTime: getLineRenderEndTime(line),
        lineTransitionMode: renderHints?.lineTransitionMode ?? 'normal',
        wordRevealMode,
        wordLookahead: wordRevealMode === 'instant' ? 0.03 : wordRevealMode === 'fast' ? 0.08 : 0.15,
    };
};

const getAuroraWordActiveEndTime = (word: WordType, renderProfile: AuroraLineRenderProfile) => {
    if (renderProfile.wordRevealMode === 'instant') {
        return renderProfile.lineRenderEndTime;
    }
    if (renderProfile.wordRevealMode === 'fast') {
        return Math.min(renderProfile.lineRenderEndTime, Math.max(word.endTime, word.startTime + 0.12));
    }
    return word.endTime;
};

const getAuroraWordDisplayDuration = (word: WordType, renderProfile: AuroraLineRenderProfile) => {
    const activeEndTime = getAuroraWordActiveEndTime(word, renderProfile);
    const minDuration = renderProfile.wordRevealMode === 'instant'
        ? 0.08
        : renderProfile.wordRevealMode === 'fast'
            ? 0.12
            : 0.1;
    return Math.max(activeEndTime - word.startTime, minDuration);
};

const getAuroraLineContainerMotion = (renderProfile: AuroraLineRenderProfile | null) => {
    if (renderProfile?.lineTransitionMode === 'none') {
        return {
            initial: { opacity: 1, scale: 1, filter: 'blur(0px)' },
            animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
            exit: { opacity: 0, scale: 1.02, filter: 'blur(6px)', transition: { duration: 0.12, ease: 'easeOut' as const } },
        };
    }
    if (renderProfile?.lineTransitionMode === 'fast') {
        return {
            initial: { opacity: 0.35, y: 14, scale: 0.96, filter: 'blur(4px)' },
            animate: {
                opacity: 1,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
                transition: { duration: 0.16, ease: 'easeOut' as const },
                transitionEnd: { filter: 'none' },
            },
            exit: {
                opacity: 0,
                y: -12,
                scale: 1.04,
                filter: 'blur(10px)',
                transition: { duration: 0.16, ease: 'easeInOut' as const },
            },
        };
    }
    // Normal: the line rises out of the night mist and dissolves back upward.
    return {
        initial: { opacity: 0, y: 26, scale: 0.94, filter: 'blur(10px)' },
        animate: {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            transition: { duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] as const },
            transitionEnd: { filter: 'none' },
        },
        exit: { opacity: 0, y: -20, scale: 1.06, filter: 'blur(18px)', transition: { duration: 0.34, ease: 'easeInOut' as const } },
    };
};

const Word: React.FC<{
    word: WordType;
    config: WordLayoutConfig;
    currentTime: MotionValue<number>;
    renderProfile: AuroraLineRenderProfile;
    layoutVariants: Variants;
    bodyVariants: Variants;
    glowVariants: Variants;
    baseColor: string;
    activeColor: string;
    glowColor: string;
    glowFilter: string | undefined;
    isChorus?: boolean;
    fontSize: string;
}> = ({
    word,
    config,
    currentTime,
    renderProfile,
    layoutVariants,
    bodyVariants,
    glowVariants,
    baseColor,
    activeColor,
    glowColor,
    glowFilter,
    isChorus,
    fontSize,
}) => {
    const [status, setStatus] = useState<'waiting' | 'active' | 'passed'>('waiting');
    const rippleScale = useMemo(() => 1.5 + Math.random() * 2, []);
    const duration = getAuroraWordDisplayDuration(word, renderProfile);
    const activeEndTime = getAuroraWordActiveEndTime(word, renderProfile);
    const graphemeTimings = useMemo(() => buildWordGraphemeTimings(word), [word]);

    useMotionValueEvent(currentTime, 'change', (latest: number) => {
        let newStatus: 'waiting' | 'active' | 'passed' = 'waiting';
        if (latest >= word.startTime - renderProfile.wordLookahead && latest <= activeEndTime) {
            newStatus = 'active';
        } else if (latest > activeEndTime) {
            newStatus = 'passed';
        }
        setStatus(previous => (previous === newStatus ? previous : newStatus));
    });

    return (
        <motion.div
            custom={{
                config,
                duration,
            }}
            variants={layoutVariants}
            initial="waiting"
            animate={status}
            className="font-bold inline-block origin-center relative will-change-transform whitespace-nowrap"
            style={{
                fontSize,
                marginRight: config.marginRight,
                lineHeight: 1.22,
            }}
        >
            {/* Glow layer: transparent glyphs carrying only the text-shadow. */}
            <span
                className="absolute inset-0 select-none pointer-events-none block"
                aria-hidden="true"
                style={{ filter: glowFilter }}
            >
                {graphemeTimings.length > 1 ? (
                    graphemeTimings.map((timing, index) => (
                        <motion.span
                            key={index}
                            variants={glowVariants}
                            custom={{
                                glowColor,
                                duration,
                                index,
                                total: graphemeTimings.length,
                                charStartTime: timing.startTime,
                                charEndTime: timing.endTime,
                                wordStartTime: word.startTime,
                                wordRevealMode: renderProfile.wordRevealMode,
                            }}
                        >
                            {timing.char}
                        </motion.span>
                    ))
                ) : (
                    <motion.span
                        variants={glowVariants}
                        custom={{ glowColor, duration, wordRevealMode: renderProfile.wordRevealMode }}
                    >
                        {word.text}
                    </motion.span>
                )}
            </span>

            <motion.span
                variants={bodyVariants}
                custom={{ activeColor, duration, wordRevealMode: renderProfile.wordRevealMode }}
                className="relative z-10 block"
            >
                {word.text}
            </motion.span>

            <AnimatePresence>
                {isChorus && status === 'active' && (
                    <motion.span
                        key="ripple"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[150%] aspect-square rounded-full border-1 pointer-events-none z-0"
                        style={{ borderColor: glowColor, filter: 'blur(1px)' }}
                        initial={{ scale: 0.2, opacity: 0.8 }}
                        animate={{ scale: rippleScale, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

const VisualizerAurora: React.FC<VisualizerAuroraProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        subtitleTheme,
        audioPower,
        audioBands,
        isDaylight = false,
        showText = true,
        staticMode = false,
        paused = false,
        lyricsFontScale = 1,
        subtitleOverlayOpacity,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        auroraTuning = DEFAULT_AURORA_TUNING,
    } = props;
    const { t } = useTranslation();

    const resolvedTuning = useMemo(() => ({
        ribbonIntensity: Math.min(2, Math.max(0, auroraTuning?.ribbonIntensity ?? DEFAULT_AURORA_TUNING.ribbonIntensity)),
        flowSpeed: Math.min(2, Math.max(0, auroraTuning?.flowSpeed ?? DEFAULT_AURORA_TUNING.flowSpeed)),
        glowIntensity: Math.min(2, Math.max(0, auroraTuning?.glowIntensity ?? DEFAULT_AURORA_TUNING.glowIntensity)),
        colorMode: auroraTuning?.colorMode ?? DEFAULT_AURORA_TUNING.colorMode,
    }), [auroraTuning]);

    const {
        activeLine,
        recentCompletedLine,
        nextLines,
    } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    const renderProfile = useMemo(
        () => resolveAuroraLineRenderProfile(activeLine),
        [activeLine],
    );
    const lineContainerMotion = useMemo(() => getAuroraLineContainerMotion(renderProfile), [renderProfile]);

    const [viewportWidth, setViewportWidth] = useState(() => (
        typeof window === 'undefined' ? 1200 : window.innerWidth
    ));

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const displayWords = useMemo(() => {
        if (!activeLine) return [];
        const layoutUnits = buildPostLyricLayoutUnits(activeLine, { semantic: true, sticky: true });
        return buildDisplayWordsFromLayoutUnits(layoutUnits);
    }, [activeLine]);

    const mainFontSize = `clamp(${(2.25 * lyricsFontScale).toFixed(3)}rem, ${(6 * lyricsFontScale).toFixed(3)}vw, ${(4.5 * lyricsFontScale).toFixed(3)}rem)`;
    const emptyFontSize = `clamp(${(1.5 * lyricsFontScale).toFixed(3)}rem, ${(3.5 * lyricsFontScale).toFixed(3)}vw, ${(2.25 * lyricsFontScale).toFixed(3)}rem)`;
    const translationFontSize = `clamp(${(1.125 * lyricsFontScale).toFixed(3)}rem, ${(2.6 * lyricsFontScale).toFixed(3)}vw, ${(1.25 * lyricsFontScale).toFixed(3)}rem)`;
    const upcomingFontSize = `clamp(${(0.875 * lyricsFontScale).toFixed(3)}rem, ${(2 * lyricsFontScale).toFixed(3)}vw, ${(1 * lyricsFontScale).toFixed(3)}rem)`;

    // Aurora words hang in the sky with a gentle deterministic vertical scatter.
    // Intensity widens the drift; the layout itself stays centered and calm.
    const { wordConfigs } = useMemo(() => {
        if (!activeLine) {
            return { wordConfigs: [] as WordLayoutConfig[] };
        }
        const seed = activeLine.startTime;
        const intensity = theme.animationIntensity;
        const isChaotic = intensity === 'chaotic';
        const isCalm = intensity === 'calm';
        const isInterlude = activeLine.fullText === '......';

        const fontStack = resolveThemeFontStack(theme);
        const rem = 16;
        const pxFontSize = Math.max(
            2.25 * lyricsFontScale * rem,
            Math.min((6 * lyricsFontScale * viewportWidth) / 100, 4.5 * lyricsFontScale * rem),
        );
        const wordWidths = displayWords.map(w => measureWordWidth(w.text, pxFontSize, fontStack));

        const spread = isChaotic ? 34 : isCalm ? 0 : 16;
        const baseRotate = isChaotic ? 6 : isCalm ? 0 : 2.5;

        const wordConfigs: WordLayoutConfig[] = displayWords.map((w, i) => {
            const wordSeed = seed + i;
            const random = (offset: number) => {
                const x = Math.sin(wordSeed + offset) * 10000;
                return x - Math.floor(x);
            };

            if (isInterlude) {
                return {
                    id: `${w.text}-${i}-${seed}`,
                    y: (random(2) - 0.5) * 10,
                    rotate: 0,
                    scale: 1.4,
                    marginRight: '2.5rem',
                    passedDriftY: -10,
                    passedRotate: 0,
                };
            }

            const scale = 1.08 + random(4) * 0.14;
            // Margin keeps scaled-up neighbors from overlapping, mirroring Classic.
            const wCurrent = wordWidths[i] ?? 0;
            const wNext = i + 1 < displayWords.length ? wordWidths[i + 1] ?? 0 : 0;
            const halfOverflowCurrent = (wCurrent * (scale * 1.3 - 1)) / 2;
            const halfOverflowNext = (wNext * (scale * 1.3 - 1)) / 2;
            const marginPx = Math.max(
                0.16 * pxFontSize,
                halfOverflowCurrent + halfOverflowNext + 0.12 * pxFontSize,
            );

            return {
                id: `${w.text}-${i}-${seed}`,
                y: (random(2) - 0.5) * spread * 2,
                rotate: (random(3) - 0.5) * baseRotate * 2,
                scale,
                marginRight: `${marginPx.toFixed(1)}px`,
                passedDriftY: -14 - random(8) * 14,
                passedRotate: (random(9) - 0.5) * 6,
            };
        });

        return { wordConfigs };
    }, [activeLine, displayWords, theme, lyricsFontScale, viewportWidth]);

    // Aurora words rise from below like columns of light and dissolve upward when passed.
    const layoutVariants: Variants = {
        waiting: ({ config }: any) => ({
            opacity: 0,
            scale: config.scale * 0.86,
            y: config.y + 56,
            rotate: config.rotate,
            filter: 'blur(6px)',
            transition: { duration: 0.45, ease: 'easeOut' },
        }),
        active: ({ config }: any) => ({
            opacity: 1,
            scale: config.scale * 1.3,
            y: config.y,
            rotate: config.rotate,
            filter: 'blur(0px)',
            transition: {
                type: 'spring',
                stiffness: 200,
                damping: 20,
                opacity: { duration: 0.1 },
                filter: { duration: 0.2 },
            },
            transitionEnd: { filter: 'none' },
        }),
        passed: ({ config }: any) => ({
            opacity: theme.animationIntensity === 'chaotic' ? 0.88 : 0.78,
            scale: config.scale,
            y: config.y + config.passedDriftY,
            rotate: config.rotate + config.passedRotate,
            transition: {
                duration: 1.6,
                ease: 'easeOut',
            },
        }),
    };

    const bodyVariants: Variants = {
        waiting: () => ({
            color: theme.primaryColor,
            opacity: 0,
            transition: { duration: 0.3 },
        }),
        active: ({ activeColor, duration, wordRevealMode }: any) => ({
            color: activeColor,
            opacity: 1,
            transition: {
                color: { duration: duration || 0.2, ease: 'linear' },
                opacity: { duration: wordRevealMode === 'instant' ? 0.08 : wordRevealMode === 'fast' ? 0.12 : 0.18 },
            },
        }),
        passed: ({ wordRevealMode }: any) => ({
            color: theme.primaryColor,
            transition: {
                color: { duration: wordRevealMode === 'instant' ? 0.12 : wordRevealMode === 'fast' ? 0.24 : 0.9, ease: 'easeInOut' },
            },
        }),
    };

    // Glow layer: transparent text + text-shadow, per-char cascade from grapheme timings.
    // The aurora twist: the glow hue travels along the line via a per-word gradient color.
    const glowVariants: Variants = {
        waiting: {
            color: 'transparent',
            textShadow: 'none',
        },
        active: ({ glowColor, duration, index, total, charStartTime, charEndTime, wordStartTime, wordRevealMode }: any) => {
            const glowBlur1 = Math.round(20 * glowRatio);
            const glowBlur2 = Math.round(40 * glowRatio);
            const softGlow = `0 0 ${glowBlur1}px ${glowColor}, 0 0 ${glowBlur2}px ${glowColor}`;

            if (wordRevealMode === 'instant') {
                return {
                    color: 'transparent',
                    textShadow: ['none', `0 0 ${Math.round(14 * glowRatio)}px ${glowColor}, 0 0 ${Math.round(24 * glowRatio)}px ${glowColor}`, 'none'],
                    transition: { duration: Math.min(duration || 0.08, 0.12), times: [0, 0.35, 1], ease: 'easeOut' },
                };
            }
            if (wordRevealMode === 'fast') {
                return {
                    color: 'transparent',
                    textShadow: ['none', `0 0 ${Math.round(18 * glowRatio)}px ${glowColor}, 0 0 ${Math.round(32 * glowRatio)}px ${glowColor}`, 'none'],
                    transition: { duration: Math.min(Math.max(duration || 0.12, 0.12), 0.2), times: [0, 0.4, 1], ease: 'easeInOut' },
                };
            }
            if (total !== undefined && total > 1) {
                const singleDuration = duration / total;
                const hasCharTiming = typeof charStartTime === 'number'
                    && typeof charEndTime === 'number'
                    && typeof wordStartTime === 'number';
                const charDuration = hasCharTiming
                    ? Math.max(charEndTime - charStartTime, 0.001)
                    : singleDuration;
                const charDelay = hasCharTiming
                    ? Math.max(0, charStartTime - wordStartTime)
                    : singleDuration * (index ?? 0);
                return {
                    color: 'transparent',
                    textShadow: ['none', softGlow, 'none'],
                    transition: {
                        duration: charDuration * 6,
                        times: [0, 0.3, 1],
                        delay: charDelay,
                        ease: 'easeInOut',
                    },
                };
            }
            return {
                color: 'transparent',
                textShadow: ['none', softGlow, softGlow],
                transition: {
                    duration: duration || 0.1,
                    times: [0, 0.9, 1],
                    ease: 'easeInOut',
                },
            };
        },
        passed: ({ wordRevealMode }: any) => ({
            color: 'transparent',
            textShadow: 'none',
            transition: { duration: wordRevealMode === 'instant' ? 0.12 : wordRevealMode === 'fast' ? 0.22 : 0.9, ease: 'easeOut' },
        }),
    };

    const lyricContainerFloat = useMemo(() => {
        const configByIntensity = {
            calm: { distance: 12, duration: 9 },
            normal: { distance: 16, duration: 7.5 },
            chaotic: { distance: 22, duration: 5.8 },
        } as const;
        const { distance, duration } = configByIntensity[theme.animationIntensity];
        return {
            animate: {
                y: [0, -distance, 0, distance * 0.45, 0],
            },
            transition: {
                duration,
                repeat: Infinity,
                ease: 'easeInOut' as const,
            },
        };
    }, [theme.animationIntensity]);

    // The aurora glow hue drifts across the line: each word gets a color stepping
    // from accent towards secondary, like one band of light sweeping the text.
    const wordGlowColors = useMemo(() => {
        const accent = theme.accentColor || theme.primaryColor;
        return displayWords.map((_, i) => (
            mixColors(accent, theme.secondaryColor, displayWords.length > 1 ? i / (displayWords.length - 1) : 0)
        ));
    }, [displayWords, theme]);

    const spectrumEnabled = resolvedTuning.colorMode !== 'theme';
    const glowRatio = 0.5 + resolvedTuning.glowIntensity * 0.5;

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <AuroraCanvas
                theme={theme}
                isDaylight={isDaylight}
                audioPower={audioPower}
                audioBands={audioBands}
                staticMode={staticMode}
                paused={paused}
                tuning={resolvedTuning}
            />

            <motion.div
                className="relative z-10 w-full h-[70vh] flex items-center justify-center p-8 pointer-events-none will-change-transform"
                animate={lyricContainerFloat.animate}
                transition={lyricContainerFloat.transition}
            >
                <AnimatePresence mode="popLayout">
                    {showText && activeLine ? (
                        <motion.div
                            key={activeLine.startTime}
                            initial={lineContainerMotion.initial}
                            animate={lineContainerMotion.animate}
                            exit={lineContainerMotion.exit}
                            className="flex flex-wrap w-full max-w-6xl content-center justify-center items-center"
                            style={{ minHeight: '300px' }}
                        >
                            {displayWords.map((word, idx) => {
                                const config = wordConfigs[idx] ?? {
                                    id: `fallback-${idx}`,
                                    y: 0,
                                    rotate: 0,
                                    scale: 1,
                                    marginRight: '0.9rem',
                                    passedDriftY: -12,
                                    passedRotate: 0,
                                };
                                const activeColor = resolveWordColor(word.text, theme.wordColors, theme.accentColor);
                                const glowColor = wordGlowColors[idx] ?? activeColor;
                                const glowFilter = spectrumEnabled && displayWords.length > 1
                                    ? `hue-rotate(${Math.round((idx / (displayWords.length - 1)) * 70 - 35)}deg)`
                                    : undefined;

                                return (
                                    <Word
                                        key={`${word.text}-${idx}-${activeLine.startTime}`}
                                        word={word}
                                        config={config}
                                        currentTime={currentTime}
                                        renderProfile={renderProfile!}
                                        layoutVariants={layoutVariants}
                                        bodyVariants={bodyVariants}
                                        glowVariants={glowVariants}
                                        baseColor={theme.primaryColor}
                                        activeColor={activeColor}
                                        glowColor={glowColor}
                                        glowFilter={glowFilter}
                                        isChorus={activeLine.isChorus}
                                        fontSize={mainFontSize}
                                    />
                                );
                            })}
                        </motion.div>
                    ) : showText && !activeLine ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute text-2xl opacity-50"
                            style={{
                                color: theme.secondaryColor,
                                fontSize: emptyFontSize,
                            }}
                        >
                            {t('ui.waitingForMusic')}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </motion.div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={activeLine}
                recentCompletedLine={recentCompletedLine}
                nextLines={nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={translationFontSize}
                upcomingFontSize={upcomingFontSize}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
            />
        </VisualizerShell>
    );
};

export default VisualizerAurora;
