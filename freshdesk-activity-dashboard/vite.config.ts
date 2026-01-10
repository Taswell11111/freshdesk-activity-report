
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Local development: Forward /api to your local Node server
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // Remove the 'preview' block to prevent port conflicts on Cloud Run
  build: {
    outDir: 'dist',
  },
  define: {
    // Avoid leaking keys in client bundle, they are in server.js
    // Explicitly mapping GEMINI_API_KEY for the client-side AI service
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
  },
});
