import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
