import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Google Identity Services signs in through a popup that talks back to this page with
// postMessage; without this, Chrome warns that COOP would block that call.
// Production sets the same header in vercel.json.
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API calls in dev, so the refresh cookie just works.
    proxy: { '/api': 'http://localhost:3000' },
    headers,
  },
  preview: { headers },
});
