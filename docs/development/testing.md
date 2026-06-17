# Testing

```bash
bun run test
```

This runs both backend (Bun test) and frontend (Vitest) test suites.

## Backend Tests

Run backend tests only:

```bash
bun test tests/backend
bun test tests/backend/crypto.test.js         # single file
```

| File | Cases | Description |
|------|-------|-------------|
| `rbac.test.js` | 31 | 4-tier role hierarchy, canChangeRole logic for all caller/target combinations (superadmin, admin, editor, readonly), middleware exports (requireAdmin, requireSuperAdmin, requireEditor), user management permission checks |
| `clickhouse.test.js` | 37 | FORMAT detection for 9 data query types and 11 DDL/DML types, 6 edge cases (comments, semicolons, empty), EXPLAIN raw detection for 9 graph/json variants |
| `notifier.test.js` | 19 | formatDetails (7 cases for field defaults and formatting), channel validation (7 types including email, slack, google_chat, teams, pagerduty), config flattening (5 string/object/null/malformed cases) |
| `integration.test.js` | API integration tests: cluster validation (limits, naming, node uniqueness), RBAC access control (role checks), SSRF prevention (node allowlist, webhook URL blocking), protected settings keys, alert node filtering | 36 |
| `alertScheduler.test.js` | 25 | evalThreshold for all 9 operators, parallel node aggregation (5 cases), per-rule node filtering (8 cases: null/undefined/empty/specific/single/no-match/invalid-JSON/parallel), parallel rule evaluation (3 timing/isolation cases) |
| `appUsers.test.js` | 10 | User CRUD with default readonly role, all 4 roles (superadmin, admin, editor, readonly), unique username constraint, role updates, superadmin count |
| `crypto.test.js` | 9 | AES-256-GCM roundtrip, random IV uniqueness, empty input handling, legacy plaintext backward compat, iv:tag:cipher format check, tamper detection, unicode support, 32-char secret minimum, per-install salt file |
| `drizzle.test.js` | 9 | Core 4 tables CRUD (settings, alerts, channels, junction), cascade deletes, boolean mode |
| `dashboards.test.js` | 7 | Dashboard and chart CRUD, SET NULL on dashboard delete (charts orphaned, not deleted) |
| `jwt.test.js` | 7 | Token create/verify roundtrip, jti claim presence, null secret throws, tamper rejection, token revocation via blocklist |
| `env.test.js` | 7 | Super admin loading from numbered env vars, legacy SUPER_ADMIN fallback, SMTP config parsing, required var validation |
| `securityHeaders.test.js` | 8 | All 7 headers set, strict CSP for app, relaxed CSP for docs (Docsify CDN), HSTS value, X-Powered-By removed, next() called |
| `rateLimiter.test.js` | 4 | Requests under limit pass, over limit returns 429, per-IP tracking, rate limit headers set |

## Frontend Tests

Run frontend tests only:

```bash
npx vitest run tests/frontend
npx vitest run tests/frontend/backups.test.js    # single module
```

| File | Module | Cases |
|------|--------|-------|
| `schema-routes.test.js` | Schema (nodes + cluster_id columns), 10 routes, auth, server, security, 4-tier RBAC, SPA catch-all, app backup, logger, request logger, multi-cluster, notifier cluster/timestamp | 124 |
| `sidebar-routing.test.js` | 10 sidebar sections, all 27 page routes, Storage Profiles under Administration, App Data Backup nav item | 70 |
| `chartTypes.test.js` | Chart type registry, all 13 builders, DOT graph parser | 48 |
| `backups.test.js` | Backup schema, routes, scheduler, S3 layout, UI components | 41 |
| `api-contract.test.js` | Plugin API contract, heatmap exports, downstream safety | 35 |
| `heatmaps-logs.test.js` | Unified amber scale, 1000-step interpolation, variance depth, themeKey re-init, download/fullscreen, 3 log pages, dark mode colors | 25 |
| `admin.test.js` | User management with 4 roles, role change confirmation, cluster management, DDL, docs | 25 |
| `scrollbars.test.js` | Scrollbar CSS and DataTable variants | 22 |
| `plugin-architecture.test.js` | Plugin loader, registry, manifest format | 21 |
| `sql-editor.test.js` | SQL editor: history (localStorage), bookmarks (server-side), export (CSV/JSON/TSV), autocomplete (keywords + functions + database.table), keyboard shortcuts (Ctrl+Enter, Ctrl+B) | SQL editor: EXPLAIN trees, query stats, explorer, query history, bookmarks, export | 32 |
| `navbar.test.js` | Navbar layout, font scaling, version info in dropdown, role badges, connection context | 17 |
| `Toast.test.jsx` | Toast notifications and ConfirmModal (jsdom rendering) | 12 |
| `indexes.test.js` | Shared treeChart utility (treeSize, treeSeries, treeSizeTB, pixel margins, no roam), indexes, projections, all 4 tree files import shared util | 15 |
| `DataTable.test.jsx` | DataTable component rendering and variants (jsdom) | 9 |
| `treeChart.test.js` | Runtime tests for treeChart.js: countLeaves, maxDepth, countAll, treeSize, treeSizeTB, treeSeries | 25 |
| `apiUtils.test.js` | Runtime tests for api.js: connection state, apiFetch, runQuery | 13 |
| `components.test.jsx` | Runtime render tests for SqlPreview, StatCard, DateTimePicker, ErrorBoundary (jsdom) | 19 |

**The suite spans backend and frontend test files covering the areas listed above.**

## Security-Specific Tests

The test suite covers security hardening:

- **crypto.test.js**: AES-256-GCM encrypt/decrypt roundtrip, random IV uniqueness, legacy plaintext backward compatibility, tamper detection, per-install salt, 32-char minimum
- **jwt.test.js**: No default secret (throws), 2h expiry (not 24h), jti claim presence, token revocation via blocklist
- **securityHeaders.test.js**: Strict CSP for app routes (`script-src 'self'`), relaxed CSP for `/docs/*` (allows CDN scripts for Docsify), HSTS with `max-age=31536000`, `frame-ancestors 'none'`
- **rbac.test.js**: 4-tier role hierarchy, canChangeRole for every caller/target combination, admin-level middleware allows both admin and superadmin
- **schema-routes.test.js**: Argon2id usage, brute-force lockout, DISABLE_ENV_LOGIN, credential encrypt/decrypt, SSRF prevention (node validation, webhook URL validation), RBAC on alert/backup/dashboard/settings/user write routes, SQL escaping, WAL mode, pinned dependencies, db:backup script

## Code Coverage

Run tests with coverage reports:

```bash
bun run test:coverage
```

This runs both backend and frontend suites with coverage enabled.

**Backend coverage** uses Bun's built-in `--coverage` flag. Output shows function and line coverage per source file:

```bash
bun run test:backend:coverage
```

**Frontend coverage** uses `@vitest/coverage-istanbul`. Must run through Node (`npx`), not Bun, because Bun does not support the `istanbul instrumentation` API that v8 coverage needs:

```bash
bun run test:frontend:coverage
# or directly:
npx vitest run tests/frontend --coverage
```

Most frontend tests read source files as strings to verify code structure (imports, function signatures, CSS classes). This is intentional - it catches breaking changes without needing a full browser environment. But it means runtime line coverage will be low since the code paths are not executed during testing. The jsdom test files (`Toast.test.jsx`, `DataTable.test.jsx`, `components.test.jsx`) and runtime test files (`treeChart.test.js`, `apiUtils.test.js`) do import and execute source modules, contributing actual coverage.
