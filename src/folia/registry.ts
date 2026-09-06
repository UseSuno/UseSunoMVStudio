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
  { id: 'folia-classic', renderer: lazy(() => import('../vendor/folia/components/visualizer/classic/Visualizer')), fastExport: false, usesWordSegmentation: true },
  { id: 'folia-partita', renderer: lazy(() => import('../vendor/folia/components/visualizer/partita/VisualizerPartita')), fastExport: false, usesWordSegmentation: true },
  { id: 'folia-cadenza', renderer: lazy(() => import('../vendor/folia/components/visualizer/cadenza/VisualizerCadenza')), fastExport: false },
  { id: 'folia-tilt', renderer: lazy(() => import('../vendor/folia/components/visualizer/tilt/VisualizerTilt')), fastExport: false },
  { id: 'folia-claddagh', renderer: lazy(() => import('../vendor/folia/components/visualizer/claddagh/VisualizerCladdagh')), fastExport: false },
  { id: 'folia-monet', renderer: lazy(() => import('../vendor/folia/components/visualizer/monet/VisualizerMonet')), fastExport: false },
  { id: 'folia-cappella', renderer: lazy(() => import('../vendor/folia/components/visualizer/cappella/VisualizerCappella')), fastExport: false },
  { id: 'folia-diorama', renderer: lazy(() => import('../vendor/folia/components/visualizer/diorama/VisualizerDiorama')), fastExport: true },
  { id: 'folia-aurora', renderer: lazy(() => import('../aurora/AuroraStudio')), fastExport: true },
  { id: 'folia-pendolo', renderer: lazy(() => import('../vendor/folia/components/visualizer/pendolo/VisualizerPendolo')), fastExport: false },
  { id: 'folia-tempera', renderer: lazy(() => import('../vendor/folia/components/visualizer/tempera/VisualizerTempera')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-sonnet', renderer: lazy(() => import('../vendor/folia/components/visualizer/sonnet/VisualizerSonnet')), fastExport: true, usesWordSegmentation: true },
  { id: 'folia-still', renderer: lazy(() => import('../vendor/folia/components/visualizer/still/VisualizerStill')), fastExport: false },
];

const registry = new Map(entries.map(entry => [entry.id, entry]));
export const visualizerEntries = entries;
export const getStudioVisualizer = (id: TemplateId) => registry.get(id) ?? registry.get('folia-fume')!;
export const supportsFastExport = (id: TemplateId) => getStudioVisualizer(id).fastExport;
