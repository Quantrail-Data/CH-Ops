// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// CHOps v6 Drizzle ORM Schema configured for bun:sqlite with instructions for migration to Postgres.

import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// App Settings

export const appSettings = sqliteTable("app_setting", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value"),
  category: text("category").notNull().default("general"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  
});

// Alert Rules

export const alertRules = sqliteTable("alert_rule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  sql: text("sql").notNull(),
  threshold: real("threshold").notNull().default(0),
  operator: text("operator").notNull().default("gt"),
  severity: text("severity").notNull().default("warning"),
  schedule: text("schedule").notNull().default("*/5 * * * *"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastValue: real("last_value"),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  nodes: text("nodes"), // JSON array of node hostnames, null = all nodes
  clusterId: text("cluster_id"), // which cluster this alert runs on, null = first cluster
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// Alert Channels

export const alertChannels = sqliteTable("alert_channel", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastTestAt: text("last_test_at"),
  lastTestOk: integer("last_test_ok", { mode: "boolean" }),
  lastTestError: text("last_test_error"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// Alert Rule <-> Channel (many-to-many)

export const alertRuleChannels = sqliteTable("alert_rule_channel", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alertRuleId: integer("alert_rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  alertChannelId: integer("alert_channel_id")
    .notNull()
    .references(() => alertChannels.id, { onDelete: "cascade" }),
});

// Custom Dashboards

export const dashboards = sqliteTable("dashboard", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  columns: integer("columns").notNull().default(2),
  // Presentation for the dashboard filter bar, keyed by parameter name:
  //   { "region": { label, order, default, hidden }, ... }
  // Only what discovery cannot infer. The filters themselves are discovered
  // from the {name:Type} placeholders in each chart's sql_query, so the chart
  // table needs no column for this and an existing chart becomes filterable
  // the moment a placeholder is added to its SQL.
  //
  // Declaring it here does NOT alter an existing database - migrate.js creates
  // tables with CREATE TABLE IF NOT EXISTS. The matching ALTER TABLE lives in
  // the guarded migrations list there and is required.
  filters: text("filters").default("{}"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const charts = sqliteTable("chart", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dashboardId: integer("dashboard_id").references(() => dashboards.id, {
    onDelete: "set null",
  }),
  gridRow: integer("grid_row").notNull().default(0),
  gridCol: integer("grid_col").notNull().default(0),
  sqlQuery: text("sql_query").notNull(),
  chartType: text("chart_type").notNull(),
  chartSubtype: text("chart_subtype").notNull(),
  config: text("config").notNull().default("{}"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const appUsers = sqliteTable("app_user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("readonly"), // 'superadmin' | 'admin' | 'editor' | 'readonly'
  email: text("email"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(true),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// API Keys for Qurioz AI
export const apiKeys = sqliteTable("api_key", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});


// Qurioz AI Chats 
export const aiChat = sqliteTable("ai_chat",{
  id: integer("id").primaryKey({autoIncrement : true}),
  appUser: text("app_user").notNull(),
  title: text("title"),
  clusterId: text("cluster_id"),
  node: text("node"),
  selectedTables: text("selected_tables").notNull().default("[]"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt : text("updated_at").default(sql`(datetime('now'))`),
})

// Qurioz ai_chat_message
export const aiChatMessage = sqliteTable("ai_chat_message",{
  id: integer("id").primaryKey({autoIncrement: true}),
  chatId: integer("chat_id")
  .notNull().
  references(() => aiChat.id, {onDelete: "cascade"}),
  instruction: text("instruction").notNull(),
  // Null when generation failed; errorCode says why.
  sql: text("sql"),
  // A non-SQL reply, when the question did not call for one.
  responseText: text("response_text"),
  ddlSnapshot: text("ddl_snapshot"),
  // Set when the snapshot exceeded 256 KB and was cut short.
  ddlTruncated: integer("ddl_truncated", { mode: "boolean" }).notNull().default(false),
  tokensEstimated: integer("tokens_estimated"),
  provider: text("provider"),
  model: text("model"),
  errorCode: text("error_code"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
})

// qurioz ai_ddl_cache table
export const aiDdlCache = sqliteTable("ai_ddl_cache", {
  id: integer("id").primaryKey({autoIncrement:true}),
  clusterId: text("cluster_id").notNull(),
  node: text("node").notNull(),
  databaseName: text("database_name").notNull(),
  tableName: text("table_name").notNull(),
  ddl: text("ddl").notNull(),
  charCount: integer("char_count").notNull(),
  fetchedAt: text("fetched_at").default(sql`(datetime('now'))`),
}, (t) => ({
  ddlCacheTarget: unique("ai_ddl_cache_target")
    .on(t.clusterId, t.node, t.databaseName, t.tableName),
}));

// Schema Studio per-user ClickHouse credential session.
//
// One row per app user (keyed by the JWT username). Holds the connection
// target and the ClickHouse password encrypted at rest via crypto.js. The
// browser never receives the password; the Schema Studio routes resolve it
// server-side for the lifetime of the session and clear it on disconnect or
// expiry. appUser is unique so connecting again replaces any prior session.
export const chCredSession = sqliteTable("ch_cred_session", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // app_user is kept for auditing only; the session is keyed by (jti, context).
  appUser: text("app_user").notNull(),
  // The JWT id of the login this credential belongs to, so the credential's
  // lifetime is bound to the session: a new login (new jti) never reuses it, and
  // revoking the token clears it.
  jti: text("jti").notNull(),
  // Which feature owns this credential: 'editor' or 'schema-studio'. Lets the two
  // features hold distinct ClickHouse credentials under the same login.
  context: text("context").notNull(),
  clusterId: text("cluster_id"),
  node: text("node"),
  port: integer("port"),
  chUser: text("ch_user").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  expiresAt: text("expires_at"),
}, (t) => ({
  jtiContext: unique("ch_cred_session_jti_context").on(t.jti, t.context),
}));

// Kubernetes support. Cluster config moved from a JSON blob to rows, so the refresh has a single writer.

// One row per cluster.
export const clusters = sqliteTable("cluster", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("direct"),
  // Optimistic concurrency.
  version: integer("version").notNull().default(1),

  // Credentials at cluster level, inherited by every node that does not carry its own.
  chUser: text("ch_user"),
  chPasswordEnc: text("ch_password_enc"),
  port: integer("port"),
  secure: integer("secure", { mode: "boolean" }).notNull().default(false),
  endpoint: text("endpoint"),

  // Set only when kind is 'k8s'.
  k8sConnectionId: text("k8s_connection_id"),
  k8sNamespace: text("k8s_namespace"),
  k8sInstallation: text("k8s_installation"),
  // Which operator manages this installation: 'akoc' or 'ocko'.
  k8sOperator: text("k8s_operator").notNull().default("akoc"),
  lastRefreshedAt: text("last_refreshed_at"),

  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// One row per node.
export const clusterNodes = sqliteTable("cluster_node", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clusterId: text("cluster_id").notNull(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(8123),

  // Null means inherit from the cluster.
  user: text("user"),
  passwordEnc: text("password_enc"),

  secure: integer("secure", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("manual"),

  shard: integer("shard"),
  replica: integer("replica"),
  podName: text("pod_name"),

  // Touched on every successful refresh.
  lastSeenAt: text("last_seen_at"),

  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
}, (t) => ({
  clusterNodeName: unique("cluster_node_cluster_name").on(t.clusterId, t.name),
}));

// One row per Kubernetes cluster CHOps can read.
export const k8sConnections = sqliteTable("k8s_connection", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  apiAddress: text("api_address").notNull(),
  caCertificate: text("ca_certificate").notNull(),
  tokenEnc: text("token_enc").notNull(),

  // JSON array of namespace names.
  namespacesJson: text("namespaces_json"),

  // Result of the hostName() probe: whether two queries on one connection reach the same
  affinityOk: integer("affinity_ok", { mode: "boolean" }),

  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const trustedCas = sqliteTable("trusted_ca", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pem: text("pem").notNull(),

  // Parsed once when saved, so the list can be shown without re-parsing every
  // certificate on every page load.
  subject: text("subject"),
  issuer: text("issuer"),
  fingerprint: text("fingerprint"),
  notBefore: text("not_before"),
  notAfter: text("not_after"),

  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});