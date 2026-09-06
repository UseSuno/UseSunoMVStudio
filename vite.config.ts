import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Folia is built as an isolated document, preserving its viewport and utility CSS.
export default defineConfig({ plugins: [react(), tailwindcss()], worker: { format: 'es' }, build: { rollupOptions: { input: { main: 'index.html', folia: 'folia.html', timestamp: 'timestamp.html' }, output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : id.includes('/node_modules/pixi.js/') ? 'pixi' : undefined } } }, test: { include: ['tests/**/*.test.ts'] } });
