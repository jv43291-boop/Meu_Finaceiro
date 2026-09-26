import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// mesmo atalho "@/..." do tsconfig, para os testes importarem db/ e sync/
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/__tests__/**/*.test.ts'] },
});
