import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Vitest 配置：复用 Vite 的 React 插件与 @ 别名，jsdom 环境
// 注意：jsdom 29 需显式设置 url 才会启用 localStorage/sessionStorage
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.*',
        'src/setupTests.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
})
