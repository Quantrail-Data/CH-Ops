// Copyright (C) 2026 Quantrail™ Data Private Limited
// The numbered database migrations. db/migrationRunner.js runs the ones that a
// database does not have yet, each one time, in order.
//
// Rules (docs/development/database-migrations.md):
// - Add a new migration at the end, with the next number.
// - Never change or remove a migration after a release. To correct one, add
//   a new one.
// - The up function must be synchronous. It runs inside a transaction.
// - Change the schema in two steps: add first (with a default), remove or
//   rename in a later release, when no code uses the old column.

// Migration 1 brings a database from any earlier CHOps version to the schema
// of the first numbered version. Earlier versions ran these steps at every
// start, so they work on databases of every age.

const APP_USER_COLUMNS = `
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT NOT NULL UNIQUE,
password_hash TEXT,
role TEXT NOT NULL DEFAULT 'readonly',
email TEXT UNIQUE,
must_change_password INTEGER NOT NULL DEFAULT 1,
last_login_at TEXT,
created_at TEXT DEFAULT (datetime('now')),
updated_at TEXT DEFAULT (datetime('now')),
init_user INTEGER NOT NULL DEFAULT 0,
password_setup_token_hash TEXT DEFAULT NULL,
password_setup_token_expires_at TEXT DEFAULT NULL,
token_version INTEGER NOT NULL DEFAULT 0`;

// Columns that newer versions added to older tables.
const ADDED_COLUMNS = [
  "ALTER TABLE alert_rule ADD COLUMN nodes TEXT",
  "ALTER TABLE alert_rule ADD COLUMN cluster_id TEXT",
  "ALTER TABLE cluster ADD COLUMN endpoint TEXT",
  "ALTER TABLE app_user ADD COLUMN init_user INTEGER NOT NULL DEFAULT 0",
  // Dashboard filter presentation. SQLite backfills existing rows with the
  // DEFAULT when a column is added, so dashboards created before this read as
  // '{}' rather than NULL. The reader is defensive about NULL anyway, since a
  // row written by an older binary against a migrated database can still
  // arrive without it.
  "ALTER TABLE dashboard ADD COLUMN filters TEXT DEFAULT '{}'",
  "ALTER TABLE k8s_connection ADD COLUMN operator_namespace TEXT",
  "ALTER TABLE cluster ADD COLUMN k8s_addressing TEXT",
  "ALTER TABLE alert_rule ADD COLUMN last_notified_at TEXT",
  "ALTER TABLE alert_rule ADD COLUMN last_state TEXT",
  "ALTER TABLE app_user ADD COLUMN password_setup_token_hash TEXT DEFAULT NULL",
  "ALTER TABLE app_user ADD COLUMN password_setup_token_expires_at TEXT DEFAULT NULL",
  "ALTER TABLE app_user ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0",

  "ALTER TABLE alert_channel ADD COLUMN last_send_at TEXT",
  "ALTER TABLE alert_channel ADD COLUMN last_send_ok INTEGER",
  "ALTER TABLE alert_channel ADD COLUMN last_send_error TEXT",
  "ALTER TABLE alert_rule ADD COLUMN notify_interval_minutes INTEGER DEFAULT 0",
  "ALTER TABLE alert_rule ADD COLUMN last_breach_notified_at TEXT",
  "ALTER TABLE alert_rule ADD COLUMN breach_runs_required INTEGER DEFAULT 1",
  "ALTER TABLE alert_rule ADD COLUMN breach_run_count INTEGER DEFAULT 0",
  "ALTER TABLE alert_rule ADD COLUMN no_rows_means_breach INTEGER DEFAULT 0",
  "ALTER TABLE alert_rule ADD COLUMN template_id TEXT",
  "ALTER TABLE alert_rule ADD COLUMN template_edited INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE ai_chat_message ADD COLUMN chart_name TEXT",
  "ALTER TABLE ai_chat_message ADD COLUMN dash_id TEXT",
];

// "duplicate column name": an older version already added the column.
// "no such table": the table comes later (the cluster and k8s_connection
// tables are made by migrateClusters.js, with all their columns).
// Any other error is real and stops the migration.
function isExpectedAddColumnError(error) {
  return /duplicate column name|no such table/i.test(error.message);
}

function addColumns(sqlite) {
  for (const sql of ADDED_COLUMNS) {
    try {
      sqlite.exec(sql);
    } catch (error) {
      if (!isExpectedAddColumnError(error)) throw error;
    }
  }
}

// ch_cred_session moved to the (jti, context) key. Its rows are short-lived,
// encrypted credential sessions, so the old table is dropped; users connect
// again.
function dropOldCredentialSessionTable(sqlite) {
  const columns = sqlite.query("PRAGMA table_info(ch_cred_session)").all();
  if (columns.length && !columns.some((column) => column.name === "jti")) {
    sqlite.exec("DROP TABLE ch_cred_session");
  }
}

// An older version rebuilt app_user on every start. If one of those runs was
// stopped half way, the users can be left in app_user_new. Put them back.
function recoverInterruptedAppUserRebuild(sqlite) {
  const tableNames = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  if (!tableNames.includes("app_user_new")) return;
  const userCount = tableNames.includes("app_user")
    ? sqlite.query("SELECT count(*) AS total FROM app_user").get().total
    : 0;
  if (userCount > 0) {
    // app_user still holds the users, so app_user_new is a partial copy.
    sqlite.exec("DROP TABLE app_user_new");
  } else {
    // The users exist only in app_user_new.
    sqlite.exec("DROP TABLE IF EXISTS app_user");
    sqlite.exec("ALTER TABLE app_user_new RENAME TO app_user");
  }
  console.log("  Recovered app_user from an interrupted rebuild.");
}

