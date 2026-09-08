/** Export any finite interval contained in the source audio, without a duration cap. */
export function isValidExportRange(start: number, end: number, duration: number) {
  return Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(duration)
    && duration > 0 && start >= 0 && end > start && end <= duration + 0.01;
}
