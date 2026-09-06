// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Partita's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'partita', settingsKey: 'partitaTuning', settingsSetterKey: 'handleSetPartitaTuning', apply: (props, tuning) => ({ ...props, partitaTuning: tuning }) });
