// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Key-value configurations store enforcing superadmin restrictions on sensitive keys containing encrypted credentials.


import { eq } from "drizzle-orm";
import { db, appSettings } from "../db/index.js";


const USER_WRITABLE = new Set([
  "query_bookmarks",
]);

const ADMIN_WRITABLE = new Set([
  "backup_profiles",
  "clusters",
  "cluster.nodes",
  "clusters.storage",
  "app_backup_config",
  "k8s.enabled",
  "backup.exclude_k8s_credentials",
]);

function isAdminRole(req) {
  const role = req.user?.role;
  return role === "superadmin" || role === "admin";
}

function requireWriteAccess(req, res, key) {
  const admin = isAdminRole(req);
  if (USER_WRITABLE.has(key)) return false;
  if (admin && ADMIN_WRITABLE.has(key)) return false;
  res
    .status(403)
    .json({ error: "Not allowed to write this setting." });
  return true;
}

function requireAdminForKey(req, res, key) {
  if (ADMIN_WRITABLE.has(key)) {
    if (!isAdminRole(req)) {
      res
        .status(403)
        .json({ error: "Admin access required for this setting." });
      return true;
    }
  }
  return false;
}

export function listSettings(req, res) {
  const where = req.query.category
    ? eq(appSettings.category, req.query.category)
    : undefined;
  const rows = where
    ? db.select().from(appSettings).where(where).all()
    : db.select().from(appSettings).orderBy(appSettings.key).all();

  // Protected keys (cluster nodes, backup profiles) hold credentials - never
  // list their values for non-admin callers, same restriction as writes.
  const isAdmin = isAdminRole(req);
  const visible = isAdmin
    ? rows
    : rows.filter((r) => !ADMIN_WRITABLE.has(r.key));
  res.json(visible);
}

export function getSetting(req, res) {
  if (requireAdminForKey(req, res, req.params.key)) return;

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, req.params.key))
    .get();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}

export function upsertSetting(req, res) {
  try {
    if (requireWriteAccess(req, res, req.params.key)) return;

    const existing = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, req.params.key))
      .get();
    if (existing) {
      db.update(appSettings)
        .set({
          value: req.body.value,
          category: req.body.category || "general",
        })
        .where(eq(appSettings.id, existing.id))
        .run();
    } else {
      db.insert(appSettings)
        .values({
          key: req.params.key,
          value: req.body.value,
          category: req.body.category || "general",
        })
        .run();
    }


    const result = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, req.params.key))
      .get();
    res.json(result);
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function deleteSetting(req, res) {
  try {
    if (requireWriteAccess(req, res, req.params.key)) return;
    const count = db
      .delete(appSettings)
      .where(eq(appSettings.key, req.params.key))
      .run();


    res.json({ deleted: count.changes > 0 });
  } catch (error) {
    res.status(500).json(error.message);
  }
}
