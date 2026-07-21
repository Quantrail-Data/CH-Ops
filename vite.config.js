import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { generatePageHeaders } from './scripts/build-search-headers.mjs';
import { resolveVersion } from './scripts/resolveVersion.mjs';

const appVersion = JSON.parse(readFileSync('./version.json', 'utf-8'));
// App version shown in the UI: VERSION env var (set by the release pipeline
// from the git tag) if present, else {branch}-{commit} for dev/local builds.
// version.json's clickhouseVersion stays the source of truth for that field.
const resolvedAppVersion = resolveVersion();

// Regenerate the scraped page-header search index at dev-server / build start.
// Skipped under Vitest, which relies on the committed generated file.
const searchHeadersPlugin = {
  name: 'gen-search-headers',
  buildStart() {
    if (process.env.VITEST) return;
    try {
      generatePageHeaders();
    } catch (e) {
      this.warn('search headers generation skipped: ' + e.message);
    }
  },
};

export default defineConfig({
  plugins: [react(), searchHeadersPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(resolvedAppVersion),
    __CH_VERSION__: JSON.stringify(appVersion.clickhouseVersion),
  },
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true },
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/docs': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  resolve: { alias: { '@': '/src/frontend' } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/frontend/**/*.test.{js,jsx}'],
    setupFiles: ['tests/frontend/setup.js'],
    coverage: {
      provider: 'istanbul',
      include: ['src/frontend/**/*.{js,jsx}'],
      exclude: ['src/frontend/main.jsx'],
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: 'coverage/frontend',
      thresholds: { lines: 0, branches: 0, functions: 0, statements: 0 },
    },
  },
});
