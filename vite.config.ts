import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Folia is built as an isolated document, preserving its viewport and utility CSS.
export default defineConfig({ plugins: [react(), tailwindcss()], build: { rollupOptions: { input: { main: 'index.html', folia: 'folia.html', timestamp: 'timestamp.html' } } }, test: { include: ['tests/**/*.test.ts'] } });
