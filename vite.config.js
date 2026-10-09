import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { apiPlugin } from './api.js'

export default defineConfig({
  plugins: [vue(), apiPlugin()],
  server: {
    host: true, // доступно с других устройств в сети (например, редактор с ноутбука)
    port: 5173,
    watch: { ignored: ['**/data/**', '**/media/**'] },
  },
})
