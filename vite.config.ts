import { defineConfig } from 'vite';

// ścieżki względne, żeby gra działała pod dowolnym adresem (np. GitHub Pages: /nazwa-repozytorium/)
export default defineConfig({
  base: './',
  // worker składany do jednego pliku (potrzebne dla tools/single-file.mjs)
  worker: { format: 'iife' },
});
