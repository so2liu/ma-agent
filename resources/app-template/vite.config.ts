import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Port is injected by the platform via --port flag
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:{{SANDBOX_PORT}}',
        changeOrigin: true
      }
    }
  }
});
