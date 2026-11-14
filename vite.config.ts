import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: true, port: 2110 },
  preview: { host: true, port: 2110, allowedHosts: true },
  build: { chunkSizeWarningLimit: 1200 },
});
