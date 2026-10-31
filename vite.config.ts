import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      ws: false as false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/output/**', '**/dist/**', '**/.smart-esgp-data/**'],
      },
      fs: {
        // The dev server serves any file under the project root, so farmer data,
        // evidence photos and server-only code must be denied explicitly.
        // Setting deny replaces Vite's defaults, so those are repeated first.
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          '**/.smart-esgp-data/**',
          '**/.smart-esgp-media/**',
          '**/src/server/**',
          '**/db/**',
          'server.ts',
          'whatsapp-server.ts',
        ],
      },
    },
  };
});
