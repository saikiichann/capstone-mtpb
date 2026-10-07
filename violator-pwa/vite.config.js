import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// `npm run dev:phone` (mode "phone") serves the app over https on your
// local network, so you can open it on a phone and test installing the PWA.
export default defineConfig(({ mode }) => ({
  // Shown on Help & Support.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: mode === 'phone' ? { host: true } : undefined,
  plugins: [
    react(),
    mode === 'phone' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'MTPB Violator Portal',
        short_name: 'MTPB Violator',
        description:
          'View your vehicle clamping/impounding violation details, computed fine, and settle payment — no app install needed.',
        theme_color: '#000000',
        background_color: '#f8f8ff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell only. No push notifications are used in
        // this system, so no custom push/notificationclick handlers here.
        // Poppins: precache only the Latin subsets (latin-ext covers ₱) so
        // text renders offline without shipping every language subset.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,webp}',
          'assets/poppins-latin-*.woff2',
        ],
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
}))
