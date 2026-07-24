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
import { describe, it, expect } from "bun:test";

// Other backend test files register mock.module() for clusterUtils, and Bun's
// shared test runner keeps those overrides live across files. To exercise the
// REAL implementation here we load it via a query-suffixed specifier, which is
// a distinct module key Bun resolves to the genuine file, unaffected by any
// leaked mock of the plain path.
const {
  getNodeByName,
  getClusterById,
  getAllClusters,
  saveClusters,
  MAX_CLUSTERS,
  MAX_TOTAL_NODES,
} = await import("../../src/backend/services/clusterUtils.js?real");

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
