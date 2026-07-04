// Copyright (C) 2026 Quantrail™ Data Private Limited
// Author: Kathir Moorthy
// Unit tests for the Session Log feature: verifies it queries system.session_log
// (event-style aggregation), probes for the table, builds the expected Overview
// panels and Search filters, and is wired into routing and the sidebar.

import { describe, it, expect } from "vitest";
import fs from "fs";

const read = (f) => fs.readFileSync(f, "utf8");
const SRC = "src/frontend/components/logs/SessionLog.jsx";
const code = read(SRC);

describe("SessionLog: table + probe", () => {
  it("queries system.session_log", () => {
    expect(code).toContain("FROM system.session_log");
  });
  it("does not query the other logs' tables", () => {
    expect(code).not.toContain("system.error_log");
    expect(code).not.toContain("system.crash_log");
    expect(code).not.toContain("system.text_log");
  });
  it("probes for the table (it may be disabled)", () => {
    expect(code).toContain("FROM system.columns");
    expect(code).toContain("table = 'session_log'");
    expect(code).toMatch(/exists/);
  });
  it("aggregates as an event table (count/countIf, not sum(value))", () => {
    expect(code).toContain("count()");
    expect(code).not.toContain("sum(value)");
  });
});

describe("SessionLog: Overview panels", () => {
  it("summarises outcomes by type", () => {
    expect(code).toContain("countIf(type = 'LoginSuccess')");
    expect(code).toContain("countIf(type = 'LoginFailure')");
    expect(code).toContain("countIf(type = 'Logout')");
    expect(code).toContain("uniqExact(user)");
    expect(code).toContain("max(event_time)");
  });
  it("breaks down by type / user / interface / auth type", () => {
    expect(code).toContain("GROUP BY type");
    expect(code).toContain("GROUP BY user");
    expect(code).toContain("GROUP BY interface");
    expect(code).toContain("GROUP BY auth_type");
  });
  it("builds login activity over time bucketed by type", () => {
    expect(code).toContain("toStartOfInterval(event_time");
    expect(code).toContain("GROUP BY t, type");
    expect(code).toContain("function buildRateSeries");
  });
  it("lists top failure reasons with most-recent user/client", () => {
    expect(code).toContain("type = 'LoginFailure'");
    expect(code).toContain("failure_reason != ''");
    expect(code).toContain("argMax(user, event_time)");
    expect(code).toContain("argMax(toString(client_address), event_time)");
  });
  it("renders via ChartCard (so the toolbox band applies) and a RateChart", () => {
    expect(code).toContain("import ChartCard");
    expect(code).toContain("<ChartCard");
    expect(code).toContain("function RateChart");
  });
});

describe("SessionLog: Overview + Search tabs", () => {
  it("has a metrics-dashboard overview tab", () => {
    expect(code).toMatch(/SessionLogOverview/);
    expect(code).toContain("overview");
  });
  it("routes between overview and search under /logs/session/", () => {
    expect(code).toContain("/logs/session/");
    expect(code).toContain("SessionLogSearch");
  });
  it("uses variant=single for the search results table", () => {
    expect(code).toContain('variant="single"');
  });
});

describe("SessionLog: Search filters", () => {
  it("filters by event type, user, and failure reason", () => {
    expect(code).toContain("type IN (");
    expect(code).toContain("user LIKE '%");
    expect(code).toContain("failure_reason LIKE '%");
  });
  it("selects the auditing columns", () => {
    expect(code).toContain("SELECT event_time, type, user, auth_type, interface");
    expect(code).toContain("toString(client_address) AS client_address");
    expect(code).toContain("failure_reason");
  });
});

describe("SessionLog: wiring", () => {
  it("is lazily imported and routed in MainLayout", () => {
    const ml = read("src/frontend/components/layout/MainLayout.jsx");
    expect(ml).toContain('import("../logs/SessionLog.jsx")');
    expect(ml).toContain('["logs/session/:tab?", SessionLog]');
    // breadcrumbs now live in the shared routeMeta module
    const rm = read("src/frontend/utils/routeMeta.js");
    expect(rm).toContain('"logs/session": ["Logs", "Session Log"]');
  });
  it("has a sidebar entry", () => {
    const sb = read("src/frontend/components/layout/Sidebar.jsx");
    expect(sb).toContain('{ id: "logs/session", label: "Session Log" }');
  });
});

describe("SessionLog: house style", () => {
  it("uses no em/en dashes", () => {
    expect(code.includes("\u2014") || code.includes("\u2013")).toBe(false);
  });
});
