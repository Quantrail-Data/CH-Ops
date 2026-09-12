
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { aiDdlCache, appSettings } from "../db/schema.js";
import { getCredSession } from "../services/chCredStore.js";
import { getClusterNodes } from "../services/clusterUtils.js";
import { executeQuery } from "../services/clickhouse.js";
import { SETTING_KEYS } from "./constants.js";

// Tests inject an isolated in-memory database so they never touch real data;
// production code never calls this. Same arrangement as chCredStore.
let activeDb = defaultDb;
export function __setDb(d) {
  activeDb = d || defaultDb;
}

// Matches the value db/migrate.js seeds, so a database whose setting row was
// deleted behaves like a fresh one rather than caching forever or not at all.
const DEFAULT_TTL_MINUTES = 60;

function ttlMinutes() {
  try {
    const row = activeDb
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTING_KEYS.DDL_CACHE_TTL_MINUTES))
      .get();
    const n = parseInt(row?.value, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MINUTES;
  } catch {
    return DEFAULT_TTL_MINUTES;
  }
}

function httpError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

// Backtick-quote an identifier, doubling any backtick inside it. The database
// and table names arrive from the user's selection, so they are never
// interpolated raw - this is the only place SQL text is built from them.
function quoteIdent(name) {
  const s = String(name ?? "");
  if (!s) throw new Error("A database and table name are required.");
  return `\`${s.replace(/`/g, "``")}\``;
}

// Resolve where to connect and as whom.
//
// getCredSession supplies the ClickHouse user and password but not the host or
// TLS flag, so the node is looked up in the cluster configuration - which also
// means only a configured host can be reached (SSRF prevention), matching the
// guard in controllers/query.js.
export function resolveTarget({ jti, context, clusterId, node }) {
  const sess = getCredSession(jti, context);
  if (!sess) {
    throw httpError(
      "Your session expired. Please reconnect with your ClickHouse credentials.",
      401,
      "CRED_SESSION_EXPIRED",
    );
  }

  const effectiveClusterId = clusterId ?? sess.clusterId ?? null;
  const nodes = getClusterNodes(effectiveClusterId);
  if (nodes.length === 0) throw httpError("No cluster nodes configured.", 400);

  const wantedHost = node ?? sess.node ?? null;
  const target = wantedHost ? nodes.find((n) => n.name === wantedHost) : nodes[0];
  if (!target) throw httpError("Node not found in cluster configuration.", 400);

  return {
    clusterId: effectiveClusterId ?? "",
    host: target.host,
    port: target.port || 8123,
    secure: !!target.secure,
    user: sess.chUser,
    password: sess.password,
  };
}

// ClickHouse returns the statement under `statement` on some versions and under
// the literal column name "SHOW CREATE TABLE" on others; the third branch takes
// whatever single column came back. Same fallback the editor uses.
function extractDdl(result) {
  const row = result?.rows?.[0];
  if (!row) return null;
  return (
    row.statement ||
    row["SHOW CREATE TABLE"] ||
    row[Object.keys(row)[0]] ||
    null
  );
}

function readCache({ clusterId, node, database, table }) {
  return activeDb
    .select()
    .from(aiDdlCache)
    .where(
      and(
        eq(aiDdlCache.clusterId, clusterId),
        eq(aiDdlCache.node, node),
        eq(aiDdlCache.databaseName, database),
        eq(aiDdlCache.tableName, table),
      ),
    )
    .get();
}

function writeCache({ clusterId, node, database, table, ddl }) {
  const row = {
    clusterId,
    node,
    databaseName: database,
    tableName: table,
    ddl,
    charCount: ddl.length,
    fetchedAt: new Date().toISOString(),
  };

  // The Phase 1 composite unique is what makes this an upsert rather than a
  // read-then-write race.
  activeDb
    .insert(aiDdlCache)
    .values(row)
    .onConflictDoUpdate({
      target: [
        aiDdlCache.clusterId,
        aiDdlCache.node,
        aiDdlCache.databaseName,
        aiDdlCache.tableName,
      ],
      set: { ddl: row.ddl, charCount: row.charCount, fetchedAt: row.fetchedAt },
    })
    .run();
}

