import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts']
  },
  build: {
    outDir: 'media/results',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/webviews/results/app/main.tsx',
      output: {
        entryFileNames: 'results.js',
        assetFileNames: 'results.css'
      }
    }
  }
});
