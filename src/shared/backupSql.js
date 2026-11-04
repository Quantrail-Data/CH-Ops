// backupSql.js - builds the ClickHouse® SQL for backups to S3, GCS and Azure Blob storage.
//
// The server builds the real SQL with the storage keys. The browser builds the
// same SQL with masked keys for the preview. The browser never sends SQL.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const MASK = "***";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CLUSTER_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const PATH_PART = /^[A-Za-z0-9_.-]+$/;
const SCAN_PART = /^[A-Za-z0-9_.*-]+$/;
const SETTING_PAIR = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;
const SETTING_VALUE = /^(-?[0-9]+(\.[0-9]+)?|[A-Za-z0-9_]+|'[A-Za-z0-9_.:-]*')$/;
const MAX_PATH_LENGTH = 500;

// Writes a value as a ClickHouse string literal.
export function sqlString(value) {
  const text = String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${text}'`;
}

// A connection string has "name=value" parts that are split by ";".
// An account key is plain base64 text and has no ";".
export function isAzureConnectionString(value) {
  const text = String(value || "");
  return text.includes(";") && text.includes("=");
}

// Gives the storage details from a storage profile with decrypted values.
export function storageFromProfile(profile) {
  if (profile.type === "azure") {
    const container = profile.bucket || profile.container || "";
    if (isAzureConnectionString(profile.accessKey)) {
      return { kind: "azure", container, connectionString: profile.accessKey };
    }
    const accountName = profile.accessKeyId || "";
    const url = (profile.endpoint || `https://${accountName}.blob.core.windows.net`).replace(/\/+$/, "");
    return { kind: "azure", container, url, accountName, accountKey: profile.accessKey || "" };
  }
  let endpoint = "https://storage.googleapis.com";
  if (profile.type !== "gcs") {
    endpoint = (profile.endpoint || "https://s3.amazonaws.com").replace(/\/+$/, "");
  }
  return {
    kind: "s3",
    baseUrl: `${endpoint}/${profile.bucket}`,
    accessKeyId: profile.accessKeyId || "",
    accessKey: profile.accessKey || "",
  };
}

// Gives the storage details for the SQL preview. The browser does not know the keys.
export function previewStorage(profile) {
  if (profile.type === "azure") {
    return {
      kind: "azure",
      container: profile.bucket || profile.container || "",
      url: "<connection string or URL>",
      accountName: "<account name>",
      accountKey: MASK,
    };
  }
  if (profile.type === "gcs") {
    return storageFromProfile({ ...profile, accessKeyId: "<accessKeyId>", accessKey: MASK });
  }
  return {
    kind: "s3",
    baseUrl: `<endpoint>/${profile.bucket}`,
    accessKeyId: "<accessKeyId>",
    accessKey: MASK,
  };
}

