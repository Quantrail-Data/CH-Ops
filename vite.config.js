import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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

// Ports come from .env. PORT is the backend port; the dev server sends /api and
// /docs there. DEV_FRONTEND_PORT is the port of this dev server.
const DEFAULT_BACKEND_PORT = '7720';
const DEFAULT_DEV_FRONTEND_PORT = '7721';

export default defineConfig(({ mode }) => {
  // The empty prefix loads all variables, not only VITE_* ones. They are used
  // here only; they do not go into the frontend code.
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || DEFAULT_BACKEND_PORT;
  const devFrontendPort = Number(env.DEV_FRONTEND_PORT || DEFAULT_DEV_FRONTEND_PORT);
  const backendUrl = `http://localhost:${backendPort}`;

  return {
    plugins: [react(), tailwindcss(), searchHeadersPlugin],
    define: {
      __APP_VERSION__: JSON.stringify(resolvedAppVersion),
      __CH_VERSION__: JSON.stringify(appVersion.clickhouseVersion),
    },
    root: '.',
    publicDir: 'public',
    build: { outDir: 'dist', emptyOutDir: true },
    optimizeDeps: {
      entries: ['index.html'],
      // ECharts loads on demand (utils/echarts.js). Without this list, Vite
      // finds these parts only when the first chart page opens, and then
      // reloads the page.
      include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/features', 'echarts/renderers'],
    },
    server: {
      port: devFrontendPort,
      // Stop with an error if the port is in use, instead of moving to the next
      // free port without notice.
      strictPort: true,
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
        '/docs': { target: backendUrl, changeOrigin: true },
      },
    },
    resolve: { alias: { '@': '/src/frontend' } },
    test: {
      environment: 'jsdom',
      globals: true,
      // Defaults are 5s per test and 10s per hook. Both are wall clock, so they
      // shrink in effect as worker count rises - a suite that passes single
      // threaded can time out at 8x on the same machine. Raised so the limit
      // catches a hang rather than contention.
      testTimeout: 20000,
      hookTimeout: 20000,
      include: ['tests/frontend/**/*.test.{js,jsx}'],

      // vi.mock needs Vite's transform pipeline, which runs under Node. `bun run` starts vitest
      // with Node (the shebang of the vitest command), so every suite runs. Do not start vitest
      // with `bun --bun`: the mocks then do nothing, and the suites that use them fail.
      exclude: ['**/node_modules/**'],
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
  };
});
