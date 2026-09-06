// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Cappella's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'cappella', settingsKey: 'cappellaTuning', settingsSetterKey: 'handleSetCappellaTuning', apply: (props, tuning) => ({ ...props, cappellaTuning: tuning }) });
