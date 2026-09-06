// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// src/components/visualizer/pendolo/tuning.ts
// Injects Pendolo's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'pendolo',
    settingsKey: 'pendoloTuning',
    settingsSetterKey: 'handleSetPendoloTuning',
    apply: (props, tuning) => ({ ...props, pendoloTuning: tuning }),
});
