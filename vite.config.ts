import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Rutes relatives perquè la mateixa compilació funcioni dins Tauri (escriptori)
// i Capacitor (Android), a més del navegador.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
});
