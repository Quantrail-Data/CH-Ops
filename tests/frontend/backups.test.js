// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Integration tests verifying backup frontend interfaces, S3 file-glob matching, target directory layouts, and manifest schemas.


import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}

describe("Backups: Manifest Fields", () => {
  it("manual manifest has backup_type manual", () => {
    expect(read("src/frontend/components/backups/DataLifecycle.jsx")).toContain(
      'backup_type: "manual"',
    );
  });

  it("manual manifest stores display name and s3 path", () => {
    const code = read("src/frontend/components/backups/DataLifecycle.jsx");
    expect(code).toContain('display_name: backupId.split("/").pop()');
    expect(code).toContain("s3_path:");
  });

  it("manual manifest stores scope, database and tables fields", () => {
    const code = read("src/frontend/components/backups/DataLifecycle.jsx");
    expect(code).toContain("scope,");
    expect(code).toContain("database: db || null");
    expect(code).toContain("tables: tbl || null");
  });
});

describe("Backups: S3 Directory Layout", () => {
  const dl = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("manual backups use manual/ prefix", () => {
    expect(dl).toContain("manual/TABLE/");
    expect(dl).toContain("manual/ALL/");
  });

  it("database backups use manual/DATABASE prefix", () => {
    expect(dl).toContain("manual/DATABASE/");
  });

  it("manifest path uses backups/<backupId>/manifest.json", () => {
    expect(dl).toContain("const manifestKey = `backups/${backupId}/manifest.json`;");
  });

  it("backup destinations write under /backups/<path>/", () => {
    expect(dl).toContain("/backups/${path}/");
  });
});

describe("Backups: S3 Glob Compatibility", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("no ** globs (ClickHouse® compat)", () => {
    expect(code).not.toContain("/**/");
  });

  it("explicit depth patterns (1-4 levels)", () => {
    expect(code).toContain("manual/*/manifest.json");
    expect(code).toContain("manual/*/*/*/manifest.json");
    expect(code).toContain("manual/*/*/*/*/manifest.json");
  });

  it("filters expected-empty errors, deduplicates real errors", () => {
    expect(code).toContain("isExpectedEmpty");
    expect(code).toContain("new Set(errors)");
  });

  it("categorizes S3 errors (connection, auth, bucket)", () => {
    expect(code).toContain("Cannot reach S3 endpoint");
    expect(code).toContain("S3 authentication failed");
    expect(code).toContain("S3 bucket not found");
  });

  it("treats common missing-object scan errors as expected-empty", () => {
    expect(code).toContain('msg.includes("no files")');
    expect(code).toContain('msg.includes("NoSuchKey")');
    expect(code).toContain('msg.includes("does not exist")');
    expect(code).toContain('msg.includes("The specified key")');
    expect(code).toContain('msg.includes("404")');
    expect(code).toContain('msg.includes("No data")');
    expect(code).toContain('msg.includes("TABLE_IS_READ_ONLY")');
    expect(code).toContain('msg.includes("CANNOT_EXTRACT_TABLE")');
  });

  it("uses S3 scan query with RawBLOB manifest reads", () => {
    expect(code).toContain("SELECT _path, data FROM s3(");
    expect(code).toContain("'RawBLOB'");
    expect(code).toContain("'data String'");
    expect(code).toContain("LIMIT 500");
  });

  it("writes manifests through INSERT INTO FUNCTION s3", () => {
    expect(code).toContain("INSERT INTO FUNCTION s3(");
    expect(code).toContain("VALUES ('${escSql(manifestJson)}')");
  });

  it("uses escaped access key id and secret key in S3 read/write queries", () => {
    expect(code).toContain("escSql(s3.accessKeyId)");
    expect(code).toContain("escSql(s3.accessKey)");
  });

  it("redacts the S3 secret key in preview SQL", () => {
    expect(code).toContain("'***'");
    expect(code).toContain("buildDestDisplay");
  });
});

