import { defineConfig } from 'vitest/config';

declare const process: { env: Record<string, string | undefined> };

// GAME=1 のときはゲーム（game.html）だけを dist/game/ に作る。1 ファイルのページにまとめやすいように、入口ごとに別に作る
const game = process.env.GAME === '1';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    ...(game ? { outDir: 'dist/game', emptyOutDir: true, rollupOptions: { input: 'game.html' } } : {}),
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60_000 },
});
