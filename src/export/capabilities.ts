import type { Project } from '../domain/model';
import { supportsFrameExport } from '../folia/registry';

/** Canvas-only real-time composition excludes DOM shapes; offline DOM capture includes them. */
export function canCompositeProject(project: Pick<Project, 'template' | 'background'>) {
  return ['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-tempera', 'folia-sonnet'].includes(project.template) && project.background !== 'common';
}
export function canExportFrames(project: Pick<Project, 'template' | 'background'>) {
  return supportsFrameExport(project.template);
}

/**
 * Default to offline export only where a complete real-song run has shown a
 * clear faster-than-playback result. Other Folia templates can still try the
 * same frame exporter, but real-time recording is the predictable fallback.
 */
export function recommendsFrameExport(project: Pick<Project, 'template' | 'background'>) {
  return project.background === 'latent'
    && (project.template === 'folia-fume' || project.template === 'folia-tilt');
}
export function regionCaptureAvailable(scope: Window = window) {
  const api = scope as Window & { CropTarget?: { fromElement?: unknown }; BrowserCaptureMediaStreamTrack?: { prototype?: { cropTo?: unknown } } };
  return typeof api.CropTarget?.fromElement === 'function'
    && typeof scope.navigator.mediaDevices?.getDisplayMedia === 'function'
    && typeof api.BrowserCaptureMediaStreamTrack?.prototype?.cropTo === 'function';
}

/** Narrow prototype scope: other backgrounds may contain DOM-only effects. */
export function canExportDirect(project: Pick<Project, 'template' | 'background'>) {
  return project.template === 'folia-fume' && project.background === 'latent';
}
