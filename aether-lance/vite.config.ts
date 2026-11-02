import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __HD__: JSON.stringify(process.env.AL_EDITION === 'hd') },
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
