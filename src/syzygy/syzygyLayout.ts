// Typographic layout engine for Syzygy: assigns coordinates, roles, and angles for astronomical poster layouts.
import type { SyzygySemanticSegment, SyzygyShot } from './syzygyTypes';

export interface SyzygyGlyphLayout {
    char: string;
    baseX: number;
    baseY: number;
    enterX: number;
    enterY: number;
    rotation: number;
    startTime: number;
    settleTime: number;
    fontSize: number;
    zDepth: number;
    role: string;
}

export interface SyzygySegmentLayout {
    segment: SyzygySemanticSegment;
    x: number;
    y: number;
    fontSize: number;
    rotation: number;
    vertical: boolean;
    glyphs: SyzygyGlyphLayout[];
}

/**
 * Builds the typographic layout for a shot, strictly preventing screen overflow and character overlap.
 */
export const buildSyzygyShotLayout = (
    shot: SyzygyShot,
    width: number,
    height: number,
    lyricsFontScale: number,
): SyzygySegmentLayout[] => {
    const minDim = Math.min(width, height);
    const baseUnit = minDim * 0.052 * lyricsFontScale;

    const safeMarginX = width * 0.08;
    const safeMarginY = height * 0.10;
    const contentWidth = width - safeMarginX * 2;
    const contentHeight = height - safeMarginY * 2;

    const result: SyzygySegmentLayout[] = [];
    const lyricsSegments = shot.segments.filter(s => s.role !== 'annotation');
    const annotationSegments = shot.segments.filter(s => s.role === 'annotation');

    // Layout configuration depending on shot kind
    switch (shot.kind) {
        case 'syzygy-corona': {
            // Solar Totality Corona: Monumental hero word centered over the eclipse core; support phrases framed below
            let currentY = safeMarginY + contentHeight * 0.38;
            lyricsSegments.forEach((seg, idx) => {
                const isHero = seg.role === 'hero' || idx === 0;
                const fontSize = isHero
                    ? Math.min(baseUnit * 2.0, (contentWidth * 0.95) / Math.max(1, seg.text.length))
                    : Math.min(baseUnit * 1.1, (contentWidth * 0.9) / Math.max(1, seg.text.length));
                const charAdv = fontSize * (isHero ? 1.08 : 1.04);
                const totalW = seg.text.length * charAdv;
                const startX = (width - totalW) / 2 + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    const gx = startX + charIdx * charAdv;
                    const gy = currentY;
                    const enterAngle = Math.atan2(gy - height / 2, gx - width / 2);
                    glyphs.push({
                        char,
                        baseX: gx,
                        baseY: gy,
                        enterX: Math.cos(enterAngle) * (50 + idx * 12),
                        enterY: Math.sin(enterAngle) * (50 + idx * 12),
                        rotation: 0,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.32,
                        fontSize,
                        zDepth: isHero ? 0.35 : 0,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: width / 2,
                    y: currentY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });

                currentY += fontSize * 1.48;
            });
            break;
        }

        case 'orbital-sweep': {
            // Keplerian Orbit Arc Typography: Hero glyphs curved along the orbital arc with tangent rotations
            const heroSeg = lyricsSegments[0];
            const supportSegs = lyricsSegments.slice(1);

            if (heroSeg) {
                const totalChars = heroSeg.text.length;
                const fontSize = Math.min(baseUnit * 1.65, (contentWidth * 0.95) / Math.max(1, totalChars));
                const cx = width / 2;
                const cy = height * 0.44;
                const rx = Math.min(width * 0.36, contentWidth * 0.46);
                const ry = rx * 0.52;

                const angleSpan = Math.min(Math.PI * 0.70, Math.max(0.35, (totalChars * fontSize) / rx));
                const startAngle = -Math.PI * 0.5 - angleSpan / 2;
                const angleStep = totalChars > 1 ? angleSpan / (totalChars - 1) : 0;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(heroSeg.text).forEach((char, charIdx) => {
                    const angle = totalChars === 1 ? -Math.PI * 0.5 : startAngle + charIdx * angleStep;
                    const gx = cx + rx * Math.cos(angle);
                    const gy = cy + ry * Math.sin(angle);
                    const tangent = Math.atan2(ry * Math.cos(angle), -rx * Math.sin(angle));
                    let rot = tangent;
                    if (rot > Math.PI * 0.5) rot -= Math.PI;
                    if (rot < -Math.PI * 0.5) rot += Math.PI;

                    const normAngle = angle;
                    const enterDist = 45;

                    glyphs.push({
                        char,
                        baseX: gx,
                        baseY: gy,
                        enterX: Math.cos(normAngle) * enterDist,
                        enterY: Math.sin(normAngle) * enterDist,
                        rotation: rot,
                        startTime: heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime,
                        settleTime: (heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime) + 0.32,
                        fontSize,
                        zDepth: 0.3,
                        role: heroSeg.role,
                    });
                });

                result.push({
                    segment: heroSeg,
                    x: cx,
                    y: cy,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
            }

            let supY = height * 0.65;
            supportSegs.forEach(seg => {
                const fontSize = Math.min(baseUnit * 1.0, (contentWidth * 0.9) / Math.max(1, seg.text.length));
                const charAdv = fontSize * 1.05;
                const totalW = seg.text.length * charAdv;
                const startX = (width - totalW) / 2 + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    glyphs.push({
                        char,
                        baseX: startX + charIdx * charAdv,
                        baseY: supY,
                        enterX: 0,
                        enterY: 25,
                        rotation: 0,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.28,
                        fontSize,
                        zDepth: 0,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: width / 2,
                    y: supY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
                supY += fontSize * 1.4;
            });
            break;
        }

        case 'celestial-chart': {
            // Astrometric Chart: Left monumental hero block with coordinate axis; right secondary phrases
            const heroSeg = lyricsSegments[0];
            const supportSegs = lyricsSegments.slice(1);

            if (heroSeg) {
                const fontSize = Math.min(baseUnit * 1.55, (contentWidth * 0.65) / Math.max(1, heroSeg.text.length));
                const charAdv = fontSize * 1.04;
                const startX = safeMarginX + charAdv / 2;
                const startY = safeMarginY + contentHeight * 0.44;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(heroSeg.text).forEach((char, charIdx) => {
                    glyphs.push({
                        char,
                        baseX: startX + charIdx * charAdv,
                        baseY: startY,
                        enterX: -40,
                        enterY: 0,
                        rotation: 0,
                        startTime: heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime,
                        settleTime: (heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime) + 0.30,
                        fontSize,
                        zDepth: 0.25,
                        role: heroSeg.role,
                    });
                });

                result.push({
                    segment: heroSeg,
                    x: startX,
                    y: startY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
            }

            let supY = safeMarginY + contentHeight * 0.60;
            supportSegs.forEach(seg => {
                const fontSize = Math.min(baseUnit * 0.95, (contentWidth * 0.85) / Math.max(1, seg.text.length));
                const charAdv = fontSize * 1.04;
                const startX = safeMarginX + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    glyphs.push({
                        char,
                        baseX: startX + charIdx * charAdv,
                        baseY: supY,
                        enterX: 0,
                        enterY: 25,
                        rotation: 0,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.28,
                        fontSize,
                        zDepth: 0,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: startX,
                    y: supY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });

                supY += fontSize * 1.38;
            });
            break;
        }

        case 'gravity-lens': {
            // Einstein Ring Gravitational Lensing: Hero characters bow with radial distortion near the center
            const cx = width / 2;
            const cy = height * 0.44;
            const heroSeg = lyricsSegments[0];
            const supportSegs = lyricsSegments.slice(1);

            if (heroSeg) {
                const totalChars = heroSeg.text.length;
                const fontSize = Math.min(baseUnit * 1.75, (contentWidth * 0.95) / Math.max(1, totalChars));
                const charAdv = fontSize * 1.04;
                const totalW = totalChars * charAdv;
                const startX = (width - totalW) / 2 + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(heroSeg.text).forEach((char, charIdx) => {
                    const rawX = startX + charIdx * charAdv;
                    const normX = (rawX - cx) / (contentWidth * 0.5);
                    const bowY = (1 - normX * normX) * (baseUnit * 0.35);
                    const gy = cy - bowY;

                    const enterAngle = Math.atan2(gy - cy, rawX - cx);
                    const enterRadius = 55;

                    glyphs.push({
                        char,
                        baseX: rawX,
                        baseY: gy,
                        enterX: Math.cos(enterAngle) * enterRadius,
                        enterY: Math.sin(enterAngle) * enterRadius,
                        rotation: normX * -0.06,
                        startTime: heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime,
                        settleTime: (heroSeg.graphemes[charIdx]?.startTime ?? heroSeg.startTime) + 0.30,
                        fontSize,
                        zDepth: 0.35,
                        role: heroSeg.role,
                    });
                });

                result.push({
                    segment: heroSeg,
                    x: cx,
                    y: cy,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
            }

            let supY = cy + baseUnit * 1.55;
            supportSegs.forEach(seg => {
                const fontSize = Math.min(baseUnit * 1.05, (contentWidth * 0.9) / Math.max(1, seg.text.length));
                const charAdv = fontSize * 1.04;
                const totalW = seg.text.length * charAdv;
                const startX = (width - totalW) / 2 + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    glyphs.push({
                        char,
                        baseX: startX + charIdx * charAdv,
                        baseY: supY,
                        enterX: (charIdx % 2 === 0 ? -1 : 1) * 20,
                        enterY: 25,
                        rotation: 0,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.28,
                        fontSize,
                        zDepth: 0,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: width / 2,
                    y: supY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
                supY += fontSize * 1.35;
            });
            break;
        }

        case 'meteor-cascade': {
            // Diagonal Star-Track Slash: -14 degrees angle with hyper-kinetic speed entries
            const angle = -0.24; // approx -13.8 degrees
            let lineY = safeMarginY + contentHeight * 0.36;

            lyricsSegments.forEach((seg, idx) => {
                const isHero = seg.role === 'hero' || idx === 0;
                const fontSize = isHero
                    ? Math.min(baseUnit * 1.6, (contentWidth * 0.85) / Math.max(1, seg.text.length))
                    : Math.min(baseUnit * 1.05, (contentWidth * 0.85) / Math.max(1, seg.text.length));
                const charAdv = fontSize * 1.04;
                const totalW = seg.text.length * charAdv;
                const offsetX = (idx % 2 === 0 ? -1 : 1) * contentWidth * 0.08;
                const startX = width / 2 - totalW / 2 + offsetX;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    const rawX = startX + charIdx * charAdv;
                    const rawY = lineY + (charIdx - seg.text.length / 2) * fontSize * Math.tan(angle);
                    glyphs.push({
                        char,
                        baseX: rawX,
                        baseY: rawY,
                        enterX: Math.cos(angle) * -55,
                        enterY: Math.sin(angle) * -55,
                        rotation: angle,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.30,
                        fontSize,
                        zDepth: isHero ? 0.35 : 0.1,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: startX,
                    y: lineY,
                    fontSize,
                    rotation: angle,
                    vertical: false,
                    glyphs,
                });

                lineY += fontSize * 1.55;
            });
            break;
        }

        case 'zenith-tableau':
        default: {
            // Zenith Deep-Space Tranquility: Expansive cosmic negative space, wide tracking
            let curY = safeMarginY + contentHeight * 0.40;
            lyricsSegments.forEach((seg, idx) => {
                const isHero = seg.role === 'hero' || idx === 0;
                const fontSize = isHero
                    ? Math.min(baseUnit * 1.6, (contentWidth * 0.85) / Math.max(1, seg.text.length))
                    : Math.min(baseUnit * 1.0, (contentWidth * 0.85) / Math.max(1, seg.text.length));
                const tracking = isHero ? 1.25 : 1.12;
                const charAdv = fontSize * tracking;
                const totalW = seg.text.length * charAdv;
                const startX = (width - totalW) / 2 + charAdv / 2;

                const glyphs: SyzygyGlyphLayout[] = [];
                Array.from(seg.text).forEach((char, charIdx) => {
                    glyphs.push({
                        char,
                        baseX: startX + charIdx * charAdv,
                        baseY: curY,
                        enterX: 0,
                        enterY: (idx === 0 ? -1 : 1) * 32,
                        rotation: 0,
                        startTime: seg.graphemes[charIdx]?.startTime ?? seg.startTime,
                        settleTime: (seg.graphemes[charIdx]?.startTime ?? seg.startTime) + 0.35,
                        fontSize,
                        zDepth: isHero ? 0.2 : 0,
                        role: seg.role,
                    });
                });

                result.push({
                    segment: seg,
                    x: width / 2,
                    y: curY,
                    fontSize,
                    rotation: 0,
                    vertical: false,
                    glyphs,
                });
                curY += fontSize * 1.6;
            });
            break;
        }
    }

    // Annotation segment layout (corner astronomical metadata)
    if (annotationSegments.length > 0) {
        const annotSeg = annotationSegments[0];
        const annotFontSize = Math.max(9, baseUnit * 0.38);
        const ax = safeMarginX;
        const ay = height - safeMarginY * 0.8;

        result.push({
            segment: annotSeg,
            x: ax,
            y: ay,
            fontSize: annotFontSize,
            rotation: 0,
            vertical: false,
            glyphs: [{
                char: annotSeg.text,
                baseX: ax,
                baseY: ay,
                enterX: 0,
                enterY: 10,
                rotation: 0,
                startTime: annotSeg.startTime,
                settleTime: annotSeg.startTime + 0.4,
                fontSize: annotFontSize,
                zDepth: -0.1,
                role: 'annotation',
            }],
        });
    }

    return result;
};
