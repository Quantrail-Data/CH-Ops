# Project Structure

CHOps follows a modular directory structure where each sidebar section maps to a component directory. Routes and controllers are separated on the backend; route files are thin routers that import handler functions from controller files.

```
chops/
  version.json              # Single source of truth for app version
  package.json              # Dependencies and scripts
  vite.config.js            # Vite + React + Vitest config
  drizzle.config.js         # Drizzle ORM config
  index.html                # HTML entry point (loads React)
  .env.example              # Configuration template
  data/                     # SQLite database (created at runtime, gitignored)
  dist/                     # Built frontend (created by `bun run build`, gitignored)
  docs/                     # Documentation site (Docsify)
  public/                   # Static assets served by Vite
  src/
    pluginLoader.js         # Backend plugin auto-discovery
    backend/
      server.js             # Express app entry point, middleware, route mounting
      db/
        schema.js           # Drizzle ORM schema (plain JS)
        index.js            # Database connection (bun:sqlite + Drizzle)
        migrate.js          # Table creation and seed script
      middleware/
        auth.js             # JWT authentication middleware
        rateLimiter.js      # In-memory per-IP rate limiter
        securityHeaders.js  # Security response headers
      routes/               # Thin routers - define HTTP endpoints only
        auth.js             # POST / (login), POST /change-password
        config.js           # GET /connection
        cluster.js          # GET /, PUT /, POST /test
        query.js            # POST / (query proxy), POST /test-connection
        settings.js         # CRUD for app settings
        dashboards.js       # CRUD for dashboards and charts
        alerts.js           # CRUD for rules and channels
        users.js            # User management
        backups.js          # Backup schedule CRUD
      controllers/          # Business logic, validation, database operations
        auth.js             # login, changePassword (argon2id, timing-safe)
        config.js           # getConnection
        cluster.js          # getCluster, updateCluster, testConnection
        query.js            # runQuery, testQueryConnection
        settings.js         # listSettings, getSetting, upsertSetting, deleteSetting
        dashboards.js       # Dashboard + chart CRUD handlers
        alerts.js           # Rule + channel CRUD + testChannel
        users.js            # listUsers, createUser, updateUser, deleteUser
        backups.js          # Schedule CRUD + toggleSchedule
      services/
        alertScheduler.js   # 3-level parallel alert evaluation engine
        backupScheduler.js  # Hourly backup execution with S3 manifests
        clickhouse.js       # ClickHouse® HTTP query executor
        crypto.js           # AES-256-GCM credential encryption (scrypt key derivation)
        jwt.js              # JWT token creation, verification, and revocation
        notifier.js         # 5-channel notification dispatcher
      utils/
        env.js              # Environment variable loader
    frontend/
      App.jsx               # Root component (Auth, Theme, Connection contexts)
      main.jsx              # React entry point
      pluginRegistry.js     # Frontend plugin auto-discovery (import.meta.glob)
      components/
        admin/              # UserManagement.jsx, ClusterManagement.jsx
        alerting/           # AlertRules.jsx, AlertChannels.jsx
        backups/            # DataLifecycle.jsx, StorageProfiles.jsx
        dashboards/         # ChartBuilder.jsx, DashboardView.jsx, AllCharts.jsx
        editor/             # QueryEditor.jsx
        indexes/            # SecondaryIndexes.jsx, Projections.jsx, CreateIndex.jsx
        layout/             # Shared: Navbar, Sidebar, MainLayout, DataTable,
                            #   ChartCard, Toast, ConfirmModal, LogHeatmap,
                            #   DateTimePicker, AlertMarquee, ErrorBoundary,
                            #   LoginPage, SharedComponents, SqlPreview
        logs/               # CrashLog.jsx, ErrorLog.jsx, TextLog.jsx
        merges/             # MergesMutations.jsx
        monitoring/         # MonitoringDashboards.jsx
        overview/           # ClusterOverview.jsx, DistributedDDL.jsx
        queries/            # QueriesSection.jsx
        rbac/               # RbacViewGrants, RbacUsers, RbacRoles, RbacProfiles
        tables/             # TablesAndParts.jsx
      hooks/
        useQuery.js         # ClickHouse® query execution hook
      styles/
        global.css          # Design tokens, component styles, themes
      utils/
        api.js              # runQuery(), apiFetch(), global connection store
        echarts.js          # Chart theme registration, initChart(), disposeChart()
    plugins/
      _example/             # Example plugin (inactive, prefixed with _)
        plugin.json         # Plugin manifest
        routes.js           # Express router
        components/         # React components
  tests/
    backend/                # Bun test files
    frontend/               # Vitest files
```

## Adding a New Page

1. Create a component in `src/frontend/components/<module>/YourPage.jsx`.
2. In `MainLayout.jsx`, add a lazy import and a route entry to `CORE_ROUTES`.
3. In `Sidebar.jsx`, add a nav entry to the appropriate section in `NAV_ITEMS`.

## Adding a New API Route

1. Create a controller in `src/backend/controllers/yourModule.js` with handler functions.
2. Create a route in `src/backend/routes/yourModule.js` that imports from the controller.
3. Mount it in `server.js` with `app.use('/api/your-module', authMiddleware, yourRoute)`.
