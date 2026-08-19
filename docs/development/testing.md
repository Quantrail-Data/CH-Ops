# Testing

Run the full suite (backend and frontend) with:

```bash
bun run test
```

This runs the backend tests with Bun's built-in test runner and the frontend tests with Vitest.

## Backend tests

The backend suite runs under `bun test`. It spans five directories: `tests/backend`, `tests/isolated`, `tests/no-mocks`, `tests/db`, and `tests/net`. Run the main set on its own, or point it at a single file:

```bash
bun test tests/backend
bun test tests/backend/crypto.test.js    # single file
```

Most backend tests live in `tests/backend/`. The suite grows over time, so treat the directory listing as the authoritative list. It currently covers these areas.

| Area | Representative files |
|------|----------------------|
| Authentication, sessions, and security | `auth-logout.test.js`, `auth-env-fallback.test.js`, `jwt.test.js`, `crypto.test.js`, `chCredStore.test.js`, `securityHeaders.test.js`, `rateLimiter.test.js`, `middleware.test.js`, `bodyLimits.test.js` |
| Users and roles (RBAC) | `rbac.test.js`, `users.test.js`, `appUsers.test.js` |
| ClickHouse® connection and queries | `clickhouse.test.js`, `query.test.js`, `cluster.test.js`, `clusterUtils.test.js` |
| Alerting and notifications | `alertScheduler.test.js`, `alerts.test.js`, `notifier.test.js` |
| App data, settings, and the DB layer | `drizzle.test.js`, `dashboards.test.js`, `dashboardFilters.test.js`, `settings.test.js`, `config.test.js`, `env.test.js` |
| Schema Studio | `schema-studio.test.js`, `schema-studio-routes.test.js`, `SchemaContextBuilder.test.js`, `databaseConnectionSchemaSqlGeneration.test.js` |
| AI providers and Qurioz | `aiService-gemini.test.js`, `aiService-claude.test.js`, `aiService-mistral.test.js`, `aiService-ollama.test.js`, `aiService-constructor.test.js`, `aiCredentials.test.js`, `apiKeys-ollama-route.test.js`, `sqlAIChat.test.js`, `embeddingService.test.js`, `localVectorStoreService.test.js` |
| Exports | `exportFormats.test.js`, `exportStream.test.js`, `exportCompress.test.js`, `exportjobs.test.js`, `sqlExport.test.js` |
| Kubernetes | `k8sClient.test.js`, `k8sErrors.test.js` |
| SQL parameters and misc | `sqlParams.test.js`, `deleteDatabaseService.test.js` |
| Cross-cutting integration and errors | `integration.test.js`, `exceptions.test.js` |

Representative coverage across these files includes: the four-tier role hierarchy and `canChangeRole` logic for every caller and target combination; the RBAC middleware (`requireAdmin`, `requireSuperAdmin`, `requireEditor`); AES-256-GCM encrypt and decrypt with random IVs, tamper detection, legacy plaintext fallback, and the per-install salt; JWT create and verify, the `jti` claim, and revocation via the blocklist; the encrypted per-session ClickHouse&reg; credential store; FORMAT detection and EXPLAIN handling in the ClickHouse&reg; client; threshold evaluation and per-node filtering in the alert scheduler; cluster validation (limits, naming, node uniqueness); SSRF prevention through the node allowlist; protected settings keys; and Drizzle CRUD with cascade and set-null behavior.

## Frontend tests

The frontend suite runs under Vitest. Run it on its own, or point it at a single file:

```bash
vitest run tests/frontend
vitest run tests/frontend/backups.test.js    # single file
```

The frontend tests live in `tests/frontend/`. As with the backend suite, the directory listing is the authoritative list. It currently covers these areas.

