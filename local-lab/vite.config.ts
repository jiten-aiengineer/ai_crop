import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  envDir: false,
  plugins: [react()],
  resolve: { alias: { 'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)) } },
  css: { postcss: { plugins: [] } },
  build: { outDir: fileURLToPath(new URL('../.comparison-data/ui', import.meta.url)), emptyOutDir: false },
});
