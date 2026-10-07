import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base relativa: o build funciona em qualquer subpasta (GitHub Pages, servidor estático, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
