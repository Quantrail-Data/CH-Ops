// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Custom dashboards and charts: CRUD over the dashboard and chart tables.

import { eq, desc } from "drizzle-orm";
import { db, dashboards, charts } from "../db/index.js";

// JSON column handling
//
// Two columns hold JSON as TEXT: chart.config and dashboard.filters. Both are
// stored as a string and returned to the client as an object.
//
// Every exit point has to go through these helpers, including the rows handed
// back by .returning(). The previous code parsed config on read but not in
// createChart, so POST /charts returned config as a string while GET returned
// an object - the same field with two shapes depending on which endpoint you
// asked. That is the failure mode these helpers exist to prevent, so resist
// adding a new response path that does its own JSON.parse.

function readJson(raw, fallback = {}) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    // A stored "\"{}\"" (double-encoded at some point) parses to a string, not
    // an object. Treat anything that is not a plain object as absent rather
    // than handing the client a string it will try to index into.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson(value) {
  // Reject an already-serialized payload. A client that received a string from
  // some other endpoint and sent it straight back would otherwise produce
  // double-encoded JSON, which parses to a string and fails silently on the
  // next read.
  if (typeof value === "string") return JSON.stringify(readJson(value));
  if (value === null || value === undefined) return "{}";
  return JSON.stringify(value);
}

function outDashboard(row) {
  if (!row) return row;
  return { ...row, filters: readJson(row.filters) };
}

function outChart(row) {
  if (!row) return row;
  return { ...row, config: readJson(row.config) };
}

// Dashboards

export function listDashboards(req, res) {
  const rows = db
    .select()
    .from(dashboards)
    .orderBy(desc(dashboards.createdAt))
    .all();
  res.json(rows.map(outDashboard));
}

export function createDashboard(req, res) {
  const { name, columns, filters } = req.body;
  try {
    if (!name) return res.status(400).json({ error: "Name is required" });
    const row = db
      .insert(dashboards)
      .values({
        name,
        columns: columns || 2,
        filters: writeJson(filters),
      })
      .returning()
      .get();

    res.status(201).json(outDashboard(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export function updateDashboard(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.columns !== undefined) updates.columns = req.body.columns;
    // Without this line the column is silently dropped: the request succeeds
    // and the setting never persists.
    if (req.body.filters !== undefined) {
      updates.filters = writeJson(req.body.filters);
    }
    db.update(dashboards).set(updates).where(eq(dashboards.id, id)).run();
    res.json(
      outDashboard(
        db.select().from(dashboards).where(eq(dashboards.id, id)).get(),
      ),
    );
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export function deleteDashboard(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    db.update(charts)
      .set({ dashboardId: null })
      .where(eq(charts.dashboardId, id))
      .run();
    db.delete(dashboards).where(eq(dashboards.id, id)).run();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export function getDashboardCharts(req, res) {
  const id = parseInt(req.params.id, 10);
  const rows = db.select().from(charts).where(eq(charts.dashboardId, id)).all();
  res.json(rows.map(outChart));
}

// Charts

export function listCharts(req, res) {
  const rows = db.select().from(charts).orderBy(desc(charts.createdAt)).all();
  res.json(rows.map(outChart));
}

export function createChart(req, res) {
  const {
    name,
    dashboardId,
    gridRow,
    gridCol,
    sqlQuery,
    chartType,
    chartSubtype,
    config,
  } = req.body;
  try {
    if (!name || !sqlQuery || !chartType || !chartSubtype)
      return res.status(400).json({ error: "Missing required fields" });
    const row = db
      .insert(charts)
      .values({
        name,
        dashboardId: dashboardId || null,
        gridRow: gridRow || 0,
        gridCol: gridCol || 0,
        sqlQuery,
        chartType,
        chartSubtype,
        config: writeJson(config),
      })
      .returning()
      .get();
    // Parsed on the way out, like every other chart response.
    res.status(201).json(outChart(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export function updateChart(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = {};
    for (const k of [
      "name",
      "dashboardId",
      "gridRow",
      "gridCol",
      "sqlQuery",
      "chartType",
      "chartSubtype",
    ]) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (req.body.config !== undefined) updates.config = writeJson(req.body.config);
    db.update(charts).set(updates).where(eq(charts.id, id)).run();
    res.json(outChart(db.select().from(charts).where(eq(charts.id, id)).get()));
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export function deleteChart(req, res) {
  try {
    db.delete(charts)
      .where(eq(charts.id, parseInt(req.params.id, 10)))
      .run();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