function isFresh(row, ttlMs) {
  if (!row?.fetchedAt) return false;
  const at = Date.parse(row.fetchedAt);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < ttlMs;
}

// -> { results: [{ database, table, ddl, charCount, cached }], failures: [{ table, error }] }
//
// One table failing does not fail the batch: a dropped or unreadable table lands
// in `failures` and the rest of the selection still reaches the prompt.
export async function fetchDdl({
  jti,
  context,
  clusterId,
  node,
  tables,
  forceRefresh = false,
}) {
  const results = [];
  const failures = [];

  const list = Array.isArray(tables) ? tables : [];
  if (list.length === 0) return { results, failures };

  // Credential and target failures are not per-table, so they throw rather than
  // producing a failure entry for every table in the selection.
  const target = resolveTarget({ jti, context, clusterId, node });
  const ttlMs = ttlMinutes() * 60 * 1000;

  for (const entry of list) {
    const database = entry?.database;
    const table = entry?.table;
    const label = `${database ?? "?"}.${table ?? "?"}`;

    try {
      if (!database || !table) {
        throw new Error("A database and table name are required.");
      }

      const key = { clusterId: target.clusterId, node: target.host, database, table };

      if (!forceRefresh) {
        const cached = readCache(key);
        if (cached && isFresh(cached, ttlMs)) {
          results.push({
            database,
            table,
            ddl: cached.ddl,
            charCount: cached.charCount,
            cached: true,
          });
          continue;
        }
      }

      const result = await executeQuery({
        host: target.host,
        port: target.port,
        secure: target.secure,
        user: target.user,
        password: target.password,
        sql: `SHOW CREATE TABLE ${quoteIdent(database)}.${quoteIdent(table)}`,
        readOnly: true,
      });

      const ddl = extractDdl(result);
      if (!ddl) throw new Error("No DDL returned.");

      writeCache({ ...key, ddl });
      results.push({ database, table, ddl, charCount: ddl.length, cached: false });
    } catch (err) {
      failures.push({ table: label, error: err?.message || String(err) });
    }
  }

  return { results, failures };
}

// SELECT over system.databases rather than SHOW DATABASES: it returns a named
// column and a stable order, which SHOW does not guarantee.
export async function listDatabases({ jti, context, clusterId, node }) {
  const target = resolveTarget({ jti, context, clusterId, node });

  const result = await executeQuery({
    host: target.host,
    port: target.port,
    secure: target.secure,
    user: target.user,
    password: target.password,
    sql: "SELECT name FROM system.databases ORDER BY name",
    readOnly: true,
  });

  return (result?.rows || []).map((r) => r.name).filter(Boolean);
}

// Tables in the given databases, for the selection step. Read from
// system.tables rather than SHOW TABLES for the same reason as above, and in
// one query rather than one per database.
//
// The database names are values here, not identifiers, so they go through
// executeQuery's parameter binding rather than into the SQL text. Views and
// dictionaries are included: they are queryable, and DDL exists for them.
export async function listTables({ jti, context, clusterId, node, databases }) {
  const wanted = (Array.isArray(databases) ? databases : []).filter(Boolean);
  if (wanted.length === 0) return [];

  const target = resolveTarget({ jti, context, clusterId, node });

  const result = await executeQuery({
    host: target.host,
    port: target.port,
    secure: target.secure,
    user: target.user,
    password: target.password,
    sql: `SELECT database, name, engine
            FROM system.tables
           WHERE database IN ({databases:Array(String)})
           ORDER BY database, name`,
    params: { databases: `['${wanted.map((d) => d.replace(/'/g, "\\'")).join("','")}']` },
    readOnly: true,
  });

  return (result?.rows || []).map((r) => ({
    database: r.database,
    table: r.name,
    engine: r.engine ?? null,
  }));
}
