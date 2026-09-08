import type { Project } from '../domain/model';
import { supportsFastExport } from '../folia/registry';

/** Canvas-only real-time composition excludes DOM shapes; offline DOM capture includes them. */
export function canCompositeProject(project: Pick<Project, 'template' | 'background'>) {
  return ['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-tempera', 'folia-sonnet'].includes(project.template) && project.background !== 'common';
}
export function canExportFrames(project: Pick<Project, 'template' | 'background'>) {
  return supportsFastExport(project.template);
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
