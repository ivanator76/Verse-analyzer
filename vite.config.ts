import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  // 使用說明是獨立的一頁（help.html），在自己的視窗裡開
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), help: resolve(__dirname, 'help.html') } } },
  test: { globals: true, include: ['tests/**/*.test.ts'] },
});
