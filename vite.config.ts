import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: 'http://localhost:3334',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3333,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    port: 3333,
    strictPort: true,
    proxy: apiProxy,
  },
});
