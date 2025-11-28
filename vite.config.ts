import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 允许局域网访问 (手机能连的关键)
    host: true, 
    proxy: {
      // 1. 实时数据代理 (原有)
      '/api': {
        target: 'http://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      // 2. 🌟 图表数据代理 (新增 - 修复美股K线和分时图的关键)
      '/kline': {
        target: 'http://web.ifzq.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kline/, '')
      }
    }
  }
})