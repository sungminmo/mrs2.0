import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/mrs2.0/',
  plugins: [react()],
  server: { proxy: { '/api': process.env.MRS_API_PROXY ?? 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist/customer' },
})