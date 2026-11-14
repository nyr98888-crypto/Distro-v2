import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { distroLocalApi } from './vite-plugin-api'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [
    react(),
    distroLocalApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Distro V2',
        short_name: 'Distro',
        description: 'Facebook group post scheduling for PC, Android, and iOS',
        theme_color: '#111827',
        background_color: '#F6F8FA',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['productivity', 'social'],
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        // Never SPA-fallback API or hashed build assets (stale SW was returning
        // text/html for missing /assets/*.js → blank page MIME error).
        navigateFallbackDenylist: [/^\/api\//, /^\/assets\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'distro-assets',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
