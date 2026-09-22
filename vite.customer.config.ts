import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/mrs2.0/',
  plugins: [react()],
  build: { outDir: 'dist/customer' },
})