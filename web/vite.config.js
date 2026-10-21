import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Point the dev server at another API without editing this file:
        //   SMF_API_PROXY=http://127.0.0.1:5198 npm run dev
        target: process.env.SMF_API_PROXY || 'http://localhost:5080',
        changeOrigin: true,
      },
    },
  },
})
