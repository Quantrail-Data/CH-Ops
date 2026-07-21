// Global search catalog.
//
// One entry per navigable page. Each entry carries a curated `keywords` list and
// a short `description` in addition to its label, because a raw sidebar label
// rarely contains the words a user actually types. For example "DDL queue block"
// matches nothing against the label "DDL & Readonly", but matches strongly
// against that page's keywords ("ddl queue", "on-cluster queue", "blocked",
// "stuck"). The engine ranks what it is given; the quality lives in this list.
//
// Every `id` here must be a real route id (see CORE_ROUTES in MainLayout.jsx) so
// navigating to it works. A test guards this both ways (no orphan entries, no
// missing pages).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { BREADCRUMB_MAP } from "./routeMeta.js";
import { PAGE_HEADERS, PAGE_TEXT } from "./pageHeaders.generated.js";

// Top-level section -> sidebar icon, so a result row shows the same glyph as the
// sidebar. Mirrors the icons in Sidebar.jsx CORE_NAV_ITEMS.
export const SECTION_ICONS = {
  Overview: "ti-eye",
  Tools: "ti-terminal-2",
  Dashboards: "ti-chart-pie",
  Monitoring: "ti-activity-heartbeat",
  Logs: "ti-file-smile",
  Schema: "ti-database",
  Alerts: "ti-bell",
  RBAC: "ti-lock",
  Backups: "ti-shield-check",
  Admin: "ti-adjustments-horizontal",
};

