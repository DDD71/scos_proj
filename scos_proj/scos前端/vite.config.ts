import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  if (command === 'build' && env.VITE_DATA_SOURCE === 'mock') {
    throw new Error('生产构建不可使用 mock，请移除本地覆盖或将 VITE_DATA_SOURCE 设置为 http。')
  }

  return {
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  }
})
