import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Aucune variable d'environnement n'est exposée au client (préfixe volontairement improbable)
  envPrefix: 'RAILHUB_PUBLIC_',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: true,
    cssMinify: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
