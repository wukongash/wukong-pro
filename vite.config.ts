import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 1. 允许局域网（手机）访问
    host: '0.0.0.0', 
    
    // 2. 保持旧端口，让你的自选股数据不丢失
    port: 5173,      
    
    // 3. 启动后自动打开浏览器
    open: true, 
    
    // 4. 本地开发时的接口代理 (核心)
    proxy: {
      '/api': {
        target: 'http://qt.gtimg.cn', 
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/kline': {
        target: 'http://web.ifzq.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kline/, ''),
      }
    }
  }
})
