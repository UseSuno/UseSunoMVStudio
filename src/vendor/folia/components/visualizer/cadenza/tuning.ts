// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Cadenza's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'cadenza', settingsKey: 'cadenzaTuning', settingsSetterKey: 'handleSetCadenzaTuning', apply: (props, tuning) => ({ ...props, cadenzaTuning: tuning }) });
