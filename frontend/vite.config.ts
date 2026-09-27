import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs on its own port; the proxy keeps the frontend
    // origin-agnostic so no base URL is hardcoded anywhere in the code.
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:3000', changeOrigin: true },
      '/realtime': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