export const SEARCH_CATALOG = [
  // Overview
  {
    id: "overview/cluster",
    title: "Cluster Overview",
    section: "Overview",
    description: "Node health dashboard: status cards, disk, RAM, Keeper, readonly tables.",
    keywords: ["node overview", "cluster health", "status cards", "disk", "ram", "memory", "keeper", "zookeeper", "replicas", "readonly tables", "uptime", "landing page", "home"],
  },
  {
    id: "overview/summary",
    title: "Daily Summary",
    section: "Overview",
    description: "At-a-glance daily digest of cluster activity.",
    keywords: ["daily report", "summary", "digest", "overview stats", "daily activity"],
  },
  {
    id: "overview/queries",
    title: "Queries",
    section: "Overview",
    description: "Running and historical queries: current, analytics, and search.",
    keywords: ["running queries", "current queries", "query analytics", "kill query", "slow queries", "search queries", "query log", "active queries", "query history"],
  },
  {
    id: "overview/parts",
    title: "Tables & Parts",
    section: "Overview",
    description: "Table sizes, parts, partitions, rows, and compression.",
    keywords: ["tables", "parts", "partitions", "storage size", "rows", "compression", "table health", "disk usage", "part count"],
  },
  {
    id: "overview/operations",
    title: "Merges & Mutations",
    section: "Overview",
    description: "Background merges and mutations with progress.",
    keywords: ["merges", "mutations", "background operations", "merge queue", "mutation progress", "optimize", "alter"],
  },
  {
    id: "overview/queues",
    title: "Queues",
    section: "Overview",
    description: "Replication and distributed task queues, stuck tasks.",
    keywords: ["replication queue", "distributed queue", "task queue", "stuck tasks", "blocked queue", "queue backlog", "fetch queue"],
  },
  {
    id: "overview/ddl",
    title: "DDL & Readonly",
    section: "Overview",
    description: "Distributed DDL queue status and readonly table detection.",
    keywords: ["distributed ddl", "on-cluster ddl", "ddl queue", "ddl queue block", "blocked ddl", "stuck ddl", "on cluster queue", "zookeeper ddl", "readonly tables", "readonly replicas", "ddl worker"],
  },

  // Tools
  {
    id: "editor/query",
    title: "SQL Editor",
    section: "Tools",
    description: "Run SQL, compare queries, estimate cost, bookmark, and export.",
    keywords: ["sql editor", "run query", "execute sql", "query comparison", "compare queries", "cost estimate", "bookmarks", "export results", "ai assistance", "console", "worksheet"],
  },
  {
    id: "tools/profiler",
    title: "Query Profiler",
    section: "Tools",
    description: "Flame graphs and per-query profiling by query id.",
    keywords: ["profiler", "flame graph", "query profile", "explain", "execution plan", "query id", "profile events", "trace"],
  },
  {
    id: "tools/pipeline",
    title: "Processors Profile",
    section: "Tools",
    description: "Query pipeline processors and the execution DAG.",
    keywords: ["processors", "pipeline", "dag", "query pipeline", "operators", "execution graph", "processor profile"],
  },
  {
    id: "tools/metrics",
    title: "Query Metrics",
    section: "Tools",
    description: "Per-query performance metrics and statistics.",
    keywords: ["query metrics", "performance metrics", "query stats", "query id metrics", "timing", "resource usage"],
  },
  {
    id: "tools/schema-studio",
    title: "Schema Studio",
    section: "Tools",
    description: "Guided table designer that composes correct MergeTree DDL.",
    keywords: ["schema studio", "create table", "ddl builder", "mergetree", "table designer", "order by", "primary key", "partition by", "projections", "skip index", "generate ddl", "table wizard"],
  },
  {
    id: "tools/qurioz",
    title: "Qurioz AI",
    section: "Tools",
    description: "AI assistant that turns plain questions into ClickHouse SQL.",
    keywords: ["qurioz", "ai", "assistant", "natural language", "text to sql", "chat", "ask", "generate sql", "copilot", "llm"],
  },

  // Dashboards
  {
    id: "custom/builder",
    title: "Chart Builder",
    section: "Dashboards",
    description: "Build custom charts from your ClickHouse data.",
    keywords: ["chart builder", "create chart", "custom chart", "visualization", "build dashboard", "new chart", "graph builder"],
  },
  {
    id: "custom/dashboards",
    title: "My Dashboards",
    section: "Dashboards",
    description: "Your saved custom dashboards.",
    keywords: ["dashboards", "saved dashboards", "custom dashboards", "my dashboards", "boards"],
  },
  {
    id: "custom/charts",
    title: "All Charts",
    section: "Dashboards",
    description: "Library of all saved charts.",
    keywords: ["charts", "all charts", "chart library", "saved charts"],
  },

  // Monitoring
  {
    id: "monitoring/dashboards",
    title: "System Dashboards",
    section: "Monitoring",
    description: "Prebuilt CPU, memory, disk, network, merges, and replication dashboards.",
    keywords: ["monitoring", "system dashboards", "cpu", "memory", "disk", "io", "network", "merges", "replication", "metrics", "grafana", "resource monitoring"],
  },
  {
    id: "monitoring/playback",
    title: "Playback",
    section: "Monitoring",
    description: "Rewind cluster history like a DVR to investigate incidents.",
    keywords: ["playback", "dvr", "rewind", "history", "timeline", "replay", "incident investigation", "time travel"],
  },
  {
    id: "monitoring/allocator",
    title: "Memory Allocator",
    section: "Monitoring",
    description: "Memory allocation and jemalloc profiling.",
    keywords: ["memory allocator", "jemalloc", "allocation", "memory profiling", "arenas", "heap"],
  },

  // Logs
  {
    id: "logs/crash",
    title: "Crash Log",
    section: "Logs",
    description: "Server crashes with stack traces.",
    keywords: ["crash log", "crashes", "fatal errors", "stack trace", "segfault", "core dump"],
  },
  {
    id: "logs/error",
    title: "Error Log",
    section: "Logs",
    description: "Errors, exceptions, and warnings from the server.",
    keywords: ["error log", "errors", "exceptions", "warnings", "failures", "error messages"],
  },
  {
    id: "logs/text",
    title: "Text Log",
    section: "Logs",
    description: "Raw server text and trace logs, filterable in the browser.",
    keywords: ["text log", "server log", "system log", "trace log", "raw logs", "log viewer", "no ssh"],
  },
  {
    id: "logs/session",
    title: "Session Log",
    section: "Logs",
    description: "Login sessions, connections, and session activity.",
    keywords: ["session log", "login sessions", "connections", "session activity", "auth log", "who logged in"],
  },

  // Schema
  {
    id: "indexes/visualizer",
    title: "Schema Visualizer",
    section: "Schema",
    description: "Visual schema graph of tables, columns, and relationships.",
    keywords: ["schema visualizer", "erd", "schema graph", "table relationships", "columns", "diagram", "entity relationship", "schema map"],
  },
  {
    id: "indexes/secondary",
    title: "Data Skipping Indexes",
    section: "Schema",
    description: "Manage data-skipping (secondary) indexes.",
    keywords: ["data skipping index", "secondary index", "skip index", "tokenbf", "ngrambf", "minmax", "bloom filter", "set index", "index granularity"],
  },
  {
    id: "indexes/projections",
    title: "Projections",
    section: "Schema",
    description: "Create and manage table projections.",
    keywords: ["projections", "materialized projection", "aggregate projection", "normal projection", "projection ddl"],
  },
  {
    id: "indexes/create",
    title: "Index Management",
    section: "Schema",
    description: "Create, materialize, and drop indexes.",
    keywords: ["create index", "index management", "add index", "drop index", "materialize index", "alter table index"],
  },

  // Alerts
  {
    id: "alerting/rules",
    title: "Alert Rules",
    section: "Alerts",
    description: "SQL-condition alert rules with thresholds and schedules.",
    keywords: ["alert rules", "alerting", "thresholds", "sql condition", "notifications", "monitors", "watchdog", "alert schedule"],
  },


  // RBAC
  {
    id: "rbac/view",
    title: "View Grants",
    section: "RBAC",
    description: "Visual grant tree of who can access what.",
    keywords: ["view grants", "grant tree", "permissions", "access", "privileges", "who has access", "grants overview"],
  },
  {
    id: "rbac/users",
    title: "Users",
    section: "RBAC",
    description: "Create and manage ClickHouse database users.",
    keywords: ["users", "database users", "create user", "manage users", "ch users", "alter user", "drop user"],
  },
  {
    id: "rbac/roles",
    title: "Roles",
    section: "RBAC",
    description: "Create and manage database roles.",
    keywords: ["roles", "database roles", "create role", "grant role", "revoke role", "role management"],
  },
  {
    id: "rbac/profiles",
    title: "Settings Profiles",
    section: "RBAC",
    description: "Quotas, limits, and settings profiles.",
    keywords: ["settings profiles", "quotas", "limits", "profile settings", "resource limits", "readonly profile"],
  },

  // Backups
  {
    id: "backups/lifecycle",
    title: "Data Lifecycle",
    section: "Backups",
    description: "Backups, TTL, retention, and restore to S3-compatible storage.",
    keywords: ["backup", "data lifecycle", "ttl", "retention", "restore", "s3 backup", "scheduled backup", "snapshot"],
  },

  // Admin
  {
    id: "admin/users",
    title: "User Management",
    section: "Admin",
    description: "Manage CHOps application users and their roles.",
    keywords: ["app users", "user management", "chops users", "invite user", "app roles", "permissions", "superadmin", "editor", "readonly"],
  },
  {
    id: "admin/cluster",
    title: "Cluster Management",
    section: "Admin",
    description: "Add and manage cluster connections and nodes.",
    keywords: ["cluster management", "connections", "add cluster", "node", "credentials", "connection settings", "hosts", "endpoints"],
  },
  {
    id: "admin/profiles",
    title: "Storage Profiles",
    section: "Admin",
    description: "S3-compatible storage profiles for backups.",
    keywords: ["storage profiles", "s3", "backup storage", "endpoint", "bucket", "access key", "object storage"],
  },
  {
    id: "admin/app-backup",
    title: "App Data Backup",
    section: "Admin",
    description: "Back up and restore CHOps' own configuration database.",
    keywords: ["app data backup", "chops backup", "export config", "database backup", "settings backup", "restore config"],
  },
    {
    id: "admin/channels",
    title: "Channels",
    section: "Alerts",
    description: "Notification channels: email, Slack, Google Chat, Teams, PagerDuty.",
    keywords: ["alert channels", "notification channels", "email", "slack", "webhook", "pagerduty", "microsoft teams", "google chat", "notify", "integrations"],
  },
  {
    id: "admin/api-management",
    title: "AI API Keys",
    section: "Admin",
    description: "Manage AI provider API keys used by Qurioz and Schema Studio.",
    keywords: ["api keys", "ai keys", "gemini", "openai", "llm keys", "ai configuration", "provider keys", "api management"],
  },
];

