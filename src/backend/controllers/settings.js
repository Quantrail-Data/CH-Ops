// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Key-value configurations store enforcing superadmin restrictions on sensitive keys containing encrypted credentials.

import { eq } from "drizzle-orm";
import { db, appSettings } from "../db/index.js";
import { encrypt } from "../services/crypto.js";

const USER_WRITABLE = new Set(["query_bookmarks"]);

const USER_READABLE = new Set(["query_bookmarks"]);

// "query_bookmarks:<user id>" is the stored key of the bookmarks of one user.
// Only storedKey() makes this key. The API must not read or write it directly.
const SERVER_ONLY_PREFIXES = ["jwt.", "smtp.", "query_bookmarks:"];

const BOOKMARKS_KEY = "query_bookmarks";

// Each user has their own bookmarks. The API key stays "query_bookmarks".
// The stored key also has the user id.
function storedKey(req, key) {
  if (key !== BOOKMARKS_KEY) return key;
  return `${BOOKMARKS_KEY}:${req.user?.userId}`;
}

// Bookmarks need a user. A request without a user id gets 403.
function refuseBookmarksWithoutUser(req, res, key) {
  if (key !== BOOKMARKS_KEY || req.user?.userId) return false;
  res.status(403).json({ error: "Bookmarks need a user login." });
  return true;
}

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
  } catch {
    // A value that is not valid JSON stays null.
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
  } catch {
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

function isServerOnlyKey(key) {
  return SERVER_ONLY_PREFIXES.some((prefix) => String(key).startsWith(prefix));
}

function canReadSetting(req, key) {
  if (isServerOnlyKey(key)) return false;
  if (isAdminRole(req)) return true;
  return USER_READABLE.has(key);
}

export function listSettings(req, res) {
  const where = req.query.category
    ? eq(appSettings.category, req.query.category)
    : undefined;
  const rows = where
    ? db.select().from(appSettings).where(where).all()
    : db.select().from(appSettings).orderBy(appSettings.key).all();

  const visible = rows.filter((r) => canReadSetting(req, r.key));

  res.json(visible);
}

export function getSetting(req, res) {
  if (!canReadSetting(req, req.params.key)) {
    return res.status(403).json({ error: "Not allowed to read this setting." });
  }
  if (refuseBookmarksWithoutUser(req, res, req.params.key)) return;

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, storedKey(req, req.params.key)))
    .get();
  if (!row) return res.status(404).json({ error: "Not found" });

  if (!isBackupProfilerFind(req)) return res.json(row);

  res.json(row);
}

export function upsertSetting(req, res) {
  try {
    if (requireWriteAccess(req, res, req.params.key)) return;
    if (refuseBookmarksWithoutUser(req, res, req.params.key)) return;
    const key = storedKey(req, req.params.key);

    const existing = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
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
      const newRow = isBackupProfiler(req);
      db.insert(appSettings).values({ ...newRow, key }).run();
    }

    const result = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
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
    if (refuseBookmarksWithoutUser(req, res, req.params.key)) return;
    const count = db
      .delete(appSettings)
      .where(eq(appSettings.key, storedKey(req, req.params.key)))
      .run();

    res.json({ deleted: count.changes > 0 });
  } catch (error) {
    res.status(500).json(error.message);
  }
}
