import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'PooramPay',
        short_name: 'PooramPay',
        description: 'Festival committee collections & expense management',
        theme_color: '#3730a3',
        background_color: '#f5f5f4',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        lang: 'en',
        categories: ['finance', 'productivity', 'business'],
        start_url: '/',
        prefer_related_applications: false,
        // PNG-only icon list for maximum store/packager compatibility
        // ?v=2 busts stale favicon/manifest caches (browser, SW, PWABuilder)
        // after the logo redesign — bump it whenever the artwork changes.
        icons: [
          { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/screenshots/s1.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'PooramPay — festival committee finance' },
          { src: '/screenshots/s2.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'Everything the committee needs' },
          { src: '/screenshots/s3.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'PooramPay on the web' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // let /favicon.svg?v=2 etc. still match the precached /favicon.svg
        ignoreURLParametersMatching: [/^v$/, /^utm_/],
        // store screenshots are only for the install UI — don't bloat the runtime cache
        globIgnores: ['**/screenshots/**'],
        navigateFallbackDenylist: [/^\/auth/],
        // don't auto-activate; the in-app "Update now" prompt controls skipWaiting
        clientsClaim: true,
      },
    }),
  ],
  server: { port: 5173 },
});
