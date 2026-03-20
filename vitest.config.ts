import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.types.ts', 'src/**/*.module.ts'],
    },
  },
  resolve: {
    alias: {
      '@/src': path.resolve(__dirname, './src'),
      '@/web': path.resolve(__dirname, './web'),
    },
  },
});
