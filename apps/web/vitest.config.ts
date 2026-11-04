import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests resolve the same `@/` imports as the app (see tsconfig paths).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
