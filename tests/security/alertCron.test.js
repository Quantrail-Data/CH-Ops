// alertCron.test.js - The cron check and the delete of alert rules, through the real API.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "./harness.js";

let app;

beforeAll(async () => {
  app = await startServer();
}, 30000);

afterAll(async () => {
  await app?.stop();
});

async function createRuleWithSchedule(schedule) {
  return app.api("admin", "POST", "/api/alerts/rules", {
    name: `Rule for ${schedule}`,
    sql: "SELECT 1",
    schedule,
    enabled: false,
  });
}

describe("cron check of alert rules", () => {
  it("refuses day of week 7, which never runs", async () => {
    const result = await createRuleWithSchedule("0 9 * * 7");
    expect(result.status).toBe(400);
    expect(result.json.error).toBe(
      "CRON ERROR : day-of-week must be a number from 0 to 6, or a comma list of numbers: 7",
    );
  });

  it("refuses a range, which the scheduler does not support", async () => {
    const result = await createRuleWithSchedule("0 9 * * 1-5");
    expect(result.status).toBe(400);
  });

  it("accepts a comma list of days", async () => {
    const result = await createRuleWithSchedule("0 9 * * 0,6");
    expect(result.status).toBe(201);
  });
});

describe("delete of an alert rule", () => {
  it("also deletes its history and its node states", async () => {
    const created = await createRuleWithSchedule("*/5 * * * *");
    const ruleId = created.json.id;
    const database = app.openDatabase();
    database.exec(`INSERT INTO alert_event (alert_rule_id, status) VALUES (${ruleId}, 'firing')`);
    database.exec(
      `INSERT INTO alert_rule_node_state (alert_rule_id, node_name, firing) VALUES (${ruleId}, 'node1', 1)`,
    );

    const deleted = await app.api("admin", "DELETE", `/api/alerts/rules/${ruleId}`);

    expect(deleted.status).toBe(200);
    const leftEvents = database
      .query("SELECT count(*) AS total FROM alert_event WHERE alert_rule_id = ?")
      .get(ruleId);
    const leftStates = database
      .query("SELECT count(*) AS total FROM alert_rule_node_state WHERE alert_rule_id = ?")
      .get(ruleId);
    database.close();
    expect(leftEvents.total).toBe(0);
    expect(leftStates.total).toBe(0);
  });
});
