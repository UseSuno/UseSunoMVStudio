// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import { defineVisualizerTuning } from '../tuningRegistry';

// Injects Tilt's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'tilt', settingsKey: 'tiltTuning', settingsSetterKey: 'handleSetTiltTuning', apply: (props, tuning) => ({ ...props, tiltTuning: tuning }) });
