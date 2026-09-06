// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Monet's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'monet', settingsKey: 'monetTuning', settingsSetterKey: 'handleSetMonetTuning', apply: (props, tuning) => ({ ...props, monetTuning: tuning }) });
