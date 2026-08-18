import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest needs to be told about two things Next configures for itself: the
 * automatic JSX runtime, so component tests can use JSX without importing
 * React, and the `@/` alias.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
