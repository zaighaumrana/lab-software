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
  build: {
    commonjsOptions: {
      // Workspace packages (e.g. @lms/shared) are pnpm symlinks whose real
      // path lives outside node_modules/ (packages/shared/dist/...). Vite
      // resolves symlinks to their real path by default, and Rollup's
      // commonjs-interop plugin only applies to paths matching
      // `/node_modules/` unless told otherwise — so a workspace package's
      // CJS output was being parsed as if it were plain ESM (no `export`
      // keywords), and every named import from it failed to resolve.
      // Widening `include` (rather than setting `resolve.preserveSymlinks`,
      // which breaks other pnpm packages' own `exports`-map resolution,
      // e.g. react-router-dom -> react-router/dom) fixes just this case.
      include: [/node_modules/, /packages[\\/]shared/],
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
