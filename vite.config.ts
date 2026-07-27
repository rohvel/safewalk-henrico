import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        // maplibre-gl is by far the largest dependency; splitting it into its
        // own chunk lets the app shell load and render before the map engine.
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
})