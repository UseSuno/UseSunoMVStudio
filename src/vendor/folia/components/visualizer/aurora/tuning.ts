// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Aurora's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'aurora', settingsKey: 'auroraTuning', settingsSetterKey: 'handleSetAuroraTuning', apply: (props, tuning) => ({ ...props, auroraTuning: tuning }) });
