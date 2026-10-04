import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

// Solo para tests: ver src/__tests__/helpers/sqliteShim.ts (node:sqlite bajo vite-node).
export default defineConfig({
  resolve: {
    alias: {
      'node:sqlite': fileURLToPath(new URL('./src/__tests__/helpers/sqliteShim.ts', import.meta.url)),
      // Permite probar módulos puros del frontend que importan con '@/' (p. ej. el HTML del recibo impreso).
      '@': fileURLToPath(new URL('../frontend/src', import.meta.url)),
    },
  },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
