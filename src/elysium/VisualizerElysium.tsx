import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SONNET_TUNING } from '../vendor/folia/types';
import type { Line } from '../vendor/folia/types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../vendor/folia/utils/fontStacks';
import { getLineRenderEndTime } from '../vendor/folia/utils/lyrics/renderHints';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import { useVisualizerPixiHost } from '../vendor/folia/components/visualizer/pixiRuntimeHost';
import { useVisualizerRuntime } from '../vendor/folia/components/visualizer/runtime';
import { useVisualizerSongCommit } from '../vendor/folia/components/visualizer/songHandover';
import { useModVisualizerModulation } from '../vendor/folia/mods/visualizerModulation';
import VisualizerShell from '../vendor/folia/components/visualizer/VisualizerShell';
import VisualizerSubtitleOverlay from '../vendor/folia/components/visualizer/VisualizerSubtitleOverlay';
import type {
    ElysiumPixiRuntime,
    ElysiumSongContext,
    ElysiumSongMetadata,
} from './createElysiumPixiRuntime';
import { resolveElysiumIsDaylight } from './elysiumMotion';
import { compileSonnetProgram } from '../vendor/folia/components/visualizer/sonnet/sonnetProgram';

// src/elysium/VisualizerElysium.tsx
// Mounts the Elysium Pixi visualizer director:
// Modern cinema-grade kinetic typography with active singing laser playhead, reticle HUD, and spatial Z-axis plunge.
const EMPTY_LINES: Line[] = [];

const VisualizerElysium: React.FC<VisualizerSharedProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        audioPower,
        audioBands,
        showText = true,
        lyricsFontScale = 1,
        staticMode = false,
        paused = false,
        seed = 'elysium',
        songTitle,
        songArtist,
        songAlbum,
        isDaylight: propIsDaylight,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        subtitleTheme,
        subtitleFontScale,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        background,
        sonnetTuning = DEFAULT_SONNET_TUNING,
    } = props;
    const isDaylight = resolveElysiumIsDaylight(theme, propIsDaylight);
    const transparentBackground = background?.transparent ?? false;
    const { t } = useTranslation();
    const modulation = useModVisualizerModulation('sonnet');
    const hostRef = useRef<HTMLDivElement>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const latestSongMetadataRef = useRef<ElysiumSongMetadata>({
        title: songTitle,
        artist: songArtist,
        album: songAlbum,
    });
    latestSongMetadataRef.current = {
        title: songTitle,
        artist: songArtist,
        album: songAlbum,
    };
    const tuningRef = useRef(sonnetTuning);
    tuningRef.current = sonnetTuning;
    const [runtimeFailed, setRuntimeFailed] = useState(false);

    const committedSong = useVisualizerSongCommit({
        seed,
        lines,
        currentTime,
        readyGraceMs: 3000,
    });
    const committedSeed = committedSong.seed;
    const committedLines = committedSong.lines;
    const isInstrumental = committedSong.isInstrumental;

    const virtualLines = useMemo(() => {
        if (!isInstrumental) return EMPTY_LINES;
        const generated: Line[] = [];
        for (let i = 0; i < 60; i++) {
            generated.push({
                id: `virtual-staff-${i}`,
                startTime: i * 8,
                endTime: i * 8 + 6,
                fullText: '♪',
                words: [],
                isChorus: false,
            });
        }
        return generated;
    }, [isInstrumental]);

    const programLines = showText
        ? (committedLines.length > 0 ? committedLines : virtualLines)
        : EMPTY_LINES;
    const program = useMemo(
        () => compileSonnetProgram(programLines, committedSeed),
        [programLines, committedSeed],
    );
    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    const songContext = useMemo<ElysiumSongContext>(
        () => ({ seed: committedSeed, program, theme, isDaylight }),
        [committedSeed, program, theme, isDaylight],
    );

    const runtimeRef = useVisualizerPixiHost<ElysiumPixiRuntime, ElysiumSongContext>({
        hostRef,
        label: 'Elysium',
        rebuildKey: [lyricsFontScale, staticMode, transparentBackground],
        song: songContext,
        create: async (host, song, signal) => {
            const { ElysiumPixiRuntime } = await import('./createElysiumPixiRuntime');
            const metadata = latestSongMetadataRef.current;
            const currentTuning = tuningRef.current;
            const runtime = await ElysiumPixiRuntime.create({
                host,
                songSeed: song.seed,
                program: song.program,
                theme: song.theme,
                tuning: currentTuning,
                currentTime,
                audioPower,
                audioBands,
                lyricsFontScale,
                staticMode,
                transparentBackground,
                paused: pausedRef.current,
                isDaylight,
                songTitle: metadata.title,
                songArtist: metadata.artist,
                songAlbum: metadata.album,
                signal,
                modulation,
            });
            runtime.setSongMetadata(latestSongMetadataRef.current);
            runtime.setPaused(pausedRef.current);
            runtime.setTuning(tuningRef.current);
            return runtime;
        },
        swap: (runtime, song, signal) => runtime.swapSong(song, signal),
        destroy: runtime => runtime.destroy(),
        onFailedChange: setRuntimeFailed,
    });

    useEffect(() => {
        runtimeRef.current?.setTuning(sonnetTuning);
    }, [sonnetTuning]);

    useEffect(() => {
        runtimeRef.current?.setSongMetadata(latestSongMetadataRef.current);
    }, [songAlbum, songArtist, songTitle]);

    useEffect(() => {
        runtimeRef.current?.setPaused(paused);
    }, [paused]);

    useEffect(() => {
        runtimeRef.current?.setModulation(modulation);
    }, [modulation]);

    useEffect(() => currentTime.on('change', () => {
        if (paused) runtimeRef.current?.renderOnce();
    }), [currentTime, paused]);

    const fallbackFontFamily = resolveThemeFontStack(theme);
    const fallbackFontWeight = resolveThemeFontWeight(theme, 600);
    const finalLine = lines.at(-1);
    const creditsRecentCompletedLine = recentCompletedLine === finalLine
        ? null
        : recentCompletedLine;

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                <div ref={hostRef} className="absolute inset-0 z-10" aria-hidden="true" />
                {(runtimeFailed || program.paragraphs.length === 0) && (
                    <div
                        className="absolute inset-0 flex items-center justify-center px-10 text-center transition-opacity duration-300"
                        style={{
                            color: theme.primaryColor,
                            fontFamily: fallbackFontFamily,
                            fontWeight: fallbackFontWeight,
                            fontSize: `clamp(2rem, ${5.4 * lyricsFontScale}vw, 5.6rem)`,
                        }}
                    >
                        {showText && !isInstrumental ? (activeLine?.fullText || t('ui.waitingForMusic')) : null}
                    </div>
                )}
            </div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={activeLine}
                recentCompletedLine={creditsRecentCompletedLine}
                nextLines={nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={`clamp(${1.05 * lyricsFontScale}rem, ${2.2 * lyricsFontScale}vw, ${1.25 * lyricsFontScale}rem)`}
                upcomingFontSize={`clamp(${0.9 * lyricsFontScale}rem, ${1.8 * lyricsFontScale}vw, ${1.05 * lyricsFontScale}rem)`}
                subtitleFontScale={subtitleFontScale}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                showSubtitleTranslation={showSubtitleTranslation}
                subtitleContentMode={subtitleContentMode}
            />
        </VisualizerShell>
    );
};

export default VisualizerElysium;
