import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so other computers on the LAN can reach it
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      // socket.io's handshake/transport path — must be proxied with
      // ws: true for the upgrade to a real WebSocket to go through.
      // The gateway's own namespace (/ws/laboratory) is negotiated over
      // this same connection, not a separate path.
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