// Replaces the storage keys in a text, for example in a ClickHouse error message.
export function hideSecrets(text, storage) {
  if (typeof text !== "string") return text;
  let hidden = text;
  const secrets = [storage?.accessKeyId, storage?.accessKey, storage?.accountKey, storage?.connectionString];
  for (const secret of secrets) {
    if (secret && secret !== MASK) hidden = hidden.split(secret).join(MASK);
  }
  return hidden.replace(/(AccountKey|SharedAccessSignature)=[^;'"\s]*/gi, `$1=${MASK}`);
}

// The BACKUP or RESTORE destination for a folder in the storage.
export function backupDestination(storage, folder) {
  if (storage.kind === "azure") {
    if (storage.connectionString) {
      return `AzureBlobStorage(${sqlString(storage.connectionString)}, ${sqlString(storage.container)}, ${sqlString(folder)})`;
    }
    return `AzureBlobStorage(${sqlString(storage.url)}, ${sqlString(storage.container)}, ${sqlString(folder)}, ${sqlString(storage.accountName)}, ${sqlString(storage.accountKey)})`;
  }
  return `S3(${sqlString(`${storage.baseUrl}/${folder}`)}, ${sqlString(storage.accessKeyId)}, ${sqlString(storage.accessKey)})`;
}

// A table function that reads or writes one file as a single String column named data.
export function rawBlobFunction(storage, filePath) {
  if (storage.kind === "azure") {
    if (storage.connectionString) {
      return `azureBlobStorage(${sqlString(storage.connectionString)}, ${sqlString(storage.container)}, ${sqlString(filePath)}, 'RawBLOB', 'auto', 'data String')`;
    }
    return `azureBlobStorage(${sqlString(storage.url)}, ${sqlString(storage.container)}, ${sqlString(filePath)}, ${sqlString(storage.accountName)}, ${sqlString(storage.accountKey)}, 'RawBLOB', 'auto', 'data String')`;
  }
  return `s3(${sqlString(`${storage.baseUrl}/${filePath}`)}, ${sqlString(storage.accessKeyId)}, ${sqlString(storage.accessKey)}, 'RawBLOB', 'data String')`;
}

// The file that the storage Test button reads. The file does not need to exist.
export const TEST_PROBE_PATH = "test_connection_probe";

// The SQL of the storage Test button. It reads one small file, so ClickHouse must reach the storage.
export function connectionTestSql(storage) {
  return `SELECT 1 FROM ${rawBlobFunction(storage, TEST_PROBE_PATH)} LIMIT 1`;
}

// Tells if a Test button error only says that the test file does not exist.
// Then the storage is reachable. A missing bucket or container is a real failure.
export function isMissingFileError(message) {
  const text = String(message || "");
  if (/ContainerNotFound|NoSuchBucket|(container|bucket) (does not exist|not found)/i.test(text)) {
    return false;
  }
  return /not found|NoSuchKey|BlobNotFound|blob does not exist|key does not exist|404/i.test(text);
}

// A readable location of a file, without keys, for manifests.
export function storageLocation(storage, filePath) {
  if (storage.kind === "azure") return `azure://${storage.container}/${filePath}`;
  return `${storage.baseUrl}/${filePath}`;
}

export function insertFileSql(storage, filePath, text) {
  return `INSERT INTO FUNCTION ${rawBlobFunction(storage, filePath)} VALUES (${sqlString(text)})`;
}

function checkName(value, label) {
  const name = String(value ?? "").trim();
  if (!IDENTIFIER.test(name)) {
    throw new Error(`${label} "${name}" is not a valid name. Use letters, digits and underscores only.`);
  }
  return name;
}

function checkTableName(value) {
  const parts = String(value ?? "").trim().split(".");
  if (parts.length > 2) throw new Error(`Table "${value}" is not valid. Use table or database.table.`);
  return parts.map((part) => checkName(part, "Table")).join(".");
}

function toList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

// A backup ID is a relative path such as manual/ALL/MANUAL_ALL__2026_01_01_10_00_00.
export function checkBackupPath(value, label = "Backup") {
  const path = String(value ?? "").trim();
  const parts = path.split("/");
  const valid =
    path.length > 0 &&
    path.length <= MAX_PATH_LENGTH &&
    parts.every((part) => PATH_PART.test(part) && part !== "." && part !== "..");
  if (!valid) throw new Error(`${label} "${path}" is not a valid backup ID.`);
  return path;
}

// A scan pattern is a path under backups/ that ends with manifest.json. It can use * only.
export function checkScanPattern(value) {
  const pattern = String(value ?? "").trim();
  const parts = pattern.split("/");
  const valid =
    pattern.length <= MAX_PATH_LENGTH &&
    parts[parts.length - 1] === "manifest.json" &&
    parts.every((part) => SCAN_PART.test(part) && part !== "." && part !== "..");
  if (!valid) throw new Error(`Scan pattern "${pattern}" is not valid.`);
  return pattern;
}

// Reads "name = value, name = value". A value must be a number, a word or a simple quoted text.
export function parseSettings(text) {
  const pairs = [];
  for (const item of toList(text)) {
    const match = SETTING_PAIR.exec(item);
    if (!match) throw new Error(`Setting "${item}" is not valid. Use name = value.`);
    const name = match[1];
    const value = match[2].trim();
    if (name === "base_backup") throw new Error("Use the Base backup field for base_backup.");
    if (!SETTING_VALUE.test(value)) {
      throw new Error(`The value of setting "${name}" is not valid. Use a number, a word or a quoted text with letters, digits, dots, colons, dashes and underscores.`);
    }
    pairs.push({ name, value });
  }
  return pairs;
}

// Checks a backup or restore request from the browser and gives clean fields.
export function checkBackupRequest(request) {
  const action = request?.action;
  if (action !== "backup" && action !== "restore") throw new Error("Action must be backup or restore.");

  const scope = request.scope || "all";
  if (!["all", "database", "table"].includes(scope)) throw new Error("Scope must be all, database or table.");

  const clean = {
    action,
    scope,
    database: "",
    table: "",
    onCluster: "",
    isAsync: request.async === true,
    exceptTables: [],
    exceptDatabases: [],
    baseBackup: "",
    backupId: "",
    settings: parseSettings(request.settings),
  };

  if (scope !== "all") clean.database = checkName(request.database, "Database");
  if (scope === "table") clean.table = checkName(request.table, "Table");

  if (request.onCluster) {
    clean.onCluster = String(request.onCluster).trim();
    if (!CLUSTER_NAME.test(clean.onCluster)) throw new Error(`Cluster "${clean.onCluster}" is not a valid name.`);
  }

  const exceptTables = toList(request.exceptTables);
  const exceptDatabases = toList(request.exceptDatabases);
  if (exceptTables.length && (action !== "backup" || scope === "table")) {
    throw new Error("EXCEPT TABLES works only for a backup of ALL or of a DATABASE.");
  }
  if (exceptDatabases.length && (action !== "backup" || scope !== "all")) {
    throw new Error("EXCEPT DATABASES works only for a backup of ALL.");
  }
  clean.exceptTables = exceptTables.map(checkTableName);
  clean.exceptDatabases = exceptDatabases.map((name) => checkName(name, "Database"));

  if (request.baseBackup) {
    if (action !== "backup") throw new Error("A base backup works only for a backup.");
    clean.baseBackup = checkBackupPath(request.baseBackup, "Base backup");
  }

  if (action === "restore") clean.backupId = checkBackupPath(request.backupId);

  return clean;
}

function pad(number) {
  return String(number).padStart(2, "0");
}

export function backupTimestamp(date = new Date()) {
  return `${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(date.getDate())}_${pad(date.getHours())}_${pad(date.getMinutes())}_${pad(date.getSeconds())}`;
}

// The ID of a new manual backup. It is also its folder under backups/.
export function makeBackupId(scope, database, table, timestamp) {
  if (scope === "table") return `manual/TABLE/${database}.${table}/MANUAL_${database}.${table}__${timestamp}`;
  if (scope === "database") return `manual/DATABASE/${database}/MANUAL_${database}__${timestamp}`;
  return `manual/ALL/MANUAL_ALL__${timestamp}`;
}

export function backupFolder(backupId) {
  return `backups/${backupId}/`;
}

// Builds the BACKUP or RESTORE statement from clean fields (see checkBackupRequest).
export function buildBackupSql(clean, storage, backupId) {
  const parts = [clean.action.toUpperCase()];

  if (clean.scope === "table") parts.push(`TABLE ${clean.database}.${clean.table}`);
  else if (clean.scope === "database") parts.push(`DATABASE ${clean.database}`);
  else parts.push("ALL");

  if (clean.exceptTables.length) parts.push(`EXCEPT TABLES ${clean.exceptTables.join(", ")}`);
  if (clean.exceptDatabases.length) parts.push(`EXCEPT DATABASES ${clean.exceptDatabases.join(", ")}`);

  if (clean.onCluster) parts.push(`ON CLUSTER ${sqlString(clean.onCluster)}`);

  parts.push(clean.action === "backup" ? "TO" : "FROM");
  parts.push(backupDestination(storage, backupFolder(backupId)));

  const settings = clean.settings.map((pair) => `${pair.name} = ${pair.value}`);
  if (clean.baseBackup) {
    settings.push(`base_backup = ${backupDestination(storage, backupFolder(clean.baseBackup))}`);
  }
  if (settings.length) parts.push(`SETTINGS ${settings.join(", ")}`);

  if (clean.isAsync) parts.push("ASYNC");

  return parts.join(" ");
}

// The manifest that the Available Backups scan reads.
export function makeManifest(clean, backupId, storage, createdAt = new Date()) {
  return {
    backup_id: backupId,
    display_name: backupId.split("/").pop(),
    backup_type: "manual",
    scope: clean.scope,
    database: clean.database || null,
    tables: clean.table || null,
    is_incremental: Boolean(clean.baseBackup),
    base_backup: clean.baseBackup || null,
    created_at: createdAt.toISOString(),
    s3_path: storageLocation(storage, backupFolder(backupId)),
  };
}

export function manifestInsertSql(storage, manifest) {
  return insertFileSql(storage, `${backupFolder(manifest.backup_id)}manifest.json`, JSON.stringify(manifest));
}

export function manifestScanSql(storage, pattern) {
  return `SELECT _path, data FROM ${rawBlobFunction(storage, `backups/${pattern}`)} LIMIT 500`;
}
