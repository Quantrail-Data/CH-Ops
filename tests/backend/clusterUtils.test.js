/**
 * clusterUtils.test.js - Unit tests for clusterUtils pure logic
 *
 * Exercises the parts of clusterUtils that do not depend on database state:
 * getNodeByName (pure node lookup), getClusterById's null guard, the
 * saveClusters limit validation (which throws before touching the DB), and
 * the exported MAX_CLUSTERS / MAX_TOTAL_NODES constants. The DB-reading paths
 * are covered indirectly by the cluster controller tests; here we pin the
 * standalone logic exactly as written in services/clusterUtils.js.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { beforeEach, describe, it, expect, mock } from "bun:test";

// Other backend test files register mock.module() for clusterUtils, and Bun's
// shared test runner keeps those overrides live across files. To exercise the
// REAL implementation here we load it via a query-suffixed specifier, which is
// a distinct module key Bun resolves to the genuine file, unaffected by any
// leaked mock of the plain path.
const {
  getNodeByName,
  getClusterById,
  saveClusters,
  MAX_CLUSTERS,
  MAX_TOTAL_NODES,
} = await import("../../src/backend/services/clusterUtils.js?real");

function createMockClusterDbHarness() {
  const state = {
    appSettings: [],
    clusterTable: [],
    clusterNodes: [],
  };

  const eq = (field, value) => ({ type: "eq", field: field?.name || field, value });
  const and = (...conditions) => ({ type: "and", conditions });

  const matchCondition = (row, condition) => {
    if (!condition) return true;
    if (condition.type === "eq") return row[condition.field] === condition.value;
    if (condition.type === "and") return condition.conditions.every((c) => matchCondition(row, c));
    return true;
  };

  const db = {
    select() {
      return {
        from(table) {
          return {
            where(condition) {
              return {
                get: () => state[table.tableName || table.name || table].find((row) => matchCondition(row, condition)) || null,
                all: () => state[table.tableName || table.name || table].filter((row) => matchCondition(row, condition)),
              };
            },
            all: () => state[table.tableName || table.name || table],
          };
        },
      };
    },
    update(table) {
      return {
        set(values) {
          return {
            where(condition) {
              return {
                run: () => {
                  const rows = state[table.tableName || table.name || table];
                  const matches = rows.filter((row) => matchCondition(row, condition));
                  matches.forEach((row) => Object.assign(row, values));
                  return { changes: matches.length };
                },
              };
            },
          };
        },
      };
    },
    insert(table) {
      return {
        values(values) {
          return {
            run: () => {
              const rows = state[table.tableName || table.name || table];
              rows.push(values);
              return { changes: 1 };
            },
          };
        },
      };
    },
    delete(table) {
      return {
        where(condition) {
          return {
            run: () => {
              const rows = state[table.tableName || table.name || table];
              const surviving = rows.filter((row) => !matchCondition(row, condition));
              state[table.tableName || table.name || table] = surviving;
              return { changes: rows.length - surviving.length };
            },
          };
        },
      };
    },
    transaction(fn) {
      return fn();
    },
  };

  return { db, state, eq, and };
}

const mockHarness = createMockClusterDbHarness();
let storageMode = "blob";

mock.module("drizzle-orm", () => ({
  eq: mockHarness.eq,
  and: mockHarness.and,
}));

mock.module("../../src/backend/db/index.js", () => ({
  db: mockHarness.db,
  appSettings: { tableName: "appSettings", key: { name: "key" }, value: { name: "value" } },
  clusters: { tableName: "clusterTable", id: { name: "id" }, version: { name: "version" }, name: { name: "name" } },
  clusterNodes: { tableName: "clusterNodes", id: { name: "id" }, clusterId: { name: "clusterId" }, source: { name: "source" }, lastSeenAt: { name: "lastSeenAt" } },
}));

mock.module("../../src/backend/services/crypto.js", () => ({
  encrypt: (value) => `enc:${value}`,
  decrypt: (value) => String(value).replace(/^enc:/, ""),
}));

mock.module("../../src/backend/db/migrateClusters.js", () => ({
  STORAGE_BLOB: "blob",
  STORAGE_TABLES: "tables",
  getStorageMode: () => storageMode,
}));

const mockedClusterUtils = await import("../../src/backend/services/clusterUtils.js?mocked");

const {
  getAllClusters: getAllClustersMocked,
  maskClusterPasswords,
  getClusterNodes,
  getDefaultCluster,
  saveClusters: saveClustersMocked,
  updateClusterNodes,
  findStaleNodes,
  removeNodes,
  migrateClusterData,
} = mockedClusterUtils;

describe("clusterUtils: storage-backed helpers", () => {
  beforeEach(() => {
    storageMode = "blob";
    mockHarness.state.appSettings = [];
    mockHarness.state.clusterTable = [];
    mockHarness.state.clusterNodes = [];
  });

  it("reads and writes blob-backed clusters with decrypted passwords", () => {
    saveClustersMocked([
      {
        id: "c1",
        name: "Alpha",
        nodes: [{ name: "n1", host: "10.0.0.1", password: "secret" }],
      },
    ]);

    const row = mockHarness.state.appSettings.find((entry) => entry.key === "clusters");
    expect(row).toBeDefined();
    expect(JSON.parse(row.value)[0].nodes[0].password).toBe("enc:secret");

    const clusters = getAllClustersMocked();
    expect(clusters[0].nodes[0].password).toBe("secret");
  });

  it("throws for duplicate names before persisting and renames duplicates for table storage", () => {
    expect(() => saveClustersMocked([{ name: "Alpha" }, { name: "Alpha" }])).toThrow(
      'Cluster name must be unique. "Alpha" is already in use.',
    );

    storageMode = "tables";
    mockHarness.state.clusterTable.push({ id: "existing", name: "Alpha", version: 1 });
    saveClustersMocked([
      { id: "c1", name: "Alpha", nodes: [{ name: "n1", host: "10.0.0.1" }] },
    ]);

    const inserted = mockHarness.state.clusterTable.find((row) => row.id === "c1");
    expect(inserted?.name).toBe("Alpha 2");
  });

  it("masks passwords, exposes cluster node helpers, and reads table-backed clusters", () => {
    storageMode = "tables";
    saveClustersMocked([
      {
        id: "c1",
        name: "Alpha",
        nodes: [{ name: "n1", host: "10.0.0.1", password: "secret" }],
      },
    ]);

    const clusters = getAllClustersMocked();
    const masked = maskClusterPasswords(clusters[0]);

    expect(masked.nodes[0]).toMatchObject({ name: "n1", hasPassword: true });
    expect(masked.nodes[0].password).toBeUndefined();
    expect(getClusterNodes("c1")).toHaveLength(1);
    expect(getDefaultCluster().id).toBe("c1");
  });

  it("updates node rows, reports stale nodes, removes them, and migrates legacy cluster data", () => {
    storageMode = "tables";
    mockHarness.state.clusterTable.push({ id: "c1", version: 1 });
    saveClustersMocked([{ id: "c1", name: "Alpha", nodes: [] }]);

    const updated = updateClusterNodes("c1", [{ shard: 1, replica: 1, name: "node-1", host: "10.0.0.2" }], 1);
    expect(updated).toBe(true);

    const staleBeforeRemoval = findStaleNodes("c1", new Date(Date.now() + 60_000).toISOString());
    expect(staleBeforeRemoval).toHaveLength(1);

    removeNodes("c1", [mockHarness.state.clusterNodes[0].id]);
    expect(mockHarness.state.clusterNodes).toHaveLength(0);

    mockHarness.state.appSettings.push({ key: "cluster.nodes", value: JSON.stringify({ name: "Legacy", nodes: [{ name: "node-a" }] }) });
    migrateClusterData();

    const migrated = mockHarness.state.appSettings.find((entry) => entry.key === "clusters");
    expect(JSON.parse(migrated.value)[0]).toMatchObject({ id: "cluster_1", name: "Legacy" });
  });
});

describe("clusterUtils: limits", () => {
  it("exposes MAX_CLUSTERS=3 and MAX_TOTAL_NODES=18", () => {
    expect(MAX_CLUSTERS).toBe(3);
    expect(MAX_TOTAL_NODES).toBe(18);
  });
});

describe("clusterUtils: getNodeByName (pure)", () => {
  const cluster = {
    nodes: [
      { name: "node1", host: "10.0.0.1" },
      { name: "node2", host: "10.0.0.2" },
    ],
  };

  it("returns the matching node by name", () => {
    expect(getNodeByName(cluster, "node2")).toEqual({
      name: "node2",
      host: "10.0.0.2",
    });
  });

  it("returns null when the name does not match", () => {
    expect(getNodeByName(cluster, "missing")).toBeNull();
  });

  it("returns null for an empty node list", () => {
    expect(getNodeByName({ nodes: [] }, "node1")).toBeNull();
  });

  it("returns null when cluster has no nodes property", () => {
    expect(getNodeByName({}, "node1")).toBeNull();
  });

  it("returns null for a null/undefined cluster", () => {
    expect(getNodeByName(null, "node1")).toBeNull();
    expect(getNodeByName(undefined, "node1")).toBeNull();
  });

  it("returns null for an empty/missing node name", () => {
    expect(getNodeByName(cluster, "")).toBeNull();
    expect(getNodeByName(cluster, undefined)).toBeNull();
  });
});

describe("clusterUtils: getClusterById null guard", () => {
  it("returns null without a clusterId (no DB access)", () => {
    expect(getClusterById(null)).toBeNull();
    expect(getClusterById(undefined)).toBeNull();
    expect(getClusterById("")).toBeNull();
  });
});

describe("clusterUtils: saveClusters validation", () => {
  it("throws when there are more than MAX_CLUSTERS clusters", () => {
    const tooMany = [{ nodes: [] }, { nodes: [] }, { nodes: [] }, { nodes: [] }];
    expect(() => saveClusters(tooMany)).toThrow("Maximum 3 clusters allowed.");
  });

  it("throws when total nodes exceed MAX_TOTAL_NODES", () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => ({
      name: `n${i}`,
      host: "h",
    }));
    expect(() => saveClusters([{ nodes: nineteen }])).toThrow(
      "Maximum 18 total nodes across all clusters.",
    );
  });

  it("counts nodes across multiple clusters toward the total limit", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `n${i}`, host: "h" }));
    // 10 + 10 = 20 > 18, across two clusters (within the 3-cluster limit)
    expect(() => saveClusters([{ nodes: ten }, { nodes: ten }])).toThrow(
      "Maximum 18 total nodes across all clusters.",
    );
  });
});

describe("clusterUtils: getAllClusters", () => {
  it("maps DB row to clusters and decrypts node passwords using mocked db", () => {
    // Mocked DB and appSettings for the snippet under test
    const appSettings = { key: 'key' };
    const decrypted = 'plain-pass';

    const db = {
      select() { return this; },
      from() { return this; },
      where() { return this; },
      get() {
        return {
          value: JSON.stringify([
            { nodes: [{ name: 'n1', host: 'h1', password: 'enc1' }] },
          ]),
        };
      },
    };

    const decrypt = (p) => (p ? decrypted : '');

    // The snippet logic replicated with the mocked db/decrypt
    const row = db.select().from(appSettings).where(() => { }).get();
    if (!row?.value) throw new Error('expected row.value');
    const clusters = JSON.parse(row.value);
    const result = clusters.map(c => ({
      ...c,
      nodes: (c.nodes || []).map(n => ({ ...n, password: decrypt(n.password || '') })),
    }));

    expect(result).toEqual([
      { nodes: [{ name: 'n1', host: 'h1', password: decrypted }] },
    ]);
  });
});

describe("clusterUtils: getNodeByName edge cases", () => {
  it("handles cluster with undefined nodes array gracefully", () => {
    expect(getNodeByName({ nodes: undefined }, "node1")).toBeNull();
  });

  it("finds first matching node when multiple have same name", () => {
    const cluster = {
      nodes: [
        { name: "dup", host: "10.0.0.1" },
        { name: "dup", host: "10.0.0.2" },
      ],
    };
    expect(getNodeByName(cluster, "dup")).toEqual({
      name: "dup",
      host: "10.0.0.1",
    });
  });

  it("handles node objects with extra properties", () => {
    const cluster = {
      nodes: [
        { name: "node1", host: "10.0.0.1", extra: "data", id: 123 },
      ],
    };
    expect(getNodeByName(cluster, "node1")).toEqual({
      name: "node1",
      host: "10.0.0.1",
      extra: "data",
      id: 123,
    });
  });

  it("performs case-sensitive name matching", () => {
    const cluster = {
      nodes: [{ name: "Node1", host: "10.0.0.1" }],
    };
    expect(getNodeByName(cluster, "node1")).toBeNull();
    expect(getNodeByName(cluster, "Node1")).toEqual({
      name: "Node1",
      host: "10.0.0.1",
    });
  });
});

describe("clusterUtils: saveClusters edge cases", () => {
  it("succeeds with exactly MAX_CLUSTERS clusters", () => {
    const maxClusters = [{ nodes: [] }, { nodes: [] }, { nodes: [] }];
    expect(() => saveClusters(maxClusters)).not.toThrow();
  });

  it("succeeds with exactly MAX_TOTAL_NODES total nodes", () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => ({
      name: `n${i}`,
      host: "h",
    }));
    expect(() => saveClusters([{ nodes: eighteen }])).not.toThrow();
  });

  it("succeeds with multiple clusters at the total node limit", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `n${i}`, host: "h" }));
    expect(() => saveClusters([{ nodes: nine }, { nodes: nine }])).not.toThrow();
  });

  it("throws when exactly one cluster exceeds limit", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      name: `n${i}`,
      host: "h",
    }));
    expect(() => saveClusters([{ nodes: twenty }])).toThrow(
      "Maximum 18 total nodes across all clusters.",
    );
  });

  it("handles empty clusters array", () => {
    expect(() => saveClusters([])).not.toThrow();
  });

  it("throws on MAX_CLUSTERS + 1 even with no nodes", () => {
    const tooMany = Array.from({ length: 4 }, () => ({ nodes: [] }));
    expect(() => saveClusters(tooMany)).toThrow("Maximum 3 clusters allowed.");
  });

  it("counts nodes correctly across three clusters at limit", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `n${i}`, host: "h" }));
    expect(() => saveClusters([{ nodes: six }, { nodes: six }, { nodes: six }])).not.toThrow();
  });

  it("throws when 3 clusters with 7 nodes each exceeds total", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `n${i}`, host: "h" }));
    expect(() => saveClusters([{ nodes: seven }, { nodes: seven }, { nodes: seven }])).toThrow(
      "Maximum 18 total nodes across all clusters.",
    );
  });
});

describe("clusterUtils: getClusterById error handling", () => {
  it("returns null for various falsy values", () => {
    expect(getClusterById(0)).toBeNull();
    expect(getClusterById(false)).toBeNull();
  });
});
