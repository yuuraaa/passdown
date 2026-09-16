import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Web UI のビルドは src/web を root にする（4.8）。
// Vitest はサーバーと Web UI の両方のテストを拾うため、プロジェクトのルートから探す。
export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    // コンテナの中では 3000 で待ち受ける（2.9）
    host: true,
    port: 3000,
  },
  test: {
    root: import.meta.dirname,
    environment: 'node',
    include: ['src/**/*.test.ts?(x)'],
  },
})
