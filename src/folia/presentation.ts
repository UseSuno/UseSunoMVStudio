// Keep every animation update. Only intermediate GPU presentations can be skipped:
// the final update must draw before its pixels are retained for export.
let active = false, deferred = false;
export const isLayeredPresentation = () => active;
export const deferStagePresentation = () => deferred;
export const setDeferredStagePresentation = (value: boolean) => { deferred = value; };
export const setLayeredPresentation = (value: boolean) => { active = value; deferred = false; };
