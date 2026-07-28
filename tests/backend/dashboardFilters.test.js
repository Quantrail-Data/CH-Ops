// Contributors - Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited
// dashboardFilters.test.js - the dashboard.filters column and JSON handling

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE dashboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    columns INTEGER NOT NULL DEFAULT 2,
    filters TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE chart (
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
`);
const testDb = drizzle(sqlite, { schema });

// Every real export is stubbed, not just the ones this file uses. Bun's
// mock.module replaces the module for the whole test process, so whichever
// file's call happens to win must not leave another suite short an export -
// the same convention cluster.test.js documents for clusterUtils.
mock.module("../../src/backend/db/index.js", () => ({
  db: testDb,
  dashboards: schema.dashboards,
  charts: schema.charts,
  appUsers: schema.appUsers,
  apiKeys: schema.apiKeys,
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  appSettings: {},
}));

const ctrl = await import("../../src/backend/controllers/dashboards.js");

function res() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(d) {
      this.body = d;
      return this;
    },
  };
}

beforeEach(() => {
  sqlite.exec("DELETE FROM chart");
  sqlite.exec("DELETE FROM dashboard");
});

function makeDashboard(body = { name: "D" }) {
  const r = res();
  ctrl.createDashboard({ body }, r);
  return r;
}

describe("dashboard.filters round trip", () => {
  it("defaults to an empty object on create", () => {
    const r = makeDashboard();
    expect(r.statusCode).toBe(201);
    expect(r.body.filters).toEqual({});
  });

  it("persists presentation settings and returns them as an object", () => {
    const created = makeDashboard().body;
    const filters = {
      region: { label: "Region", order: 1, default: "eu-west" },
      env: { label: "Environment", order: 2, hidden: false },
    };

    const upd = res();
    ctrl.updateDashboard({ params: { id: String(created.id) }, body: { filters } }, upd);
    expect(upd.body.filters).toEqual(filters);

    const listed = res();
    ctrl.listDashboards({}, listed);
    expect(listed.body[0].filters).toEqual(filters);
    // An object, never the raw string.
    expect(typeof listed.body[0].filters).toBe("object");
  });

  it("leaves filters alone when the update does not mention them", () => {
    const created = makeDashboard().body;
    const filters = { region: { label: "Region" } };
    ctrl.updateDashboard({ params: { id: String(created.id) }, body: { filters } }, res());

    const upd = res();
    ctrl.updateDashboard({ params: { id: String(created.id) }, body: { name: "Renamed" } }, upd);
    expect(upd.body.name).toBe("Renamed");
    expect(upd.body.filters).toEqual(filters);
  });

  it("survives a double-encoded payload", () => {
    // A client that received a string from somewhere and sent it back.
    const created = makeDashboard().body;
    const upd = res();
    ctrl.updateDashboard(
      {
        params: { id: String(created.id) },
        body: { filters: JSON.stringify({ region: { label: "Region" } }) },
      },
      upd,
    );
    expect(upd.body.filters).toEqual({ region: { label: "Region" } });
  });

  it("reads a NULL filters column as an empty object", () => {
    const created = makeDashboard().body;
    sqlite.exec(`UPDATE dashboard SET filters = NULL WHERE id = ${created.id}`);

    const listed = res();
    ctrl.listDashboards({}, listed);
    expect(listed.body[0].filters).toEqual({});
  });

  it("reads malformed JSON as an empty object rather than throwing", () => {
    const created = makeDashboard().body;
    sqlite.exec(`UPDATE dashboard SET filters = 'not json' WHERE id = ${created.id}`);

    const listed = res();
    expect(() => ctrl.listDashboards({}, listed)).not.toThrow();
    expect(listed.body[0].filters).toEqual({});
  });

  it("behaves exactly as before for a dashboard that has no filters", () => {
    const created = makeDashboard({ name: "Legacy" }).body;
    expect(created.name).toBe("Legacy");
    expect(created.columns).toBe(2);
    expect(created.filters).toEqual({});
  });
});

describe("chart.config shape is consistent across endpoints", () => {
  const chartBody = (config) => ({
    name: "C",
    sqlQuery: "SELECT 1",
    chartType: "bar",
    chartSubtype: "grouped_bar",
    config,
  });

  it("createChart returns config as an object, like every other route", () => {
    // This was the live inconsistency: POST returned a string, GET an object.
    const r = res();
    ctrl.createChart({ body: chartBody({ xLabel: "x" }) }, r);
    expect(r.statusCode).toBe(201);
    expect(typeof r.body.config).toBe("object");
    expect(r.body.config).toEqual({ xLabel: "x" });
  });

  it("agrees across create, list, update and dashboard-charts", () => {
    const created = res();
    ctrl.createChart({ body: chartBody({ xLabel: "x" }) }, created);

    const listed = res();
    ctrl.listCharts({}, listed);

    const updated = res();
    ctrl.updateChart(
      { params: { id: String(created.body.id) }, body: { config: { xLabel: "y" } } },
      updated,
    );

    expect(typeof created.body.config).toBe("object");
    expect(typeof listed.body[0].config).toBe("object");
    expect(typeof updated.body.config).toBe("object");
    expect(updated.body.config).toEqual({ xLabel: "y" });
  });

  it("stores paramDefaults for a chart's required parameters", () => {
    // Chart-level defaults live in config, so the chart table needs no column.
    const r = res();
    ctrl.createChart(
      { body: chartBody({ paramDefaults: { region: "eu-west" } }) },
      r,
    );
    expect(r.body.config.paramDefaults).toEqual({ region: "eu-west" });
  });

  it("defaults config to an empty object when omitted", () => {
    const r = res();
    ctrl.createChart({ body: chartBody(undefined) }, r);
    expect(r.body.config).toEqual({});
  });
});

describe("filters migration", () => {
  // Mirrors migrate.js: a database created before the column exists, then the
  // guarded ALTER applied to it.
  function legacyDb() {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE dashboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      columns INTEGER NOT NULL DEFAULT 2,
      created_at TEXT,
      updated_at TEXT
    );`);
    db.exec(`INSERT INTO dashboard (name, columns) VALUES ('Existing', 3)`);
    return db;
  }

  const ALTER = "ALTER TABLE dashboard ADD COLUMN filters TEXT DEFAULT '{}'";

  it("adds the column to a database created before it", () => {
    const db = legacyDb();
    db.exec(ALTER);
    const cols = db.query("PRAGMA table_info(dashboard)").all();
    expect(cols.some((c) => c.name === "filters")).toBe(true);
  });

  it("backfills existing rows with '{}' rather than NULL", () => {
    const db = legacyDb();
    db.exec(ALTER);
    const row = db.query("SELECT * FROM dashboard").get();
    expect(row.filters).toBe("{}");
    // And the row is otherwise untouched.
    expect(row.name).toBe("Existing");
    expect(row.columns).toBe(3);
  });

  it("is safe to run twice, as the guarded loop assumes", () => {
    const db = legacyDb();
    db.exec(ALTER);
    // migrate.js wraps each statement in try/catch; the second call throws and
    // is swallowed. What matters is that nothing is lost.
    expect(() => db.exec(ALTER)).toThrow();
    const row = db.query("SELECT * FROM dashboard").get();
    expect(row.filters).toBe("{}");
  });

  it("is present in the migrations list in migrate.js", async () => {
    const src = await Bun.file(
      new URL("../../src/backend/db/migrate.js", import.meta.url),
    ).text();
    expect(src).toContain(
      `"ALTER TABLE dashboard ADD COLUMN filters TEXT DEFAULT '{}'"`,
    );
    // And in CREATE TABLE, so a fresh install matches schema.js.
    expect(src).toContain("filters TEXT DEFAULT '{}',");
  });
});
