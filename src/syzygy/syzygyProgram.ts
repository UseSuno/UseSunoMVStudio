// Compiler that transforms timed lyric lines into a structured, seek-safe Syzygy astronomical program.
import type { Line } from '../vendor/folia/types';
import type { GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';
import { normalizeLyricPhrasing } from '../folia/adapter';
import type {
    SyzygyParagraph,
    SyzygyProgram,
    SyzygySemanticSegment,
    SyzygyShot,
    SyzygyShotKind,
} from './syzygyTypes';

/**
 * Splits words into graphemes with proportional timing.
 */
const resolveGraphemes = (text: string, startTime: number, endTime: number): GraphemeTiming[] => {
    const chars = Array.from(text);
    if (chars.length === 0) return [];
    const duration = Math.max(0.04, endTime - startTime);
    return chars.map((char, index) => ({
        char,
        startTime: startTime + (index / chars.length) * duration,
        endTime: startTime + ((index + 1) / chars.length) * duration,
    }));
};

/**
 * Hashes a string seed deterministically into an integer.
 */
export const hashSeed = (seed: string | number): number => {
    const str = String(seed);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

/**
 * Astronomical technical annotations generated procedurally per scene to enhance celestial poster aesthetic.
 */
const CELESTIAL_ANNOTATIONS = [
    'EPOCH J2026.5 · SYZYGY ALIGNMENT',
    'RA 18h 36m 56s · DEC +38°47′01″',
    'KEPLER ORBIT ECCENTRICITY 0.0167',
    'SOLAR CORONAL EQUILIBRIUM · PHASE IV',
    'GRAVITATIONAL TRANSIT · AZIMUTH 142°',
    'ZENITH COORDINATE 84°12′ · APOGEE 1.05 AU',
    'CELESTIAL EQUATORIAL PROJECTION · SECTOR 7',
    'HELIOCENTRIC RADIUS · NODAL PRECESSION',
];

/**
 * Compiles input lines into Syzygy astronomical program.
 */
export const compileSyzygyProgram = (lines: Line[], seed: string | number = 'syzygy'): SyzygyProgram => {
    if (!lines || lines.length === 0) {
        return { seed: String(seed), paragraphs: [], lines: [] };
    }

    const baseSeedNum = hashSeed(seed);
    const paragraphs: SyzygyParagraph[] = [];

    let currentLines: Line[] = [];
    let currentStartTime = lines[0].startTime;
    let currentEndTime = lines[0].endTime;
    let isCurrentChorus = lines[0].isChorus ?? false;

    // 1. Partition into paragraphs by temporal gaps or chorus transitions
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1];
        currentLines.push(line);
        currentEndTime = Math.max(currentEndTime, line.endTime);

        const timeGap = nextLine ? nextLine.startTime - line.endTime : Number.POSITIVE_INFINITY;
        const chorusChanged = nextLine && (nextLine.isChorus ?? false) !== isCurrentChorus;
        const durationTooLong = (currentEndTime - currentStartTime) > 16;

        if (!nextLine || timeGap > 2.5 || chorusChanged || durationTooLong) {
            // Build paragraph
            const paragraphId = `para-${paragraphs.length}`;
            const shots: SyzygyShot[] = [];

            // 2. Each visual phrase / line is transformed into semantic segments
            const shotKindPool: SyzygyShotKind[] = isCurrentChorus
                ? ['syzygy-corona', 'meteor-cascade', 'syzygy-corona', 'gravity-lens']
                : ['orbital-sweep', 'celestial-chart', 'gravity-lens', 'zenith-tableau'];

            currentLines.forEach((paraLine, lineIndex) => {
                const normalized = normalizeLyricPhrasing(paraLine.fullText);
                const phrases = normalized.wordSegments && normalized.wordSegments.length > 0
                    ? normalized.wordSegments
                    : [normalized.cleanText || paraLine.fullText];

                const lineDuration = Math.max(0.1, paraLine.endTime - paraLine.startTime);
                const phraseDuration = lineDuration / Math.max(1, phrases.length);

                const segments: SyzygySemanticSegment[] = [];

                phrases.forEach((phraseText, phraseIndex) => {
                    const cleanPhrase = phraseText.replace(/\//g, '').trim();
                    if (!cleanPhrase) return;

                    const phraseStartTime = paraLine.startTime + phraseIndex * phraseDuration;
                    const phraseEndTime = phraseStartTime + phraseDuration;
                    const isFirst = phraseIndex === 0;

                    // Role assignment
                    const role = isCurrentChorus && isFirst
                        ? 'hero'
                        : isFirst
                            ? 'semi-hero'
                            : 'support';

                    segments.push({
                        id: `${paragraphId}-line-${lineIndex}-p-${phraseIndex}`,
                        text: cleanPhrase,
                        role,
                        startTime: phraseStartTime,
                        endTime: phraseEndTime,
                        graphemes: resolveGraphemes(cleanPhrase, phraseStartTime, phraseEndTime),
                        isWordLike: true,
                        visualPhraseIndex: phraseIndex,
                    });
                });

                // Add an astronomical technical annotation segment for poster richness
                const annotationIndex = (baseSeedNum + lineIndex + paragraphs.length) % CELESTIAL_ANNOTATIONS.length;
                const annotationText = CELESTIAL_ANNOTATIONS[annotationIndex];
                segments.push({
                    id: `${paragraphId}-annot-${lineIndex}`,
                    text: annotationText,
                    role: 'annotation',
                    startTime: paraLine.startTime,
                    endTime: paraLine.endTime,
                    graphemes: [],
                    isWordLike: false,
                    visualPhraseIndex: -1,
                });

                const shotKindIndex = (baseSeedNum + lineIndex + paragraphs.length * 2) % shotKindPool.length;
                const shotKind = shotKindPool[shotKindIndex];
                const shotSeed = (baseSeedNum ^ (lineIndex * 101) ^ (paragraphs.length * 37)) >>> 0;
                const orbitAngle = ((shotSeed % 360) * Math.PI) / 180;

                shots.push({
                    id: `shot-${paragraphId}-${lineIndex}`,
                    kind: shotKind,
                    startTime: paraLine.startTime,
                    endTime: paraLine.endTime + Math.min(0.8, timeGap > 0 && Number.isFinite(timeGap) ? timeGap * 0.4 : 0.4),
                    duration: paraLine.endTime - paraLine.startTime,
                    segments,
                    camera: { x: 0, y: 0, zoom: 1, rotation: 0 },
                    orbitAngle,
                    coronaStrength: shotKind === 'syzygy-corona' ? 1.0 : 0.35,
                    celestialSeed: shotSeed,
                });
            });

            paragraphs.push({
                id: paragraphId,
                startTime: currentStartTime,
                endTime: currentEndTime,
                isChorus: isCurrentChorus,
                shots,
            });

            // Reset for next paragraph
            if (nextLine) {
                currentLines = [];
                currentStartTime = nextLine.startTime;
                currentEndTime = nextLine.endTime;
                isCurrentChorus = nextLine.isChorus ?? false;
            }
        }
    }

    return {
        seed: String(seed),
        paragraphs,
        lines,
    };
};

/**
 * Finds the active paragraph index in Syzygy program at absolute playback time `time`.
 */
export const findSyzygyParagraphIndex = (program: SyzygyProgram, time: number): number => {
    if (!program || program.paragraphs.length === 0) return -1;
    if (time < program.paragraphs[0].startTime) return 0;
    for (let i = 0; i < program.paragraphs.length; i++) {
        const para = program.paragraphs[i];
        if (time >= para.startTime && time <= para.endTime) {
            return i;
        }
        if (i < program.paragraphs.length - 1 && time > para.endTime && time < program.paragraphs[i + 1].startTime) {
            return i;
        }
    }
    return program.paragraphs.length - 1;
};