| Area | Representative files |
|------|----------------------|
| SQL Editor and query tools | `SqlEditor.test.jsx`, `SqlEditor-tabs.test.jsx`, `sql-editor.test.js`, `sql-classify.test.js`, `sqlHighlight.test.js`, `editor-session.test.js`, `QueryTabs.test.jsx`, `useQueryTabs.test.js`, `query-compare.test.js`, `query-profiler.test.js`, `query-metrics.test.jsx`, `MaxRowsControl.test.jsx`, `functionDocs.test.js` |
| Charts and dashboards | `chart-builder-preview.test.js`, `chart-toolbar.test.js`, `chartTypes.test.js`, `DashboardFilters.test.jsx`, `dashboard-filters-wiring.test.js`, `dashboardParams.test.js`, `dragPayload.test.js` |
| Schema Studio and schema routes | `schema-studio-ddl.test.js`, `schema-studio-engine.test.js`, `schema-studio-ui.test.js`, `schema-routes.test.js` |
| Administration, users, and auth UX | `admin.test.js`, `user-management.test.jsx`, `api-management.test.jsx`, `app-data-backup.test.jsx`, `force-password-change.test.js`, `idle-timeout.test.js`, `login-carousel.test.js` |
| Navigation, layout, and search | `sidebar-routing.test.js`, `navbar.test.js`, `global-search.test.js`, `session-log.test.js`, `tooltipHost.test.jsx` |
| Monitoring, overview, and logs | `playback.test.js`, `heatmaps-logs.test.js`, `overview-charts.test.js`, `overview-live.test.jsx`, `overview-page.test.jsx`, `podLogs.test.js` |
| Indexes and chart/tree utilities | `indexes.test.js`, `treeChart.test.js` |
| Backups | `backups.test.js` |
| Export and share | `export-wizard.test.jsx`, `ExportWizard-resume.test.jsx`, `BookmarkExport.test.jsx`, `ShareDialog.test.jsx`, `shareLink.test.js` |
| Shared components and UI | `DataTable.test.jsx`, `DataTable-virtual.test.jsx`, `Toast.test.jsx`, `components.test.jsx`, `select-component.test.jsx`, `scrollbars.test.js`, `icon-tabler-only.test.js` |
| API and utilities | `apiUtils.test.js` |

### Testing approach

Frontend tests come in two styles. Many read source files as strings and assert on structure (imports, function signatures, route tables, CSS classes). This is intentional: it catches breaking changes without a browser, and it is why runtime line coverage looks low for those files, because their code paths are not executed. The `.jsx` files (for example, `DataTable.test.jsx`, `Toast.test.jsx`, `components.test.jsx`, `query-metrics.test.jsx`, `api-management.test.jsx`, `app-data-backup.test.jsx`, `user-management.test.jsx`) render components in jsdom, and several `.js` files (for example, `treeChart.test.js`, `apiUtils.test.js`, `sql-classify.test.js`) import and execute source modules directly. Those contribute actual runtime coverage. The jsdom environment and shared setup are configured in `vite.config.js` and `tests/frontend/setup.js`.

## Security-specific tests

Security hardening is exercised across several files:

- `crypto.test.js`: AES-256-GCM roundtrip, random IV uniqueness, legacy plaintext backward compatibility, tamper detection, per-install salt, and the 32-character secret minimum.
- `jwt.test.js`: no default secret (throws), the `jti` claim, and token revocation via the blocklist.
- `securityHeaders.test.js`: strict CSP for app routes (`script-src 'self'`), the relaxed CSP for `/docs/*` that allows the Docsify CDN, HSTS with `max-age=31536000`, and `frame-ancestors 'none'`.
- `rbac.test.js`: the four-tier role hierarchy, `canChangeRole` for every caller and target combination, and admin-level middleware that allows both admin and superadmin.
- `chCredStore.test.js` and `rateLimiter.test.js`: the encrypted per-session credential store and the per-IP rate limiter.
- `integration.test.js` and `schema-routes.test.js`: SSRF prevention (node and webhook URL validation) and RBAC enforcement on alert, backup, dashboard, settings, and user write routes.

## Code coverage

Run both suites with coverage:

```bash
bun run test:coverage
```

This runs the backend coverage first, then the frontend coverage.

**Backend coverage** uses Bun's built-in `--coverage` flag, which writes a text summary and an LCOV report:

```bash
bun run test:backend:coverage
```

**Frontend coverage** uses the Istanbul provider through `@vitest/coverage-istanbul`, configured in `vite.config.js` to write into `coverage/frontend`:

```bash
bun run test:frontend:coverage
# or directly:
vitest run tests/frontend --coverage
```

Because many frontend tests read source as strings rather than a run of it, frontend line coverage understates how much is verified. The jsdom and runtime tests noted above are what drive the executed portion.

## Continuous integration

The `Run Unit Tests` GitHub Actions workflow runs on pull requests. It sets up Bun, installs dependencies (`bun install --frozen-lockfile`), checks for sensitive data in console logging (`bun run check:sensitive-logging`), runs the full suite with coverage (`bun run test:coverage`), and runs the linter (`bun run lint`). It also generates a coverage summary with `scripts/coverage-report.mjs` and uploads it as an artifact. A separate `Post Coverage Comment` workflow then posts that summary as a PR comment.

A separate `Verify Binary Build` job compiles the standalone binary as a build-only check with `bun run build:standalone:linux`, and smoke-tests the result. This confirms the binary still compiles and starts.
