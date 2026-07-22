import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const allowedHosts = ['localhost', '127.0.0.1'];
  const etsyRedirectUri = process.env.ETSY_REDIRECT_URI;
  if (etsyRedirectUri) {
    try {
      allowedHosts.push(new URL(etsyRedirectUri).hostname);
    } catch {
      // The Etsy setup endpoint reports malformed redirect URLs separately.
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
      'process.env.API_KEY': JSON.stringify(geminiApiKey),
    },
  };
});
