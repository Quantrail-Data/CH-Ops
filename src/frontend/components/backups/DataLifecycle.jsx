// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Manages data retention policies and handles system backup and restoration procedures.


import React, { useEffect, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery, apiFetch } from "../../utils/api.js";
import { SqlPreview } from "../layout/SharedComponents.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

const pad = (n) => String(n).padStart(2, "0");
function backupTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}`;
}
function escSql(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export default function DataLifecycle() {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [tab, setTab] = useState("manual");
  const [profiles, setProfiles] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [tables, setTables] = useState([]);
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    apiFetch("/api/settings/backup_profiles")
      .then((r) => {
        try {
          setProfiles(JSON.parse(r?.value || "[]"));
        } catch {
          setProfiles([]);
        }
      })
      .catch(() => {});
    runQuery("SELECT name FROM system.databases ORDER BY name")
      .then((r) => setDatabases((r.rows || []).map((r) => r.name)))
      .catch(() => {});
    runQuery(
      "SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster",
    )
      .then((r) => setClusters((r.rows || []).map((r) => r.cluster)))
      .catch(() => {});
  }, []);

  const handleTabChange = (newTab) => {
    if (newTab === 'browse' || isAdmin) {
      setTab(newTab);
    }
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-archive-filled"></Icon> Data Lifecycle
        </h2>
      </div>
      {profiles.length === 0 && (
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-info-circle"></Icon> No storage profiles configured.
          Create one in Storage Profiles first.
        </div>
      )}
      <div className="tab-bar">
        <div
          className={`tab-item ${tab === "manual" ? "active" : ""}`}
          onClick={() => handleTabChange("manual")}
          style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
        >
          <Icon className="ti ti-upload"></Icon> Manual Backup
        </div>
        <div
          className={`tab-item ${tab === "browse" ? "active" : ""}`}
          onClick={() => handleTabChange("browse")}
        >
          <Icon className="ti ti-cloud-download"></Icon> Available Backups
        </div>
      </div>
      {tab === "manual" && (
        <ManualBackupTab
          profiles={profiles}
          databases={databases}
          tables={tables}
          setTables={setTables}
          clusters={clusters}
        />
      )}
      {tab === "browse" && <AvailableBackupsTab profiles={profiles} />}
    </div>
  );
}

function getS3Base(profile) {
  if (!profile) return null;
  if (profile.type === "gcs")
    return {
      endpoint: `https://storage.googleapis.com/${profile.bucket}`,
      accessKeyId: profile.accessKeyId,
      accessKey: profile.accessKey,
    };
  return {
    endpoint: `${profile.endpoint || "https://s3.amazonaws.com"}${profile.bucket}`,
    accessKeyId: profile.accessKeyId,
    accessKey: profile.accessKey,
  };
}

