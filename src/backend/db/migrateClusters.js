// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy
// Moves cluster configuration out of the JSON blob into relational tables, with verification and rollback.

import { eq } from 'drizzle-orm';
import { db, appSettings } from './index.js';

export const STORAGE_FLAG_KEY = 'clusters.storage';
export const STORAGE_BLOB = 'blob';
export const STORAGE_TABLES = 'tables';

function readSetting(key) {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

function writeSetting(key, value, category = 'cluster') {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) {
    db.update(appSettings).set({ value }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, category }).run();
  }
}

export function getStorageMode() {
  return readSetting(STORAGE_FLAG_KEY) || STORAGE_BLOB;
}

// Go back to reading the JSON blob.
export function rollbackToBlob() {
  writeSetting(STORAGE_FLAG_KEY, STORAGE_BLOB);
}

// Step 2 of the procedure: parse and validate, touching nothing.
export function inspectBlob(rawValue) {
  const result = { clusters: 0, nodes: 0, problems: [], parsed: null };

  if (!rawValue) {
    result.problems.push('No clusters key present. Treating as a fresh install.');
    return result;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (err) {
    result.problems.push(`Cluster configuration is not valid JSON: ${err.message}`);
    return result;
  }

  if (!Array.isArray(parsed)) {
    result.problems.push('Cluster configuration is not an array.');
    return result;
  }

  const seenClusterIds = new Set();
  for (const cluster of parsed) {
    if (!cluster?.id) result.problems.push('A cluster has no id.');
    if (!cluster?.name) result.problems.push(`Cluster ${cluster?.id} has no name.`);
    if (cluster?.id && seenClusterIds.has(cluster.id)) {
      result.problems.push(`Duplicate cluster id: ${cluster.id}`);
    }
    if (cluster?.id) seenClusterIds.add(cluster.id);

    const nodes = Array.isArray(cluster?.nodes) ? cluster.nodes : [];
    const seenNodeNames = new Set();
    for (const node of nodes) {
      if (!node?.host) {
        result.problems.push(`A node in cluster ${cluster?.id} has no host.`);
      }
      const name = node?.name || '';
      if (seenNodeNames.has(name)) {
        result.problems.push(`Duplicate node name "${name}" in cluster ${cluster?.id}`);
      }
      seenNodeNames.add(name);
    }
    result.nodes += nodes.length;
  }

  result.clusters = parsed.length;
  result.parsed = parsed;
  return result;
}

// Raw SQL to match the rest of migrate.js, and safe to run repeatedly.
export function createClusterTables(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cluster (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'direct',
      version INTEGER NOT NULL DEFAULT 1,
      ch_user TEXT,
      ch_password_enc TEXT,
      port INTEGER,
      secure INTEGER NOT NULL DEFAULT 0,
      k8s_connection_id TEXT,
      k8s_namespace TEXT,
      k8s_installation TEXT,
      k8s_operator TEXT NOT NULL DEFAULT 'akoc',
      last_refreshed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cluster_node (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id TEXT NOT NULL,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 8123,
      user TEXT,
      password_enc TEXT,
      secure INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      shard INTEGER,
      replica INTEGER,
      pod_name TEXT,
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (cluster_id, name)
    );
    CREATE TABLE IF NOT EXISTS k8s_connection (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_address TEXT NOT NULL,
      ca_certificate TEXT NOT NULL,
      token_enc TEXT NOT NULL,
      namespaces_json TEXT,
      affinity_ok INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cluster_node_cluster ON cluster_node(cluster_id);
  `);

  ensureUniqueClusterName(sqlite);
}

// Enforce unique cluster names at the table, not just in application code.
export function ensureUniqueClusterName(sqlite, log = console.log) {
  try {
    sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_name_unique ON cluster(name COLLATE NOCASE)',
    );
    return { ok: true };
  } catch (err) {
    const dupes = sqlite
      .query(
        `SELECT name, COUNT(*) AS n FROM cluster
         GROUP BY lower(trim(name)) HAVING n > 1`,
      )
      .all();

    const names = dupes.map((d) => `"${d.name}" (${d.n})`).join(', ');
    log(
      '  Cluster names: could not enforce uniqueness because duplicates already exist: ' +
        (names || err.message),
    );
    log('  Rename one of each pair, then restart to apply the constraint.');
    return { ok: false, duplicates: dupes };
  }
}

// Compare what landed in the tables against the source blob.
export function verifyMigration(sqlite, sourceClusters) {
  const problems = [];

  const clusterRows = sqlite.query('SELECT id, name FROM cluster').all();
  if (clusterRows.length !== sourceClusters.length) {
    problems.push(
      `Cluster count mismatch: blob has ${sourceClusters.length}, tables have ${clusterRows.length}.`,
    );
  }

  const expectedNodeCount = sourceClusters.reduce(
    (sum, c) => sum + (c.nodes?.length || 0),
    0,
  );
  const nodeRows = sqlite
    .query('SELECT cluster_id, name, host, password_enc FROM cluster_node')
    .all();
  if (nodeRows.length !== expectedNodeCount) {
    problems.push(
      `Node count mismatch: blob has ${expectedNodeCount}, tables have ${nodeRows.length}.`,
    );
  }

  // Ciphertext must be identical.
  const byKey = new Map();
  for (const row of nodeRows) byKey.set(`${row.cluster_id}::${row.name}`, row);

  for (const cluster of sourceClusters) {
    for (const node of cluster.nodes || []) {
      const key = `${cluster.id}::${node.name || ''}`;
      const row = byKey.get(key);
      if (!row) {
        problems.push(`Node missing from tables: ${key}`);
        continue;
      }
      if (row.password_enc !== (node.password ?? '')) {
        problems.push(`Password ciphertext changed for ${key}`);
      }
      if (row.host !== node.host) {
        problems.push(`Host changed for ${key}`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

// Run the migration.
export function migrateClustersToTables(sqlite, { dryRun = false, log = console.log } = {}) {
  // Step 1.
  if (getStorageMode() === STORAGE_TABLES) {
    // Still apply the name constraint.
    ensureUniqueClusterName(sqlite, log);
    return { migrated: false, reason: 'already-migrated', clusters: 0, nodes: 0, problems: [] };
  }

  // Step 2.
  const raw = readSetting('clusters');
  const inspection = inspectBlob(raw);

  if (!raw) {
    // Fresh install: create the tables and mark it done.
    if (!dryRun) {
      createClusterTables(sqlite);
      writeSetting(STORAGE_FLAG_KEY, STORAGE_TABLES);
    }
    log('  Cluster storage: fresh install, tables created.');
    return { migrated: !dryRun, reason: 'fresh-install', clusters: 0, nodes: 0, problems: [] };
  }

  if (!inspection.parsed) {
    log('  Cluster storage: ABORTED. ' + inspection.problems.join(' '));
    return {
      migrated: false,
      reason: 'invalid-blob',
      clusters: 0,
      nodes: 0,
      problems: inspection.problems,
    };
  }

  log(`  Cluster storage: found ${inspection.clusters} clusters, ${inspection.nodes} nodes.`);
  for (const p of inspection.problems) log(`  Warning: ${p}`);

  if (dryRun) {
    log('  Dry run. No changes written.');
    return {
      migrated: false,
      reason: 'dry-run',
      clusters: inspection.clusters,
      nodes: inspection.nodes,
      problems: inspection.problems,
    };
  }

  // Step 3.
  const backupKey = `clusters.bak.${Math.floor(Date.now() / 1000)}`;
  writeSetting(backupKey, raw);
  log(`  Cluster storage: blob backed up to ${backupKey}`);

  // Step 4.
  createClusterTables(sqlite);

  const insertCluster = sqlite.prepare(
    `INSERT INTO cluster (id, name, kind, version, port, secure)
     VALUES (?, ?, 'direct', 1, ?, ?)`,
  );
  const insertNode = sqlite.prepare(
    `INSERT INTO cluster_node
       (cluster_id, name, host, port, user, password_enc, secure, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
  );

  const runInsert = sqlite.transaction((list) => {
    for (const cluster of list) {
      const firstNode = cluster.nodes?.[0];
      insertCluster.run(
        cluster.id,
        cluster.name,
        firstNode?.port ?? 8123,
        firstNode?.secure ? 1 : 0,
      );
      for (const node of cluster.nodes || []) {
        insertNode.run(
          cluster.id,
          node.name || '',
          node.host,
          node.port ?? 8123,
          node.user || 'default',
          // Ciphertext copied verbatim.
          node.password ?? '',
          node.secure ? 1 : 0,
        );
      }
    }
  });

  runInsert(inspection.parsed);

  // Step 5.
  const verification = verifyMigration(sqlite, inspection.parsed);
  if (!verification.ok) {
    // The tables stay, the flag does not move.
    log('  Cluster storage: VERIFICATION FAILED. ' + verification.problems.join(' '));
    return {
      migrated: false,
      reason: 'verification-failed',
      clusters: inspection.clusters,
      nodes: inspection.nodes,
      problems: verification.problems,
    };
  }

  // Step 6.
  writeSetting(STORAGE_FLAG_KEY, STORAGE_TABLES);
  log('  Cluster storage: migrated to tables.');

  return {
    migrated: true,
    reason: 'migrated',
    clusters: inspection.clusters,
    nodes: inspection.nodes,
    problems: [],
  };
}
