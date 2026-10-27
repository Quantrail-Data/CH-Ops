// alertTemplates.test.js - Alert templates through the real API.
// Checks who can use the template routes, the rules a new cluster gets, the rule test,
// how a change to a template rule is recorded, what a cluster delete removes, and the server start step.
// author -> Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, NODE_NAME } from "./harness.js";


function answerQuery({ sql }) {
  if (sql.includes("cpu_busy_percent")) {
    return { body: '{"cpu_busy_percent":95.5,"no_data_check":0}\n' };
  }

  if (sql.includes("AS counted")) return { body: '{"counted":"7"}\n' };
  if (sql.includes("AS label")) return { body: '{"label":"abc"}\n' };
  if (sql.includes("disk_free_percent")) {
    return {
      status: 500,
      body: "Code: 395. DB::Exception: Cannot compute disk_free_percent: no recent rows.",
    };
  }
  return null;
}

let app;

beforeAll(async () => {
  app = await startServer({ answerQuery });
}, 30000);

afterAll(async () => {
  await app?.stop();
});

async function templateRules() {
  const result = await app.api("admin", "GET", "/api/alerts/rules");
  return result.json.filter((rule) => rule.templateId);
}

describe("who can use the template routes", () => {
  for (const role of ["readonly", "editor"]) {
    it(`refuses ${role}`, async () => {
      const templates = await app.api(role, "GET", "/api/alerts/templates");
      const test = await app.api(role, "POST", "/api/alerts/rules/test", {
        sql: "SELECT 1",
        cluster_id: app.clusterId,
      });
      expect([templates.status, test.status]).toEqual([403, 403]);
    });
  }

  it("gives an admin the 31 templates", async () => {
    const result = await app.api("admin", "GET", "/api/alerts/templates");
    expect(result.status).toBe(200);
    expect(result.json.length).toBe(31);
  });
});

describe("server start", () => {
  it("records that the one-time step for existing clusters ran", () => {
    const database = app.openDatabase();
    const setting = database
      .query("SELECT value FROM app_setting WHERE key = ?")
      .get("alerts.templates_added_to_existing_clusters");
    database.close();
    expect(setting?.value).toBe("true");
  });
});

describe("rules for a new cluster", () => {
  it("adds every template to the new cluster as a rule that is off", async () => {
    const rules = await templateRules();
    expect(rules.length).toBe(31);
    for (const rule of rules) {
      expect(rule.cluster_id).toBe(app.clusterId);
      expect(rule.enabled).toBe(false);
      expect(rule.templateEdited).toBe(false);
    }
  });
});

describe("rule test", () => {
  it("runs the rule read-only on each node and says it would fire", async () => {
    const cpuRule = (await templateRules()).find(
      (rule) => rule.templateId === "cpu-busy",
    );
    const result = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: cpuRule.sql,
      operator: cpuRule.operator,
      threshold: cpuRule.threshold,
      cluster_id: app.clusterId,
    });
    expect(result.status).toBe(200);
    expect(result.json.results).toEqual([
      { node: NODE_NAME, value: 95.5, wouldFire: true, error: null },
    ]);
    const cpuQuery = app.clickHouse.requests.find((query) =>
      query.sql.includes("cpu_busy_percent"),
    );
    expect(cpuQuery.readonly).toBe("1");
  });

  it("shows the ClickHouse error when the data is missing", async () => {
    const diskRule = (await templateRules()).find(
      (rule) => rule.templateId === "disk-space-low",
    );
    const result = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: diskRule.sql,
      operator: diskRule.operator,
      threshold: diskRule.threshold,
      cluster_id: app.clusterId,
    });
    expect(result.status).toBe(200);
    expect(result.json.results[0].wouldFire).toBe(false);
    expect(result.json.results[0].error).toContain("Cannot compute");
  });

  it("reads a number that ClickHouse sends as text", async () => {
    const result = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: "SELECT count() AS counted FROM system.parts",
      operator: "gt",
      threshold: 5,
      cluster_id: app.clusterId,
    });
    expect(result.json.results[0]).toMatchObject({ value: 7, wouldFire: true });
  });

  it("gives an error when the first column is not a number", async () => {
    const result = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: "SELECT 'abc' AS label",
      cluster_id: app.clusterId,
    });
    expect(result.json.results[0].wouldFire).toBe(false);
    expect(result.json.results[0].error).toContain("not a number");
  });

  it("follows the no-rows setting of the rule", async () => {
    const noRowsSql = "SELECT 1 AS value WHERE 0";
    const defaultResult = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: noRowsSql,
      cluster_id: app.clusterId,
    });
    const breachResult = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: noRowsSql,
      cluster_id: app.clusterId,
      noRowsMeansBreach: true,
    });
    expect(defaultResult.json.results[0]).toMatchObject({ value: null, wouldFire: false });
    expect(breachResult.json.results[0]).toMatchObject({ value: null, wouldFire: true });
  });

  it("refuses a test without SQL or without nodes", async () => {
    const noSql = await app.api("admin", "POST", "/api/alerts/rules/test", {
      cluster_id: app.clusterId,
    });
    const noNodes = await app.api("admin", "POST", "/api/alerts/rules/test", {
      sql: "SELECT 1",
      cluster_id: app.clusterId,
      nodes: ["host-that-does-not-exist"],
    });
    expect([noSql.status, noNodes.status]).toEqual([400, 400]);
  });
});

