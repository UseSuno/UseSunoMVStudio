// @ts-nocheck
// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.
import React from 'react';
import SoraBackground from './SoraBackground';
import { defineVisualizerBackground } from '../definition';

// src/components/visualizer/backgrounds/sora/entry.tsx
// Registers the shader-based Sora starfield shell background.

export default defineVisualizerBackground({
    mode: 'sora',
    order: 50,
    labelKey: 'options.visualizerBackgroundModeSora',
    labelFallback: 'Sora',
    render: ({ theme, isDaylight, paused }) => (
        <div data-capture-solid className="absolute inset-0 z-0" style={{ backgroundColor: isDaylight ? '#ffffff' : '#000000' }}>
            <SoraBackground theme={theme} isDaylight={isDaylight} paused={paused} />
        </div>
    ),
});
