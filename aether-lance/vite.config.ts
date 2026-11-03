import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    __HD__: JSON.stringify(process.env.AL_EDITION === 'hd'),
    // build time (UTC, minutes) shown by the automated test so a stale install is easy to spot
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 100000,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as never);