describe("Backups: Backup Discovery", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("deduplicates manifests by backup_id", () => {
    expect(code).toContain("seen.has(m.backup_id)");
    expect(code).toContain("seen.add(m.backup_id)");
  });

  it("sorts backups by created_at descending", () => {
    expect(code).toContain(
      'unique.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))',
    );
  });

  it("skips deleted manifests and invalid JSON payloads", () => {
    expect(code).toContain("if (m.deleted) return null");
    expect(code).toContain("JSON.parse(row.data)");
    expect(code).toContain("filter(Boolean)");
  });

  it("restore listing scans scope-specific manual backup paths", () => {
    expect(code).toContain('if (scope === "all")');
    expect(code).toContain('} else if (scope === "database") {');
    expect(code).toContain('} else if (scope === "table") {');
    expect(code).toContain("${base}/manual/ALL/*/manifest.json");
    expect(code).toContain("${base}/manual/DATABASE/*/*/manifest.json");
    expect(code).toContain("${base}/manual/TABLE/*/*/*/manifest.json");
  });

  it("available backups tab scans manual backup paths and legacy fallback paths", () => {
    expect(code).toContain("patterns.push(`${base}/manual/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/manual/*/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/manual/*/*/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/manual/*/*/*/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/ALL/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/DATABASE/*/*/manifest.json`);");
    expect(code).toContain("patterns.push(`${base}/TABLE/*/*/manifest.json`);");
  });
});

describe("Backups: SQL Generation", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("builds BACKUP and RESTORE SQL", () => {
    expect(code).toContain('const [action, setAction] = useState("backup")');
    expect(code).toContain('if (action === "backup")');
    expect(code).toContain('parts.push("TO")');
    expect(code).toContain('parts.push("FROM")');
  });

  it("supports ALL, DATABASE and TABLE scopes", () => {
    expect(code).toContain('parts.push("ALL")');
    expect(code).toContain("parts.push(`DATABASE ${db}`)");
    expect(code).toContain("parts.push(`TABLE ${db}.${tbl}`)");
  });

  it("supports EXCEPT TABLES and EXCEPT DATABASES", () => {
    expect(code).toContain("EXCEPT TABLES");
    expect(code).toContain("EXCEPT DATABASES");
  });

  it("supports ON CLUSTER and ASYNC", () => {
    expect(code).toContain("ON CLUSTER");
    expect(code).toContain('if (isAsync) parts.push("ASYNC")');
  });

  it("supports SETTINGS clause", () => {
    expect(code).toContain("SETTINGS");
    expect(code).toContain("settingsStr.trim()");
  });

  it("renders SQL preview", () => {
    expect(code).toContain("<SqlPreview sql={buildSql()} />");
  });
});

describe("Backups: Frontend UI", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("shows Manual and Available backup tabs", () => {
    expect(code).toContain("ManualBackupTab");
    expect(code).toContain("AvailableBackupsTab");
    expect(code).toContain("Manual Backup");
    expect(code).toContain("Available Backups");
  });

  it("available backups filter: All/Manual", () => {
    expect(code).toContain("All Backups");
    expect(code).toContain("Manual Only");
  });

  it("restore listing filters by selected scope", () => {
    expect(code).toContain("scope === ");
    expect(code).toContain("scope");
  });

  it("disables execute when required selections are missing", () => {
    expect(code).toContain("!profile ||");
    expect(code).toContain('(scope === "database" && !db)');
    expect(code).toContain('(scope === "table" && (!tbl || !db))');
  });

  it("shows scan action buttons for restore and browse tabs", () => {
    expect(code).toContain("List Available Backups");
    expect(code).toContain("Scan S3");
  });

  it("shows empty-state guidance when no backups are loaded", () => {
    expect(code).toContain("Select a profile and click Scan S3 to discover backups.");
  });
});

describe("Backups: Access Control", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("defines role levels including admin and superadmin", () => {
    expect(code).toContain("readonly: 0");
    expect(code).toContain("editor: 1");
    expect(code).toContain("admin: 2");
    expect(code).toContain("superadmin: 3");
  });

  it("gates data lifecycle management to administrators", () => {
    expect(code).toContain("Data lifecycle management is only available for administrators.");
    expect(code).toContain("const isAdmin = myLevel >= ROLE_LEVEL.admin;");
  });
});

describe("Backups: Storage Profile Handling", () => {
  const code = read("src/frontend/components/backups/DataLifecycle.jsx");

  it("supports GCS storage profiles", () => {
    expect(code).toContain('if (profile.type === "gcs")');
    expect(code).toContain("https://storage.googleapis.com/${profile.bucket}");
  });

  it("supports S3-compatible storage profiles", () => {
    expect(code).toContain('profile.endpoint || "https://s3.amazonaws.com"');
    expect(code).toContain("${profile.bucket}");
  });

  it("shows notice when no storage profiles are configured", () => {
    expect(code).toContain("No storage profiles configured.");
    expect(code).toContain("Create one in Storage Profiles first.");
  });
});