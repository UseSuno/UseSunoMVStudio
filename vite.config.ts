import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { complianceArtifacts } from './scripts/compliance';

// Folia is built as an isolated document, preserving its viewport and utility CSS.
export default defineConfig(({ mode = 'development' }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gaId = (env.VITE_GA_MEASUREMENT_ID || env.GA_MEASUREMENT_ID || env.VITE_GA4_ID || env.GA_ID || '').trim();
  const clarityId = (env.VITE_CLARITY_PROJECT_ID || env.CLARITY_PROJECT_ID || env.VITE_CLARITY_ID || env.CLARITY_ID || '').trim();

  return {
    define: {
      __GA_MEASUREMENT_ID__: JSON.stringify(gaId),
      __CLARITY_PROJECT_ID__: JSON.stringify(clarityId),
    },
    plugins: [react(), tailwindcss(), complianceArtifacts()],
    worker: { format: 'es' },
    build: {
      rollupOptions: {
        input: { main: 'index.html', folia: 'folia.html', timestamp: 'timestamp.html' },
        output: {
          manualChunks: id => id.includes('/node_modules/three/') ? 'three' : id.includes('/node_modules/pixi.js/') ? 'pixi' : undefined,
        },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
