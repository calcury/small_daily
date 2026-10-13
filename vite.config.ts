import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 生产环境部署到 GitHub Pages 的子路径：https://calcury.github.io/small_daily/
// 本地开发（dev / preview）走根路径，方便直接用 http://localhost:5173/ 访问
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/small_daily/' : '/',
  plugins: [react()],
  // 构建时刻，用于「设置 → 版本」里显示当前跑的是哪一版
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
}))
