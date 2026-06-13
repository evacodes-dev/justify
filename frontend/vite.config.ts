import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy the server-only flows (/api/*) to the Fastify backend
// (run `npm run dev` in ../backend, default port 8787). Override with VITE_API_PROXY.
// For deploys, point VITE_API_BASE at the backend instead.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
