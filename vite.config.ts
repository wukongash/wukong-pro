import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 把所有 /api 开头的请求转发到腾讯行情接口
      '/api': {
        target: 'http://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      // 把所有 /kline 开头的请求转发到腾讯K线接口
      '/kline': {
        target: 'http://web.ifzq.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kline/, '')
      }
    }
  }
})
