// Types and contracts for the Syzygy (朔望) astronomical lyric visualizer.
import type { Line } from '../vendor/folia/types';
import type { GraphemeTiming } from '../vendor/folia/utils/lyrics/graphemeTiming';

export type SyzygyShotKind =
    | 'syzygy-corona'      // Hero eclipse coronal flare with high impact
    | 'orbital-sweep'      // Keplerian orbit tracking sweep with spatial parallax
    | 'celestial-chart'    // Star chart editorial typography with coordinate axes
    | 'gravity-lens'       // Gravitational radial refraction & magnetic snap
    | 'zenith-tableau'     // Deep space quiet negative space with stellar pulsation
    | 'meteor-cascade';    // High-tension diagonal star-track slash typography

export type SyzygySegmentRole =
    | 'hero'               // Focal hero keyword (largest scale, corona flare)
    | 'semi-hero'          // Secondary emphasis phrase
    | 'support'            // Normal lyrical phrase
    | 'annotation'         // Technical astronomical annotation (RA/DEC, epoch, etc.)
    | 'orbital-marker';    // Astronomical geometric glyph or symbol

export interface SyzygySemanticSegment {
    id: string;
    text: string;
    role: SyzygySegmentRole;
    startTime: number;
    endTime: number;
    graphemes: GraphemeTiming[];
    isWordLike: boolean;
    visualPhraseIndex: number;
}

export interface SyzygyCameraKeyframe {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
}

export interface SyzygyShot {
    id: string;
    kind: SyzygyShotKind;
    startTime: number;
    endTime: number;
    duration: number;
    segments: SyzygySemanticSegment[];
    camera: SyzygyCameraKeyframe;
    orbitAngle: number;
    coronaStrength: number;
    celestialSeed: number;
}

export interface SyzygyParagraph {
    id: string;
    startTime: number;
    endTime: number;
    isChorus: boolean;
    shots: SyzygyShot[];
}

export interface SyzygyProgram {
    seed: string;
    paragraphs: SyzygyParagraph[];
    lines: Line[];
}
