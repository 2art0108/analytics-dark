import { defineConfig } from 'vite';

// The prototype is one self-contained document (index.html) plus the runtime and
// assets in public/. No bundler-side transforms are needed, so the config only
// pins the output directory Vercel picks up by default.
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
});
