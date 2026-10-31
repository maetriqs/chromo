// By The_headphones
import { defineConfig } from 'vite';

// The site is plain static files served by GitHub Pages, so the built game is
// committed to games/overboost/. `base: './'` keeps every URL relative, so it works
// at https://USERNAME.github.io/REPOSITORY-NAME/games/overboost/ or any other path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: '../../games/overboost',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 5000, // the Rapier physics chunk embeds its WebAssembly (~4 MB raw, ~1.6 MB gzip)
    sourcemap: false,
  },
  server: { host: true },
});
