import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites need "/repo-name/"; local/dev can use "./"
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || './',
});
