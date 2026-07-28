//aiCredentials.test.js - Unit tests for the Qurioz AI credential helper.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
import { describe, it, expect, beforeAll, mock } from "bun:test";

const getClusterNodes = mock(() => []);

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes,
  getAllClusters: mock(() => []),
  maskClusterPasswords: (c) => c,
  getClusterById: mock(() => null),
  getNodeByName: mock(() => null),
  saveClusters: mock(() => {}),
  getDefaultCluster: mock(() => null),
  migrateClusterData: mock(() => {}),
  MAX_CLUSTERS: 3,
  MAX_TOTAL_NODES: 18,
}));

const { initCrypto } = await import("../../src/backend/services/crypto.js");
const { resolveFromCluster, serialize, deserialize } = await import(
  "../../src/backend/servicesAI/aiCredentials.js"
);

beforeAll(() => {
  initCrypto("ai-credentials-test-secret-at-least-32-chars");
});

const NODES = [
  {
    name: "node1",
    host: "10.0.0.1",
    port: 9000,
    user: "chops",
    password: "stored-secret",
    secure: false,
  },
  {
    name: "node2",
    host: "10.0.0.2",
    port: 8123,
    user: "other",
    password: "second-secret",
    secure: false,
  },
];

describe("resolveFromCluster", () => {
  it("resolves credentials from the saved node", () => {
    getClusterNodes.mockReturnValue(NODES);

    const creds = resolveFromCluster({
      clusterId: "cluster1",
      node: "10.0.0.2",
      database: "analytics",
    });

    expect(creds).toEqual({
      host: "10.0.0.2",
      port: 8123,
      username: "other",
      password: "second-secret",
      database: "analytics",
    });
  });

  it("defaults to the first node when none is named", () => {
    getClusterNodes.mockReturnValue(NODES);

    const creds = resolveFromCluster({
      clusterId: "cluster1",
      database: "analytics",
    });

    expect(creds.host).toBe("10.0.0.1");
    expect(creds.port).toBe(9000);
  });

  it("rejects a host that is not in the configuration", () => {
    getClusterNodes.mockReturnValue(NODES);

    expect(() =>
      resolveFromCluster({
        clusterId: "cluster1",
        node: "169.254.169.254",
        database: "analytics",
      }),
    ).toThrow(/Node not found/);
  });

  it("rejects when no clusters are configured", () => {
    getClusterNodes.mockReturnValue([]);

    expect(() =>
      resolveFromCluster({ clusterId: "cluster1", database: "analytics" }),
    ).toThrow(/No cluster nodes configured/);
  });

  it("requires a database name", () => {
    getClusterNodes.mockReturnValue(NODES);

    expect(() =>
      resolveFromCluster({ clusterId: "cluster1", node: "10.0.0.1" }),
    ).toThrow(/database name is required/i);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a credential set", () => {
    const creds = {
      host: "10.0.0.1",
      port: 8123,
      username: "chops",
      password: "stored-secret",
      database: "analytics",
    };

    const restored = deserialize(serialize(creds));
    expect(restored).toEqual(creds);
  });

  it("does not store the password in plaintext", () => {
    const raw = serialize({
      host: "10.0.0.1",
      port: 8123,
      username: "chops",
      password: "stored-secret",
      database: "analytics",
    });

    expect(raw).not.toContain("stored-secret");
    expect(JSON.parse(raw).password).toBeUndefined();
    expect(JSON.parse(raw).encryptedPassword).toBeTruthy();
  });

  it("reads a legacy plaintext row", () => {
    const legacy = JSON.stringify({
      host: "10.0.0.1",
      port: 8123,
      username: "chops",
      password: "written-before-encryption",
      database: "analytics",
    });

    expect(deserialize(legacy).password).toBe("written-before-encryption");
  });

  it("handles an empty password", () => {
    const restored = deserialize(
      serialize({ host: "h", port: 8123, username: "u", password: "", database: "d" }),
    );
    expect(restored.password).toBe("");
  });
});
