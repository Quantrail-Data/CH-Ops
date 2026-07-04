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
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// AI databse details for storing the database id for ai chat 
export const aiDatabaseDetails = sqliteTable("ai_database_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  credentials: text("credentials").notNull(),
  database_id: text("database_id").notNull(),
  database_type: text("database_type").notNull(),
  client: text("client").notNull(),
  is_valid: integer("is_valid", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

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





