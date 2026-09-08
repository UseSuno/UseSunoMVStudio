/** Fit the final requested size; no minimum scale may override the safe frame. */
export function resolveFrameFitScale(renderedWidth: number, distance: number, verticalFovDeg: number, aspect: number): number {
    if (renderedWidth <= 0 || distance <= 0) return 1;
    const frameWidth = 2 * distance * Math.tan(verticalFovDeg * Math.PI / 360) * aspect;
    return Math.min(1, frameWidth * .72 / renderedWidth);
}