describe("changes to a template rule", () => {
  // The same body that the edit form sends when nothing is changed.
  function formBody(rule) {
    return {
      name: rule.name,
      description: rule.description || "",
      sql: rule.sql,
      threshold: rule.threshold,
      operator: rule.operator,
      severity: rule.severity,
      schedule: rule.schedule,
      enabled: rule.enabled,
      channel_ids: [],
      nodes: null,
      cluster_id: rule.cluster_id,
      notifyIntervalMinutes: rule.notifyIntervalMinutes,
      breachRunsRequired: rule.breachRunsRequired,
      noRowsMeansBreach: rule.noRowsMeansBreach,
    };
  }

  async function ruleWithTemplate(templateId) {
    return (await templateRules()).find((rule) => rule.templateId === templateId);
  }

  it("does not count turning the rule on, or a save with no change", async () => {
    const rule = await ruleWithTemplate("cpu-iowait");
    await app.api("admin", "PUT", `/api/alerts/rules/${rule.id}`, {
      enabled: true,
    });
    await app.api(
      "admin",
      "PUT",
      `/api/alerts/rules/${rule.id}`,
      formBody({ ...rule, enabled: true }),
    );
    const after = await ruleWithTemplate("cpu-iowait");
    expect(after.enabled).toBe(true);
    expect(after.templateEdited).toBe(false);
  });

  it("counts a new channel", async () => {
    const channel = await app.api("admin", "POST", "/api/alerts/channels", {
      name: "template-test-channel",
      type: "email",
      config: { smtp_host: "smtp.example.com", to: "ops@example.com", smtp_pass: "pass" },
    });
    const rule = await ruleWithTemplate("memory-clickhouse");
    await app.api("admin", "PUT", `/api/alerts/rules/${rule.id}`, {
      ...formBody(rule),
      channel_ids: [channel.json.id],
    });
    const after = await ruleWithTemplate("memory-clickhouse");
    expect(after.channels.map((item) => item.id)).toEqual([channel.json.id]);
    expect(after.templateEdited).toBe(true);
  });

  it("counts a change of target nodes", async () => {
    const rule = await ruleWithTemplate("host-memory-low");
    await app.api("admin", "PUT", `/api/alerts/rules/${rule.id}`, {
      ...formBody(rule),
      nodes: ["127.0.0.1"],
    });
    const after = await ruleWithTemplate("host-memory-low");
    expect(after.templateEdited).toBe(true);
  });

  it("keeps the template id of a rule made from the picker", async () => {
    const template = (await app.api("admin", "GET", "/api/alerts/templates")).json.find(
      (item) => item.id === "failed-inserts",
    );
    const created = await app.api("admin", "POST", "/api/alerts/rules", {
      name: "Failed inserts, from the picker",
      sql: template.sql,
      threshold: template.threshold,
      operator: template.operator,
      severity: template.severity,
      schedule: template.schedule,
      cluster_id: app.clusterId,
      templateId: template.id,
    });
    expect(created.status).toBe(201);
    expect(created.json.templateId).toBe("failed-inserts");
    expect(created.json.templateEdited).toBe(true);
  });

  it("does not keep a template id that is not in the catalog", async () => {
    const created = await app.api("admin", "POST", "/api/alerts/rules", {
      name: "Unknown template",
      sql: "SELECT 1",
      cluster_id: app.clusterId,
      templateId: "not-a-template",
    });
    expect(created.status).toBe(201);
    expect(created.json.templateId).toBe(null);
    expect(created.json.templateEdited).toBe(false);
  });

  it("counts a new threshold", async () => {
    const rule = await ruleWithTemplate("cpu-busy");
    await app.api("admin", "PUT", `/api/alerts/rules/${rule.id}`, {
      ...formBody(rule),
      threshold: 70,
    });
    const after = await ruleWithTemplate("cpu-busy");
    expect(after.threshold).toBe(70);
    expect(after.templateEdited).toBe(true);
  });
});


describe("cluster delete", () => {
  it("deletes the unchanged template rules and keeps the changed one", async () => {
    const result = await app.api(
      "superadmin",
      "DELETE",
      `/api/cluster/${app.clusterId}`,
    );
    expect(result.status).toBe(200);
    const remaining = (await templateRules())
      .map((rule) => rule.templateId)
      .sort();
    expect(remaining).toEqual([
      "cpu-busy",
      "failed-inserts",
      "host-memory-low",
      "memory-clickhouse",
    ]);
  });
});
