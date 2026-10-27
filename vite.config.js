import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite настроен под Electron: base './' чтобы пути работали из file://
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
