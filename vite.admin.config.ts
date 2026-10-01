import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/admin/',
  plugins: [react(), {
    name: 'admin-entry',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (['/', '/admin/', '/admin/index.html'].includes(url.pathname)) request.url = `/admin/admin.html${url.search}`
        next()
      })
    },
  }],
  server: {
    proxy: {
      '/api': process.env.MRS_API_PROXY ?? 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist/admin',
    rollupOptions: { input: 'admin.html' },
  },
})