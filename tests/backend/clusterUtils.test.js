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
  it("returns an empty array when there is no cluster data", () => {
    expect(getAllClusters()).toEqual([]);
  });
});
