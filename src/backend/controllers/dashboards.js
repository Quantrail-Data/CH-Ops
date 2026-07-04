// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Aggregates real-time system metrics, cluster health, and usage analytics to feed the frontend dashboard.

import { eq, desc } from "drizzle-orm";
import { db, dashboards, charts } from "../db/index.js";

// Dashboards

export function listDashboards(req, res) {
  const rows = db
    .select()
    .from(dashboards)
    .orderBy(desc(dashboards.createdAt))
    .all();
  res.json(rows);
}

export function createDashboard(req, res) {
  const { name, columns } = req.body;
  try {
    if (!name) return res.status(400).json({ error: "Name is required" });
    const row = db
      .insert(dashboards)
      .values({ name, columns: columns || 2 })
      .returning()
      .get();

    res.status(201).json(row);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function updateDashboard(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.columns !== undefined) updates.columns = req.body.columns;
    db.update(dashboards).set(updates).where(eq(dashboards.id, id)).run();
    res.json(db.select().from(dashboards).where(eq(dashboards.id, id)).get());
  } catch (error) {
    res.status(500).json(error.message);
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
    res.status(500).json(error.message);
  }
}

export function getDashboardCharts(req, res) {
  const id = parseInt(req.params.id, 10);
  const rows = db.select().from(charts).where(eq(charts.dashboardId, id)).all();
  rows.forEach((r) => {
    try {
      r.config = JSON.parse(r.config);
    } catch {
      r.config = {};
    }
  });
  res.json(rows);
}

// Charts

export function listCharts(req, res) {
  const rows = db.select().from(charts).orderBy(desc(charts.createdAt)).all();
  rows.forEach((r) => {
    try {
      r.config = JSON.parse(r.config);
    } catch {
      r.config = {};
    }
  });
  res.json(rows);
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
        config: JSON.stringify(config || {}),
      })
      .returning()
      .get();
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json(error.message);
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
    if (req.body.config !== undefined)
      updates.config = JSON.stringify(req.body.config);
    db.update(charts).set(updates).where(eq(charts.id, id)).run();
    const row = db.select().from(charts).where(eq(charts.id, id)).get();
    try {
      row.config = JSON.parse(row.config);
    } catch {
      row.config = {};
    }
    res.json(row);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function deleteChart(req, res) {
  try {
    db.delete(charts)
      .where(eq(charts.id, parseInt(req.params.id, 10)))
      .run();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}
