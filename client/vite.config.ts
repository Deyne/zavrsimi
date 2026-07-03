import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@zavrsi-mi/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
  port: 5173,
  allowedHosts: true,
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true },
    '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
  },
},
});
