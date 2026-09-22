import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: 'dist/admin',
    rollupOptions: { input: 'admin.html' },
  },
})