function createTables(sqlite) {
  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_rule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    sql TEXT NOT NULL,
    threshold REAL NOT NULL DEFAULT 0,
    operator TEXT NOT NULL DEFAULT 'gt',
    severity TEXT NOT NULL DEFAULT 'warning',
    schedule TEXT NOT NULL DEFAULT '*/5 * * * *',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_value REAL,
    last_status TEXT,
    last_error TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    nodes TEXT,
    cluster_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_test_at TEXT,
    last_test_ok INTEGER,
    last_test_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alert_rule_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL REFERENCES alert_rule(id) ON DELETE CASCADE,
    alert_channel_id INTEGER NOT NULL REFERENCES alert_channel(id) ON DELETE CASCADE,
    UNIQUE(alert_rule_id, alert_channel_id)
  );
  CREATE TABLE IF NOT EXISTS alert_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    prev_status TEXT,
    value REAL,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_alert_event_rule ON
    alert_event(alert_rule_id, created_at
  );
  CREATE TABLE IF NOT EXISTS alert_rule_node_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    firing INTEGER NOT NULL DEFAULT 0,
    breach_run_count INTEGER NOT NULL DEFAULT 0,
    last_value REAL,
    last_error TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (alert_rule_id, node_name)
  );
  CREATE TABLE IF NOT EXISTS dashboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    columns INTEGER NOT NULL DEFAULT 2,
    filters TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dashboard_id INTEGER REFERENCES dashboard(id) ON DELETE SET NULL,
    grid_row INTEGER NOT NULL DEFAULT 0,
    grid_col INTEGER NOT NULL DEFAULT 0,
    sql_query TEXT NOT NULL,
    chart_type TEXT NOT NULL,
    chart_subtype TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS app_user (${APP_USER_COLUMNS}
  );
  CREATE TABLE IF NOT EXISTS api_key (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_database_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credentials TEXT NOT NULL,
    database_id TEXT NOT NULL,
    database_type TEXT NOT NULL,
    client TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    is_valid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ch_cred_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_user TEXT NOT NULL,
    jti TEXT NOT NULL,
    context TEXT NOT NULL,
    cluster_id TEXT,
    node TEXT,
    port INTEGER,
    ch_user TEXT NOT NULL,
    encrypted_password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    UNIQUE (jti, context)
  );
  CREATE TABLE IF NOT EXISTS trusted_ca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pem TEXT NOT NULL,
    subject TEXT,
    issuer TEXT,
    fingerprint TEXT,
    not_before TEXT,
    not_after TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_user TEXT NOT NULL,
    title TEXT,
    cluster_id TEXT,
    node TEXT,
    selected_tables TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_chat_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL REFERENCES ai_chat(id) ON DELETE CASCADE,
    instruction TEXT NOT NULL,
    sql TEXT,
    response_text TEXT,
    ddl_snapshot TEXT,
    ddl_truncated INTEGER NOT NULL DEFAULT 0,
    tokens_estimated INTEGER,
    provider TEXT,
    model TEXT,
    error_code TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_ddl_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    node TEXT NOT NULL,
    database_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    ddl TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(cluster_id, node, database_name, table_name)
  );
  CREATE TABLE IF NOT EXISTS k8s_health_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    check_name TEXT NOT NULL,
    status TEXT NOT NULL,
    consecutive_fails INTEGER NOT NULL DEFAULT 0,
    notified INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (cluster_id, check_name)
  );
  CREATE TABLE IF NOT EXISTS k8s_health_alert_config (
    cluster_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    channels_json TEXT NOT NULL DEFAULT '[]',
    last_run_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
}

// Older databases have password_hash NOT NULL, which SQLite cannot change in
// place. Rebuild app_user; after that the column is optional.
function rebuildAppUserIfPasswordRequired(sqlite) {
  const columns = sqlite.query("PRAGMA table_info(app_user)").all();
  const passwordColumn = columns.find((column) => column.name === "password_hash");
  if (!passwordColumn || passwordColumn.notnull === 0) return;
  const copiedColumns =
    "id, username, password_hash, role, email, must_change_password, last_login_at, created_at, updated_at, init_user, password_setup_token_hash, password_setup_token_expires_at, token_version";
  sqlite.exec(`CREATE TABLE app_user_new (${APP_USER_COLUMNS})`);
  sqlite.exec(`INSERT INTO app_user_new (${copiedColumns}) SELECT ${copiedColumns} FROM app_user`);
  sqlite.exec("DROP TABLE app_user");
  sqlite.exec("ALTER TABLE app_user_new RENAME TO app_user");
  console.log("  Rebuilt app_user so password_hash is optional.");
}

function upgradeToFirstNumberedSchema(sqlite) {
  dropOldCredentialSessionTable(sqlite);
  recoverInterruptedAppUserRebuild(sqlite);
  createTables(sqlite);
  addColumns(sqlite);
  // Each user now has their own bookmarks ("query_bookmarks:<user id>"). The
  // old shared list has no owner, so it is removed (one time only).
  sqlite.exec("DELETE FROM app_setting WHERE key = 'query_bookmarks'");
  rebuildAppUserIfPasswordRequired(sqlite);
}

export const MIGRATIONS = [
  {
    version: 1,
    description: "Bring a database from any earlier version to the first numbered schema",
    up: upgradeToFirstNumberedSchema,
  },
  // Add the next migration here, for example:
  // {
  //   version: 2,
  //   description: "Add alert_rule.owner",
  //   up: (sqlite) => sqlite.exec("ALTER TABLE alert_rule ADD COLUMN owner TEXT"),
  // },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;
