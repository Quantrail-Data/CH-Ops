// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Manages data retention policies and handles system backup and restoration procedures.


import { useEffect, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { runQuery, apiFetch, getGlobalConnection } from "../../utils/api.js";
import {
  previewStorage,
  checkBackupRequest,
  buildBackupSql,
  makeBackupId,
  backupTimestamp,
} from "../../../shared/backupSql.js";
import { SqlPreview } from "../layout/SharedComponents.jsx";
import { useToast } from "../layout/Toast.jsx";
import { useAuth } from "../../App.jsx";
import ToggleSwitch from "../common/ToggleSwitch.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

// Sends a backup page request as fields. The server builds the SQL and adds
// the storage keys. It also removes the keys from error messages.
function sendBackupRequest(fields) {
  const conn = getGlobalConnection();
  return apiFetch("/api/query", {
    method: "POST",
    body: JSON.stringify({
      backup_sp: true,
      backup: fields,
      node: conn.nodeName,
      clusterId: conn.clusterId,
    }),
  });
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
  const [loaded, setLoaded] = useState(false);

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
    setLoaded(true);
  }, []);

  const handleTabChange = (newTab) => {
    if (newTab === 'browse' || isAdmin) {
      setTab(newTab);
    }
  };

  if (!loaded) {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-archive-filled"></Icon> Data Lifecycle
          </h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>Data lifecycle management is only available for administrators.</span>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>Data lifecycle management is only available for administrators.</p>
        </div>
      </div>
    );
  }

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

