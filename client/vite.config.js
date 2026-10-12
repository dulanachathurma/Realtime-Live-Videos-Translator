import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks to Vite (port 5173); Vite forwards socket + API traffic to the Node server (port 5000).
// localhost counts as a "secure context", which screen/tab audio capture and AudioWorklet require.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
