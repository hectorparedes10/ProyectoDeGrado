import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': {
  target: 'http://127.0.0.1:5000', changeOrigin: true,
  configure(proxyServer) {
    proxyServer.on('proxyReq', (proxyRequest, request) => {
      // Overwrite visitor-supplied headers instead of trusting a claimed client IP.
      proxyRequest.setHeader('X-Forwarded-For', request.socket.remoteAddress);
    });
  },
} };
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
});
