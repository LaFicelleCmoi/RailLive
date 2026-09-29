import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Retire les commentaires `sourceMappingURL` des fichiers copiés tels quels (ex. worker MapLibre) :
 * aucune source map n'est publiée en production.
 */
function stripSourceMapComments(): Plugin {
  return {
    name: 'railhub:strip-sourcemap-comments',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.js')) continue;
        const text = typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
        file.source = text.replace(/\/\/# sourceMappingURL=\S+\s*$/gm, '');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripSourceMapComments()],
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