async function scanS3Manifests(s3, patterns) {
  const allRows = [];
  const errors = [];
  for (const pattern of patterns) {
    try {
      const sql = `SELECT _path, data FROM s3('${pattern}', '${escSql(s3.accessKeyId)}', '${escSql(s3.accessKey)}', 'RawBLOB', 'data String') LIMIT 500`;
      const r = await runQuery(sql);
      if (r.rows?.length) allRows.push(...r.rows);
    } catch (err) {
      // ClickHouse often echoes the failing query back in s3()-related error
      // text, which would otherwise leak the plaintext secret key into the UI.
      let msg = err.message || "";
      if (s3?.accessKey) msg = msg.split(s3.accessKey).join("***");
      if (s3?.accessKeyId) msg = msg.split(s3.accessKeyId).join("***");
      // These are expected when a glob matches no files - not real errors
      const isExpectedEmpty =
        msg.includes("no files") ||
        msg.includes("NoSuchKey") ||
        msg.includes("does not exist") ||
        msg.includes("The specified key") ||
        msg.includes("404") ||
        msg.includes("No data") ||
        msg.includes("TABLE_IS_READ_ONLY") ||
        msg.includes("CANNOT_EXTRACT_TABLE");
      if (!isExpectedEmpty) {
        const shortPattern = pattern.split("/backups/")[1] || pattern;
        if (
          msg.includes("Unable to connect") ||
          msg.includes("Couldn't connect") ||
          msg.includes("ECONNREFUSED")
        ) {
          errors.push(
            `Cannot reach S3 endpoint. Verify the endpoint URL in your storage profile is correct and accessible from the ClickHouse® server.`,
          );
        } else if (
          msg.includes("Access Denied") ||
          msg.includes("403") ||
          msg.includes("InvalidAccessKeyId") ||
          msg.includes("SignatureDoesNotMatch")
        ) {
          errors.push(
            `S3 authentication failed. Check your Access Key ID and Secret Key in the storage profile.`,
          );
        } else if (msg.includes("NoSuchBucket")) {
          errors.push(
            `S3 bucket not found. Verify the bucket name in your storage profile.`,
          );
        } else {
          errors.push(`${shortPattern}: ${msg.substring(0, 150)}`);
        }
      }
    }
  }

  const uniqueErrors = [...new Set(errors)];

  const parsed = allRows
    .map((row) => {
      try {
        const m = JSON.parse(row.data);
        if (m.deleted) return null;
        return m;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = parsed.filter((m) => {
    if (seen.has(m.backup_id)) return false;
    seen.add(m.backup_id);
    return true;
  });
  unique.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return { backups: unique, errors: uniqueErrors };
}

function ManualBackupTab({ profiles, databases, tables, setTables, clusters }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const toast = useToast();
  const [action, setAction] = useState("backup");
  const [isAsync, setIsAsync] = useState(false);
  const [scope, setScope] = useState("all");
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const [exceptTables, setExceptTables] = useState("");
  const [exceptDatabases, setExceptDatabases] = useState("");
  const [onCluster, setOnCluster] = useState("");
  const [profile, setProfile] = useState("");
  const [settingsStr, setSettingsStr] = useState("");
  const [selectedBackup, setSelectedBackup] = useState("");
  const [availableBackups, setAvailableBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [scanErrors, setScanErrors] = useState([]);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (scope === "table" && db)
      runQuery(
        `SELECT name FROM system.tables WHERE database='${db}' ORDER BY name`,
      )
        .then((r) => setTables((r.rows || []).map((r) => r.name)))
        .catch(() => setTables([]));
    else setTables([]);
  }, [db, scope]);

  const selProfile = profiles.find((p) => p.name === profile);
  const s3 = getS3Base(selProfile);

  // ClickHouse often echoes the failing query back in s3()-related error text,
  // which would otherwise leak the plaintext secret key into toasts/logs.
  function redactS3Secret(msg) {
    if (!msg) return msg;
    let out = msg;
    if (s3?.accessKey) out = out.split(s3.accessKey).join("***");
    if (s3?.accessKeyId) out = out.split(s3.accessKeyId).join("***");
    return out;
  }

  function buildBackupId() {
    const ts = backupTimestamp();

    if (scope === "table" && db && tbl) {
      return `manual/TABLE/${db}.${tbl}/MANUAL_${db}.${tbl}__${ts}`;
    }

    if (scope === "database" && db) {
      return `manual/DATABASE/${db}/MANUAL_${db}__${ts}`;
    }

    return `manual/ALL/MANUAL_ALL__${ts}`;
  }

  function buildDestDisplay(path) {
    if (!s3) return "'-- select profile --'";

    return `S3('${s3.endpoint}/backups/${path}/', '${selProfile.accessKeyId}', '***')`;
  }

  function buildDestReal(path) {
    if (!s3) return "'-- select profile --'";

    return `S3(
    '${s3.endpoint}/backups/${path}/',
    '${escSql(s3.accessKeyId)}',
    '${escSql(s3.accessKey)}'
  )`;
  }

  function buildSqlParts(destFn) {
    const parts = [action.toUpperCase()];

    if (action === "backup") {
      if (scope === "table" && db && tbl) {
        parts.push(`TABLE ${db}.${tbl}`);
      } else if (scope === "database" && db) {
        parts.push(`DATABASE ${db}`);
      } else {
        parts.push("ALL");
      }

      if (exceptTables.trim()) {
        parts.push(`EXCEPT TABLES ${exceptTables.trim()}`);
      }

      if (exceptDatabases.trim() && scope === "all") {
        parts.push(`EXCEPT DATABASES ${exceptDatabases.trim()}`);
      }

      if (onCluster) {
        parts.push(`ON CLUSTER '${onCluster}'`);
      }

      parts.push("TO");
      parts.push(destFn(buildBackupId()));
    } else {
      if (scope === "table" && db && tbl) {
        parts.push(`TABLE ${db}.${tbl}`);
      } else if (scope === "database" && db) {
        parts.push(`DATABASE ${db}`);
      } else {
        parts.push("ALL");
      }

      if (onCluster) {
        parts.push(`ON CLUSTER '${onCluster}'`);
      }

      parts.push("FROM");

      parts.push(
        selectedBackup ? destFn(selectedBackup) : "'-- select backup --'",
      );
    }

    if (settingsStr.trim()) {
      parts.push(`SETTINGS ${settingsStr.trim()}`);
    }

    if (isAsync) parts.push("ASYNC");

    return parts.join(" ");
  }

  function buildSql() {
    return buildSqlParts(buildDestDisplay);
  }

  function buildRealSql() {
    return buildSqlParts(buildDestReal);
  }

  async function execute() {
    const backupId = buildBackupId();

    try {
      setExecuting(true);

      const sql = buildRealSql();

      await runQuery(sql);

      toast.success(`${action.toUpperCase()} executed successfully.`);

      if (action === "backup" && s3) {
        try {
          await writeManifest(backupId);
        } catch (err) {
          toast.warning(
            `Backup completed, but manifest write failed: ${redactS3Secret(err.message)}`,
          );
        }
      }
    } catch (err) {
      // ClickHouse s3()-related errors often echo the failing query back in the
      // message, which would otherwise leak the plaintext secret key onto the screen.
      const msg = redactS3Secret(err.message) || "Unknown error";

      if (msg.includes("Access Denied") || msg.includes("403")) {
        toast.error(
          `S3 access denied. Check your storage profile credentials. Details: ${msg}`,
        );
      } else if (msg.includes("NoSuchBucket") || msg.includes("bucket")) {
        toast.error(
          `S3 bucket not found. Verify the bucket name in your storage profile. Details: ${msg}`,
        );
      } else if (msg.includes("connect") || msg.includes("ECONNREFUSED")) {
        toast.error(
          `Cannot reach S3 endpoint. Check the endpoint URL in your storage profile. Details: ${msg}`,
        );
      } else {
        toast.error(`${action.toUpperCase()} failed: ${msg}`);
      }
    } finally {
      setExecuting(false);
    }
  }

  async function writeManifest(backupId) {
    const manifest = {
      backup_id: backupId,
      display_name: backupId.split("/").pop(),
      backup_type: "manual",
      scope,
      database: db || null,
      tables: tbl || null,
      created_at: new Date().toISOString(),
      s3_path: `${s3.endpoint}/backups/${backupId}/`,
    };

    const manifestJson = JSON.stringify(manifest);

    const manifestKey = `backups/${backupId}/manifest.json`;

    await runQuery(
      `INSERT INTO FUNCTION s3('${s3.endpoint}/${manifestKey}', '${escSql(s3.accessKeyId)}', '${escSql(s3.accessKey)}', 'RawBLOB', 'data String') VALUES ('${escSql(manifestJson)}')`,
    );
  }

  async function listBackups() {
    if (!s3) {
      toast.warning("Select a storage profile first.");
      return;
    }

    setLoadingBackups(true);
    setAvailableBackups([]);
    setScanErrors([]);

    const base = `${s3.endpoint}/backups`;

    let patterns = [];

    if (scope === "all") {
      patterns = [
        `${base}/manual/ALL/*/manifest.json`,
        `${base}/manual/DATABASE/*/manifest.json`,
        `${base}/manual/DATABASE/*/*/manifest.json`,
        `${base}/manual/TABLE/*/*/manifest.json`,
        `${base}/manual/TABLE/*/*/*/manifest.json`,
      ];
    } else if (scope === "database") {
      if (db) {
        patterns = [
          `${base}/manual/DATABASE/${db}/manifest.json`,
          `${base}/manual/DATABASE/${db}/*/manifest.json`,
          `${base}/manual/TABLE/${db}.*/manifest.json`,
          `${base}/manual/TABLE/${db}.*/*/*/manifest.json`,
        ];
      } else {
        patterns = [
          `${base}/manual/DATABASE/*/manifest.json`,
          `${base}/manual/DATABASE/*/*/manifest.json`,
          `${base}/manual/TABLE/*/manifest.json`,
          `${base}/manual/TABLE/*/*/manifest.json`,
        ];
      }
    } else if (scope === "table") {
      if (db && tbl) {
        patterns = [
          `${base}/manual/TABLE/${db}.${tbl}/manifest.json`,
          `${base}/manual/TABLE/${db}.${tbl}/*/manifest.json`,
        ];
      } else if (db) {
        patterns = [
          `${base}/manual/TABLE/${db}.*/manifest.json`,
          `${base}/manual/TABLE/${db}.*/*/*/manifest.json`,
        ];
      } else {
        patterns = [
          `${base}/manual/TABLE/*/manifest.json`,
          `${base}/manual/TABLE/*/*/manifest.json`,
          `${base}/manual/TABLE/*/*/*/manifest.json`,
        ];
      }
    }

    try {
      const { backups, errors } = await scanS3Manifests(s3, patterns);

      const filtered = backups;

      setAvailableBackups(
        filtered.map((m) => ({
          name: `${m.display_name || m.backup_id} [${(
            m.backup_type || "legacy"
          ).toUpperCase()}${m.is_incremental ? " INC" : ""}] (${
            m.created_at ? new Date(m.created_at).toLocaleString() : ""
          })`,
          fullPath: m.backup_id,
          meta: m,
        })),
      );

      setScanErrors(errors);

      if (!filtered.length && !errors.length) {
        toast.info(
          `No ${scope === "all" ? "" : scope + " "}backups found in S3.`,
        );
      } else if (!filtered.length && errors.length) {
        toast.warning("Scan completed with errors. No matching backups found.");
      } else {
        toast.success(
          `Found ${filtered.length} backup(s)${
            scope !== "all" ? ` for scope: ${scope}` : ""
          }.`,
        );
      }
    } catch (err) {
      console.error("Failed to scan backups:", redactS3Secret(err.message));
      toast.error("Failed to scan backups.");
    } finally {
      setLoadingBackups(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h4 style={{ fontSize: "15px", marginBottom: 14 }}>
        <Icon className="ti ti-settings-filled"></Icon> Manual Backup / Restore
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div className="form-group">
          <label className="form-label">Action *</label>
          <Select
            className="form-select"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setSelectedBackup("");
              setAvailableBackups([]);
              setScanErrors([]);
            }}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="backup">BACKUP</option>
            <option value="restore">RESTORE</option>
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Scope</label>
          <Select
            className="form-select"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setTbl("");
            }}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="all">ALL</option>
            <option value="database">DATABASE</option>
            <option value="table">TABLE</option>
          </Select>
        </div>
        {(scope === "database" || scope === "table") && (
          <div className="form-group">
            <label className="form-label">Database</label>
            <Select
              className="form-select"
              value={db}
              onChange={(e) => {
                setDb(e.target.value);
                setTbl("");
              }}
              disabled={!isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            >
              <option value="">--</option>
              {databases.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
        )}
        {scope === "table" && (
          <div className="form-group">
            <label className="form-label">Table</label>
            <Select
              className="form-select"
              value={tbl}
              onChange={(e) => setTbl(e.target.value)}
              disabled={!isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            >
              <option value="">--</option>
              {tables.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Storage Profile *</label>
          <Select
            className="form-select"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.type.toUpperCase()})
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">ON CLUSTER</label>
          <Select
            className="form-select"
            value={onCluster}
            onChange={(e) => setOnCluster(e.target.value)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div
          className="form-group"
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: 22,
            gap: 6,
          }}
        >
          <label
            style={{
              display: "flex",
              gap: 6,
              cursor: isAdmin ? "pointer" : "not-allowed",
              fontSize: "14px",
            }}
          >
            <input
              type="checkbox"
              checked={isAsync}
              onChange={(e) => setIsAsync(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
              disabled={!isAdmin}
            />{" "}
            ASYNC
          </label>
        </div>
      </div>
      {action === "backup" && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: "15px", marginBottom: 14 }}>
            <Icon className="ti ti-filter"></Icon> Exceptions
          </h4>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
            <div className="form-group">
              <label className="form-label">EXCEPT TABLES</label>
              <input
                className="form-input"
                value={exceptTables}
                onChange={(e) => setExceptTables(e.target.value)}
                placeholder="db.table1, db.table2"
                disabled={!isAdmin}
                style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
              />
            </div>
            {scope === "all" && (
              <div className="form-group">
                <label className="form-label">EXCEPT DATABASES</label>
                <input
                  className="form-input"
                  value={exceptDatabases}
                  onChange={(e) => setExceptDatabases(e.target.value)}
                  disabled={!isAdmin}
                  style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {action === "restore" && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: "15px", marginBottom: 14 }}>
            <Icon className="ti ti-cloud-download"></Icon> Select Backup
          </h4>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              marginBottom: 12,
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={listBackups}
              disabled={loadingBackups || !profile || !isAdmin}
              style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
            >
              {loadingBackups ? (
                <>
                  <span className="loading-spinner"></span> Scanning S3...
                </>
              ) : (
                <>
                  <Icon className="ti ti-refresh"></Icon> List Available Backups
                </>
              )}
            </button>
          </div>
          {scanErrors.length > 0 && (
            <div
              className="alert-banner info"
              style={{ marginBottom: 12, fontSize: "13px" }}
            >
              <Icon className="ti ti-info-circle"></Icon> Some S3 paths could not be
              scanned: {scanErrors.join("; ")}
            </div>
          )}
          {availableBackups.length > 0 && (
            <div className="form-group">
              <label className="form-label">
                Available Backups ({availableBackups.length}, newest first)
              </label>
              <Select
                className="form-select"
                value={selectedBackup}
                onChange={(e) => setSelectedBackup(e.target.value)}
                disabled={!isAdmin}
                style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
              >
                <option value="">-- select backup --</option>
                {availableBackups.map((b, i) => (
                  <option key={i} value={b.fullPath}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}
      <h4 style={{ fontSize: "15px", marginBottom: 14 }}>
        <Icon className="ti ti-adjustments"></Icon> SETTINGS
      </h4>
      <div className="form-group" style={{ marginBottom: 20 }}>
        <input
          className="form-input"
          value={settingsStr}
          onChange={(e) => setSettingsStr(e.target.value)}
          placeholder="base_backup = ..., compression_method = 'lz4'"
          disabled={!isAdmin}
          style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
        />
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          base_backup, compression_method, s3_storage_class
        </span>
      </div>
      <SqlPreview sql={buildSql()} />
      <div style={{ marginBottom: 20 }}>
        <div
          className="alert-banner info"
          style={{ marginTop: 10, marginBottom: 0, fontSize: "12px", padding: "6px" }}
        >
          <Icon
            style={{ fontSize: "15px", paddingTop: "2px" }}
            className="ti ti-info-circle"
          ></Icon>
          <span>
            Backup duration varies depending on dataset size, number of files, network bandwidth, and object storage performance. Large backups may take several hours to complete.
          </span>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          onClick={execute}
          disabled={
            !profile ||
            (scope === "database" && !db) ||
            (scope === "table" && (!tbl || !db)) ||
            !isAdmin
          }
          style={!isAdmin ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
        >
          {executing ? (
            <>
              <span className="loading-spinner"></span> Executing...
            </>
          ) : (
            <>
              <Icon
                className={`ti ti-${action === "backup" ? "upload" : "download"}`}
              ></Icon>{" "}
              Execute {action.toUpperCase()}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function AvailableBackupsTab({ profiles }) {
  const { auth } = useAuth();
  const myRole = auth?.role || 'readonly';
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const toast = useToast();
  const [profile, setProfile] = useState("");
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [scanErrors, setScanErrors] = useState([]);

  const selProfile = profiles.find((p) => p.name === profile);
  const s3 = getS3Base(selProfile);

  async function loadBackups() {
    if (!s3) {
      toast.warning("Select a storage profile first.");
      return;
    }
    setLoading(true);
    setBackups([]);
    setScanErrors([]);

    const base = `${s3.endpoint}/backups`;
    const patterns = [];
    if (filter === "all" || filter === "manual") {
      patterns.push(`${base}/manual/*/manifest.json`);
      patterns.push(`${base}/manual/*/*/manifest.json`);
      patterns.push(`${base}/manual/*/*/*/manifest.json`);
      patterns.push(`${base}/manual/*/*/*/*/manifest.json`);
      patterns.push(`${base}/ALL/*/manifest.json`);
      patterns.push(`${base}/DATABASE/*/*/manifest.json`);
      patterns.push(`${base}/TABLE/*/*/manifest.json`);
    }

    const { backups: found, errors } = await scanS3Manifests(s3, patterns);
    setBackups(found);
    setScanErrors(errors);
    if (!found.length && !errors.length)
      toast.info(
        "No backups found. The S3 bucket may be empty or the profile credentials may be incorrect.",
      );
    else if (!found.length && errors.length)
      toast.warning(
        `Scan completed with ${errors.length} error(s). No backups found.`,
      );
    else toast.success(`Found ${found.length} backup(s).`);
    setLoading(false);
  }

  return (
    <div>
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 16,
          display: "flex",
          gap: 14,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div className="form-group">
          <label className="form-label">Storage Profile *</label>
          <Select
            className="form-select"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
            <option value="">--</option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label className="form-label">Filter</label>
          <Select
            className="form-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Backups</option>
            <option value="manual">Manual Only</option>
          </Select>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={loadBackups}
          disabled={loading || !profile}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span> Scanning S3...
            </>
          ) : (
            <>
              <Icon className="ti ti-refresh"></Icon> Scan S3
            </>
          )}
        </button>
      </div>

      {scanErrors.length > 0 && (
        <div
          className="alert-banner info"
          style={{ marginBottom: 14, fontSize: "13px" }}
        >
          <Icon className="ti ti-info-circle"></Icon> Some S3 paths could not be
          scanned: {scanErrors.join("; ")}
        </div>
      )}

      {backups.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="data-table-wrap dt-single">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Backup ID</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Created</th>
                  <th>Incremental</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        fontFamily: "var(--font-code)",
                        fontSize: "13px",
                      }}
                    >
                      {b.display_name || b.backup_id}
                    </td>
                    <td>
                      {b.scope?.toUpperCase()}
                      {b.database ? ` / ${b.database}` : ""}
                      {b.tables ? `.${b.tables}` : ""}
                    </td>
                    <td>
                      {b.created_at
                        ? new Date(b.created_at).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {b.is_incremental ? (
                        <span className="badge badge-amber">INC</span>
                      ) : (
                        <span className="badge badge-green">FULL</span>
                      )}
                    </td>
                    <td>{b.retention_days ? `${b.retention_days}d` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="empty-state">
            <Icon className="ti ti-cloud-off"></Icon>
            <p>Select a profile and click Scan S3 to discover backups.</p>
          </div>
        )
      )}
    </div>
  );
}
