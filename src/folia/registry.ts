import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TemplateId } from '../domain/model';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';

export interface StudioVisualizerEntry {
  id: TemplateId;
  renderer: LazyExoticComponent<ComponentType<VisualizerSharedProps>>;
  fastExport: boolean;
  usesWordSegmentation?: boolean;
}

const entries: StudioVisualizerEntry[] = [
  { id: 'folia-fume', renderer: lazy(() => import('../vendor/folia/components/visualizer/fume/VisualizerFume')), fastExport: true },
  { id: 'folia-classic', renderer: lazy(() => import('../vendor/folia/components/visualizer/classic/Visualizer')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-partita', renderer: lazy(() => import('../vendor/folia/components/visualizer/partita/VisualizerPartita')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-cadenza', renderer: lazy(() => import('../vendor/folia/components/visualizer/cadenza/VisualizerCadenza')), fastExport: true },
  { id: 'folia-tilt', renderer: lazy(() => import('../vendor/folia/components/visualizer/tilt/VisualizerTilt')), fastExport: true },
  { id: 'folia-claddagh', renderer: lazy(() => import('../vendor/folia/components/visualizer/claddagh/VisualizerCladdagh')), fastExport: true },
  { id: 'folia-monet', renderer: lazy(() => import('../vendor/folia/components/visualizer/monet/VisualizerMonet')), fastExport: true },
  { id: 'folia-cappella', renderer: lazy(() => import('../vendor/folia/components/visualizer/cappella/VisualizerCappella')), fastExport: true },
  { id: 'folia-diorama', renderer: lazy(() => import('../vendor/folia/components/visualizer/diorama/VisualizerDiorama')), fastExport: true },
  { id: 'folia-aurora', renderer: lazy(() => import('../aurora/AuroraStudio')), fastExport: true },
  { id: 'folia-pendolo', renderer: lazy(() => import('../vendor/folia/components/visualizer/pendolo/VisualizerPendolo')), fastExport: true },
  { id: 'folia-tempera', renderer: lazy(() => import('../vendor/folia/components/visualizer/tempera/VisualizerTempera')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-sonnet', renderer: lazy(() => import('../vendor/folia/components/visualizer/sonnet/VisualizerSonnet')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-still', renderer: lazy(() => import('../vendor/folia/components/visualizer/still/VisualizerStill')), fastExport: true },
];

const registry = new Map(entries.map(entry => [entry.id, entry]));
export const visualizerEntries = entries;
export const getStudioVisualizer = (id: TemplateId) => registry.get(id) ?? registry.get('folia-fume')!;
export const supportsFastExport = (id: TemplateId) => getStudioVisualizer(id).fastExport;
