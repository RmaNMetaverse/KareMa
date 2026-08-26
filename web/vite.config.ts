import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sub-path this build will be served under: "/" for its own domain,
// "/KareMa/" to sit beside another app. Set BASE_PATH at build time.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
