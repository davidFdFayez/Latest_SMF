import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ISOLATED TEST ONLY — never deploy (the production Website has no such route). The isolated start
      // script logs in to the isolated API and passes the admin token here, so the Draft preview is read
      // with the same Draw permission the Admin uses. Without SMTF_PREVIEW_TOKEN this rule does nothing useful.
      ...(process.env.SMTF_PREVIEW_TOKEN
        ? {
            '/api/isolated-preview': {
              target: process.env.SMF_API_PROXY,
              changeOrigin: true,
              headers: { Authorization: `Bearer ${process.env.SMTF_PREVIEW_TOKEN}` },
            },
          }
        : {}),
      '/api': {
        // Point the dev server at another API without editing this file:
        //   SMF_API_PROXY=http://127.0.0.1:5198 npm run dev
        target: process.env.SMF_API_PROXY || 'http://localhost:5080',
        changeOrigin: true,
      },
    },
  },
})
