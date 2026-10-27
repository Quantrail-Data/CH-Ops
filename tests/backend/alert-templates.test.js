// alert-templates.test.js - The template catalog, and the rules it adds to and removes from clusters.
// Uses an in-memory database, so no server or ClickHouse is needed.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE alert_rule (
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
    last_notified_at TEXT,
    last_state TEXT,
    created_at TEXT,
    updated_at TEXT,
    notify_interval_minutes INTEGER NOT NULL DEFAULT 0,
    last_breach_notified_at TEXT,
    breach_runs_required INTEGER NOT NULL DEFAULT 1,
    breach_run_count INTEGER NOT NULL DEFAULT 0,
    no_rows_means_breach INTEGER NOT NULL DEFAULT 0,
    template_id TEXT,
    template_edited INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE alert_rule_channel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    alert_channel_id INTEGER NOT NULL
  );
  CREATE TABLE alert_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_rule_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    prev_status TEXT,
    value REAL,
    error TEXT,
    created_at TEXT
  );
  CREATE TABLE app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT,
    updated_at TEXT
  );
`);
const db = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db,
  alertRules: schema.alertRules,
  alertRuleChannels: schema.alertRuleChannels,
  appSettings: schema.appSettings,
}));

const {
  ALERT_TEMPLATES,
  createTemplateRulesForCluster,
  removeTemplateRulesForCluster,
  createTemplateRulesForExistingClusters,
} = await import("../../src/backend/services/alertTemplates.js");

function rulesOfCluster(clusterId) {
  return sqlite
    .query("SELECT * FROM alert_rule WHERE cluster_id = ? ORDER BY id")
    .all(clusterId);
}

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM alert_rule; DELETE FROM alert_rule_channel; DELETE FROM alert_event; DELETE FROM app_setting;",
  );
});

describe("template catalog", () => {
  it("has 31 templates with unique ids", () => {
    const ids = ALERT_TEMPLATES.map((template) => template.id);
    expect(ids.length).toBe(31);
    expect(new Set(ids).size).toBe(31);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every template the fields that a rule needs", () => {
    for (const template of ALERT_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.category.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(["gt", "lt"]).toContain(template.operator);
      expect(Number.isFinite(template.threshold)).toBe(true);
      expect(["info", "warning", "critical"]).toContain(template.severity);
      expect(template.schedule.trim().split(/\s+/).length).toBe(5);
    }
  });

  it("gives every template a unit that matches its value column", () => {
    const countWords = ["errors", "parts", "tasks", "inserts", "queries", "connections", "tables", "fetches", "files"];
    for (const template of ALERT_TEMPLATES) {
      const valueColumn = template.sql.match(/AS (\w+),\n/)[1];
      if (valueColumn.endsWith("_percent")) {
        expect([template.id, template.unit]).toEqual([template.id, "%"]);
      } else if (valueColumn.endsWith("_seconds")) {
        expect([template.id, template.unit]).toEqual([template.id, "seconds"]);
      } else {
        expect(countWords).toContain(template.unit);
      }
    }
  });

  it("gives every template one SELECT that fails clearly when data is missing", () => {
    for (const template of ALERT_TEMPLATES) {
      expect(template.sql.startsWith("SELECT")).toBe(true);
      expect(template.sql).not.toContain(";");
      expect(template.sql).toContain("throwIf(");
      expect(template.sql).toContain("AS no_data_check");
      expect(template.sql).toContain("Cannot compute");
    }
  });
});

describe("createTemplateRulesForCluster", () => {
  it("adds every template as a rule that is off", () => {
    const createdCount = createTemplateRulesForCluster("cluster_a");
    const rules = rulesOfCluster("cluster_a");
    expect(createdCount).toBe(31);
    expect(rules.length).toBe(31);
    for (const rule of rules) {
      expect(rule.enabled).toBe(0);
      expect(rule.template_edited).toBe(0);
    }
    const cpuRule = rules.find((rule) => rule.template_id === "cpu-busy");
    const cpuTemplate = ALERT_TEMPLATES.find((item) => item.id === "cpu-busy");
    expect(cpuRule.sql).toBe(cpuTemplate.sql);
    expect(cpuRule.threshold).toBe(cpuTemplate.threshold);
    expect(cpuRule.description).toContain("Tuning:");
  });

  it("does not add a template two times to the same cluster", () => {
    createTemplateRulesForCluster("cluster_a");
    const secondCount = createTemplateRulesForCluster("cluster_a");
    expect(secondCount).toBe(0);
    expect(rulesOfCluster("cluster_a").length).toBe(31);
  });

  it("adds a template again after its rule was deleted", () => {
    createTemplateRulesForCluster("cluster_a");
    sqlite.exec("DELETE FROM alert_rule WHERE template_id = 'cpu-busy'");
    expect(createTemplateRulesForCluster("cluster_a")).toBe(1);
  });
});

describe("removeTemplateRulesForCluster", () => {
  it("deletes the unchanged template rules and keeps the changed ones", () => {
    createTemplateRulesForCluster("cluster_a");
    createTemplateRulesForCluster("cluster_b");
    sqlite.exec(
      "UPDATE alert_rule SET template_edited = 1, threshold = 70 WHERE cluster_id = 'cluster_a' AND template_id = 'cpu-busy'",
    );
    sqlite.exec(
      "INSERT INTO alert_rule (name, sql, cluster_id) VALUES ('hand written', 'SELECT 1', 'cluster_a')",
    );
    const unchangedRule = rulesOfCluster("cluster_a").find(
      (rule) => rule.template_id === "disk-space-low",
    );
    sqlite.exec(
      `INSERT INTO alert_rule_channel (alert_rule_id, alert_channel_id) VALUES (${unchangedRule.id}, 1)`,
    );
    sqlite.exec(
      `INSERT INTO alert_event (alert_rule_id, status) VALUES (${unchangedRule.id}, 'ok')`,
    );

    const removedCount = removeTemplateRulesForCluster("cluster_a");

    const remaining = rulesOfCluster("cluster_a").map(
      (rule) => rule.template_id || rule.name,
    );
    expect(removedCount).toBe(30);
    expect(remaining).toEqual(["cpu-busy", "hand written"]);
    expect(rulesOfCluster("cluster_b").length).toBe(31);
    const leftLinks = sqlite
      .query("SELECT count(*) AS total FROM alert_rule_channel")
      .get();
    const leftEvents = sqlite
      .query("SELECT count(*) AS total FROM alert_event")
      .get();
    expect(leftLinks.total).toBe(0);
    expect(leftEvents.total).toBe(0);
  });
});

describe("createTemplateRulesForExistingClusters", () => {
  it("adds the rules to every cluster one time only", () => {
    const clusters = [{ id: "cluster_a" }, { id: "cluster_b" }];
    expect(createTemplateRulesForExistingClusters(clusters)).toBe(62);

    // The admin deletes all template rules. A restart must not add them again.
    sqlite.exec("DELETE FROM alert_rule");
    expect(createTemplateRulesForExistingClusters(clusters)).toBe(0);
    expect(rulesOfCluster("cluster_a").length).toBe(0);
  });

  it("only marks the step as done when there is no cluster yet", () => {
    expect(createTemplateRulesForExistingClusters([])).toBe(0);
    expect(createTemplateRulesForExistingClusters([{ id: "cluster_a" }])).toBe(0);
  });
});
