// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Classic's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'classic', settingsKey: 'classicTuning', settingsSetterKey: 'handleSetClassicTuning', apply: (props, tuning) => ({ ...props, classicTuning: tuning }) });
