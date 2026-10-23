import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'https://psm-office-api-84c884d6ab34.herokuapp.com',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'https://psm-office-api-84c884d6ab34.herokuapp.com',
        changeOrigin: true,
      },
    },
  },
})
