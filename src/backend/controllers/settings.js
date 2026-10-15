// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Key-value configurations store enforcing superadmin restrictions on sensitive keys containing encrypted credentials.

import { eq } from "drizzle-orm";
import { db, appSettings } from "../db/index.js";
import { encrypt } from "../services/crypto.js";

const USER_WRITABLE = new Set(["query_bookmarks"]);

const ADMIN_WRITABLE = new Set([
  "backup_profiles",
  "clusters",
  "cluster.nodes",
  "clusters.storage",
  "app_backup_config",
  "k8s.enabled",
  "backup.exclude_k8s_credentials",
]);

const PROTECTED_KEYS = ADMIN_WRITABLE;

function isSecretKey(key) {
  return String(key).startsWith("jwt.");
}

const creatingStar = () => "*"?.repeat(15);

function isBackupProfiler(req) {
  if (!isBackupProfilerFind(req)) {
    return {
      key: req.params.key,
      value: req.body.value,
      category: req.body.category || "general",
    };
  }

  let value = null;

  try {
    value = JSON.parse(req?.body?.value);
  } catch (err) {
    console.log("JSON parse is not accept the undefind value !", err?.message);
  }

  if (!value) return {};

  const currentId = req?.body?.dataId;

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings?.key, req?.params?.key))
    .get();

  let oldValue = [];

  try {
    oldValue = JSON?.parse(row?.value || "[]");
  } catch (err) {
    console.log("JSON parse is not accept the undefind value !", err?.message);
    oldValue = [];
  }

  value = value
    ?.filter((_v) => _v?.id === currentId)
    ?.map((_v) => {
      if (_v?.id === currentId) {
        if (_v?.type !== "s3") {
          return {
            ..._v,
            accessKey: encrypt(_v?.accessKey),
            accessKeyId: encrypt(_v?.accessKeyId),
          };
        }
        return {
          ..._v,
          endpoint: encrypt(_v?.endpoint),
          accessKeyId: encrypt(_v?.accessKeyId),
          accessKey: encrypt(_v?.accessKey),
        };
      }
      return _v;
    });

  oldValue = oldValue?.filter((_vd) => _vd?.id !== currentId);

  return {
    key: req.params.key,
    value: JSON.stringify([...oldValue, ...value]),
    category: req.body.category || "general",
  };
}

function isBackupProfilerFind(req) {
  return req?.params?.key === "backup_profiles";
}

function isAdminRole(req) {
  const role = req.user?.role;
  return role === "superadmin" || role === "admin";
}

function requireWriteAccess(req, res, key) {
  const admin = isAdminRole(req);
  if (USER_WRITABLE.has(key)) return false;
  if (admin && ADMIN_WRITABLE.has(key)) return false;
  res.status(403).json({ error: "Not allowed to write this setting." });
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
  const visible = rows.filter(
    (r) => !isSecretKey(r.key) && (isAdmin || !ADMIN_WRITABLE.has(r.key)),
  );
  res.json(visible);
}

export function getSetting(req, res) {
  if (isSecretKey(req.params.key))
    return res.status(404).json({ error: "Not found" });
  if (requireAdminForKey(req, res, req.params.key)) return;

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, req.params.key))
    .get();
  if (!row) return res.status(404).json({ error: "Not found" });

  if (!isBackupProfilerFind(req)) return res.json(row);

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
      const response = isBackupProfiler(req);
      db.update(appSettings)
        .set({
          value: response?.value,
          category: req.body.category || "general",
        })
        .where(eq(appSettings.id, existing.id))
        .run();
    } else {
      const val = isBackupProfiler(req);
      db.insert(appSettings).values(val).run();
    }

    const result = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, req.params.key))
      .get();

    if (!isBackupProfilerFind(req)) {
      return res.json(result);
    }

    const val = JSON.parse(result?.value || "[]");

    let filterData = val?.map((_v) => ({
      ..._v,
      endpoint: creatingStar(),
      accessKeyId: creatingStar(),
      accessKey: creatingStar(),
    }));

    return res.json({ ...result, value: JSON.stringify(filterData) });
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
