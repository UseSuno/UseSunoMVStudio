import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TemplateId } from '../domain/model';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';

export interface StudioVisualizerEntry {
  id: TemplateId;
  renderer: LazyExoticComponent<ComponentType<VisualizerSharedProps>>;
  frameExport: boolean;
  usesWordSegmentation?: boolean;
}

const entries: StudioVisualizerEntry[] = [
  { id: 'folia-fume', renderer: lazy(() => import('../vendor/folia/components/visualizer/fume/VisualizerFume')), frameExport: true },
  { id: 'folia-classic', renderer: lazy(() => import('../vendor/folia/components/visualizer/classic/Visualizer')), frameExport: true, usesWordSegmentation: true },
  { id: 'folia-partita', renderer: lazy(() => import('../vendor/folia/components/visualizer/partita/VisualizerPartita')), frameExport: true, usesWordSegmentation: true },
  { id: 'folia-cadenza', renderer: lazy(() => import('../vendor/folia/components/visualizer/cadenza/VisualizerCadenza')), frameExport: true },
  { id: 'folia-tilt', renderer: lazy(() => import('../vendor/folia/components/visualizer/tilt/VisualizerTilt')), frameExport: true },
  { id: 'folia-claddagh', renderer: lazy(() => import('../vendor/folia/components/visualizer/claddagh/VisualizerCladdagh')), frameExport: true },
  { id: 'folia-monet', renderer: lazy(() => import('../vendor/folia/components/visualizer/monet/VisualizerMonet')), frameExport: true },
  { id: 'folia-cappella', renderer: lazy(() => import('../vendor/folia/components/visualizer/cappella/VisualizerCappella')), frameExport: true },
  { id: 'folia-diorama', renderer: lazy(() => import('../vendor/folia/components/visualizer/diorama/VisualizerDiorama')), frameExport: true },
  { id: 'folia-aurora', renderer: lazy(() => import('../aurora/AuroraStudio')), frameExport: true },
  { id: 'folia-pendolo', renderer: lazy(() => import('../vendor/folia/components/visualizer/pendolo/VisualizerPendolo')), frameExport: true },
  { id: 'folia-tempera', renderer: lazy(() => import('../vendor/folia/components/visualizer/tempera/VisualizerTempera')), frameExport: true, usesWordSegmentation: true },
  { id: 'folia-sonnet', renderer: lazy(() => import('../vendor/folia/components/visualizer/sonnet/VisualizerSonnet')), frameExport: true, usesWordSegmentation: true },
  { id: 'folia-still', renderer: lazy(() => import('../vendor/folia/components/visualizer/still/VisualizerStill')), frameExport: true },
];

const registry = new Map(entries.map(entry => [entry.id, entry]));
export const visualizerEntries = entries;
export const getStudioVisualizer = (id: TemplateId) => registry.get(id) ?? registry.get('folia-fume')!;
export const supportsFrameExport = (id: TemplateId) => getStudioVisualizer(id).frameExport;