// Each pattern is a path under backups/ that ends with manifest.json.
async function scanS3Manifests(profile, patterns) {
  const allRows = [];
  const errors = [];
  for (const pattern of patterns) {
    try {
      const r = await sendBackupRequest({
        action: "list",
        profileId: profile.id,
        pattern,
      });
      if (r.rows?.length) allRows.push(...r.rows);
    } catch (err) {
      const msg = err.message || "";
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
        const shortPattern = pattern;
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
  const toast = useToast();
  const [result , setResult] =useState(null)
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
  const [baseBackup, setBaseBackup] = useState("");
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
  }, [db, scope, setTables]);

  const selProfile = profiles.find((p) => p.name === profile);

  // The request fields. The page sends only the fields that fit the action and scope.
  function requestFields() {
    const isBackup = action === "backup";
    return {
      action,
      scope,
      database: scope === "all" ? "" : db,
      table: scope === "table" ? tbl : "",
      profileId: selProfile?.id,
      onCluster,
      async: isAsync,
      exceptTables: isBackup && scope !== "table" ? exceptTables : "",
      exceptDatabases: isBackup && scope === "all" ? exceptDatabases : "",
      baseBackup: isBackup ? baseBackup : "",
      backupId: isBackup ? "" : selectedBackup,
      settings: settingsStr,
    };
  }

  // The preview uses the same fields and the same builder as the server, with masked keys.
  function buildSql() {
    if (!selProfile) return "-- Select a storage profile.";
    if (action === "restore" && !selectedBackup) return "-- Select a backup.";
    try {
      const clean = checkBackupRequest(requestFields());
      const backupId =
        action === "backup"
          ? makeBackupId(clean.scope, clean.database, clean.table, backupTimestamp())
          : clean.backupId;
      return buildBackupSql(clean, previewStorage(selProfile), backupId);
    } catch (err) {
      return `-- ${err.message}`;
    }
  }

  async function execute() {
    try {
      setExecuting(true);

      const response = await sendBackupRequest(requestFields());
      if (response?.manifest_error) {
        console.error("Manifest write failed:", response.manifest_error);
        setResult({ok:false, msg:`Backup completed, but manifest write failed: ${response.manifest_error}`})
      } else {
        setResult({
          ok: true,
          msg: `${action.toUpperCase()} executed successfully.`,
        });
      }
    } catch (err) {
      const msg = err.message || "Unknown error";
      console.error(`${action.toUpperCase()} failed:`, msg);

      if (msg.includes("Access Denied") || msg.includes("403")) {
        setResult({ok:false, msg:`Storage access denied. Check your storage profile credentials. Details: ${msg}`})
      } else if (msg.includes("NoSuchBucket") || msg.includes("bucket") || msg.includes("ContainerNotFound")) {
        setResult({ok:false, msg:`Bucket or container not found. Verify the name in your storage profile. Details: ${msg}`})
      } else if (msg.includes("connect") || msg.includes("ECONNREFUSED")) {
        setResult({ok:false, msg:`Cannot reach the storage endpoint. Check the endpoint in your storage profile. Details: ${msg}`})
      } else {
        setResult({ok:false, msg:`${action.toUpperCase()} failed: ${msg}`})
      }
    } finally {
      setScope("all");
      setDb("");
      setTbl("");
      setExceptDatabases("");
      setExceptTables("");
      setBaseBackup("");
      setOnCluster("");
      setIsAsync(false);
      setProfile("");
      setSettingsStr("");
      setExecuting(false);
            setAvailableBackups([])
    }
  }

 async function listBackups() {
    if (!selProfile) {
      toast.warning("Select a storage profile first.");
      return;
    }

    setLoadingBackups(true);
    setAvailableBackups([]);
    setScanErrors([]);

    let patterns = [];

    if (scope === "all") {
      patterns = [
        `manual/ALL/*/manifest.json`,
        `manual/DATABASE/*/manifest.json`,
        `manual/DATABASE/*/*/manifest.json`,
        `manual/TABLE/*/*/manifest.json`,
        `manual/TABLE/*/*/*/manifest.json`,
      ];
    } else if (scope === "database") {
      if (db) {
        patterns = [
          `manual/DATABASE/${db}/manifest.json`,
          `manual/DATABASE/${db}/*/manifest.json`,
          `manual/TABLE/${db}.*/manifest.json`,
          `manual/TABLE/${db}.*/*/*/manifest.json`,
        ];
      } else {
        patterns = [
          `manual/DATABASE/*/manifest.json`,
          `manual/DATABASE/*/*/manifest.json`,
          `manual/TABLE/*/manifest.json`,
          `manual/TABLE/*/*/manifest.json`,
        ];
      }
    } else if (scope === "table") {
      if (db && tbl) {
        patterns = [
          `manual/TABLE/${db}.${tbl}/manifest.json`,
          `manual/TABLE/${db}.${tbl}/*/manifest.json`,
        ];
      } else if (db) {
        patterns = [
          `manual/TABLE/${db}.*/manifest.json`,
          `manual/TABLE/${db}.*/*/*/manifest.json`,
        ];
      } else {
        patterns = [
          `manual/TABLE/*/manifest.json`,
          `manual/TABLE/*/*/manifest.json`,
          `manual/TABLE/*/*/*/manifest.json`,
        ];
      }
    }

    try {
      const { backups, errors } = await scanS3Manifests(selProfile, patterns);

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
          `No ${scope === "all" ? "" : scope + " "}backups found in the storage.`,
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
      console.error("Backup scan failed:", err.message);
      toast.error("Failed to scan backups.");
    } finally {
      setLoadingBackups(false);
    }
  }

  return (
    <>
      {result && (
        <div
          className={`alert-banner ${result.ok ? "success" : "danger"}`}
          style={{ marginBottom: 14 }}
          >
          <Icon
          className={`ti ${result.ok ? "ti-check" : "ti-alert-circle"}`}
          ></Icon>{" "}
          {result.msg}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setResult(null)}
              >
            <Icon className="ti ti-x"></Icon>
            </button>
        </div>
        )}
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
          >
            <option value="">--</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <ToggleSwitch checked={isAsync}
              onChange={(e) => setIsAsync(e.target.checked)} label="ASYNC"/>
      </div>
      {action === "backup" && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: "15px", marginBottom: 14 }}>
            <Icon className="ti ti-filter"></Icon> Exceptions and Base Backup
          </h4>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
            {scope !== "table" && (
              <div className="form-group">
                <label className="form-label">EXCEPT TABLES</label>
                <input
                  className="form-input"
                  value={exceptTables}
                  onChange={(e) => setExceptTables(e.target.value)}
                  placeholder="db.table1, db.table2"
                />
              </div>
            )}
            {scope === "all" && (
              <div className="form-group">
                <label className="form-label">EXCEPT DATABASES</label>
                <input
                  className="form-input"
                  value={exceptDatabases}
                  onChange={(e) => setExceptDatabases(e.target.value)}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">BASE BACKUP</label>
              <input
                className="form-input"
                value={baseBackup}
                onChange={(e) => setBaseBackup(e.target.value)}
                placeholder="manual/ALL/MANUAL_ALL__2026_01_01_02_00_00"
              />
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Backup ID of an earlier backup. Set it for an incremental backup.
              </span>
            </div>
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
              disabled={loadingBackups || !profile}
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
          placeholder="compression_method = 'lz4', compression_level = 3"
        />
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Use name = value pairs, split by commas. A value is a number, a word or a quoted text. Set base_backup in the BASE BACKUP field.
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
            (scope === "table" && (!tbl || !db))
          }
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
    </>
  );
}

function AvailableBackupsTab({ profiles }) {
  const toast = useToast();
  const [profile, setProfile] = useState("");
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter] = useState("all");
  const [scanErrors, setScanErrors] = useState([]);

  const selProfile = profiles.find((p) => p.name === profile);

   async function loadBackups() {
    if (!selProfile) {
      toast.warning("Select a storage profile first.");
      return;
    }
    setLoading(true);
    setBackups([]);
    setScanErrors([]);

    const patterns = [];
    if (filter === "all" || filter === "manual") {
      patterns.push(`manual/*/manifest.json`);
      patterns.push(`manual/*/*/manifest.json`);
      patterns.push(`manual/*/*/*/manifest.json`);
      patterns.push(`manual/*/*/*/*/manifest.json`);
      patterns.push(`ALL/*/manifest.json`);
      patterns.push(`DATABASE/*/*/manifest.json`);
      patterns.push(`TABLE/*/*/manifest.json`);
    }

    const { backups: found, errors } = await scanS3Manifests(selProfile, patterns);
    setBackups(found);
    setScanErrors(errors);
    if (!found.length && !errors.length)
      toast.info(
        "No backups found. The bucket or container may be empty or the profile credentials may be incorrect.",
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
                  <th>Scope</th>
                  <th>Created</th>
                  <th>Backup Type</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        fontFamily: "var(--font-code)",
                        fontSize: "13px",
                        wordBreak: "break-all",
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
