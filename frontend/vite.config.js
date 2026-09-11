import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': {
  target: 'http://localhost:5000', changeOrigin: true,
  configure(proxyServer) {
    proxyServer.on('proxyReq', (proxyRequest, request) => {
      // Overwrite visitor-supplied headers instead of trusting a claimed client IP.
      proxyRequest.setHeader('X-Forwarded-For', request.socket.remoteAddress);
    });
  },
} };
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { proxy },
});
