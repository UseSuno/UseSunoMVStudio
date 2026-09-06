// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Diorama's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'diorama', settingsKey: 'dioramaTuning', settingsSetterKey: 'handleSetDioramaTuning', apply: (props, tuning) => ({ ...props, dioramaTuning: tuning }) });