// Fold in already-existing constants (breadcrumb labels + scraped headers).
// The curated `keywords` above carry intent and synonyms. On top of them we
// merge two constant sources that already exist in the codebase, so they stay
// in sync automatically:
//   1. BREADCRUMB_MAP  - section, page, and sub-tab labels per route.
//   2. PAGE_HEADERS     - constant in-page section headers scraped at build time.
// Token search (with IDF) down-weights the generic labels this adds, so the
// merge improves recall without drowning out the specific terms.

function breadcrumbTerms(id) {
  const out = [];
  for (const [key, crumbs] of Object.entries(BREADCRUMB_MAP)) {
    if (key === id || key.startsWith(id + "/")) out.push(...crumbs);
  }
  return out;
}

function mergeKeywords(entry) {
  const merged = [
    ...entry.keywords,
    ...breadcrumbTerms(entry.id),
    ...(PAGE_HEADERS[entry.id] || []),
  ];
  const seen = new Set();
  const keywords = [];
  for (const raw of merged) {
    const k = String(raw).trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      keywords.push(k);
    }
  }
  return { ...entry, keywords, text: PAGE_TEXT[entry.id] || [] };
}

// The array the search index is actually built from: curated keywords plus the
// merged breadcrumb labels and scraped headers, and a separate low-weight `text`
// field carrying constant static body text scraped from each page.
export const SEARCH_ENTRIES = SEARCH_CATALOG.map(mergeKeywords);
