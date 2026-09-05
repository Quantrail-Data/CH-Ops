// Copyright (C) 2026 Quantrail™ Data Private Limited
// cluster-tls-sync.test.js - Integration tests for TLS/port synchronization fix
// Tests the complete flow of enabling TLS on a cluster and verifying nodes are synced

import { describe, it, expect, beforeEach, mock } from "bun:test";

const getAllClusters = mock(() => {});
const saveClusters = mock(() => {});
const getClusterById = mock(() => {});
const getNodeByName = mock(() => {});
const maskClusterPasswords = (cluster) => ({
  ...cluster,
  nodes: (cluster.nodes || []).map(({ password, ...rest }) => ({
    ...rest,
    hasPassword: !!password,
  })),
});

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters,
  saveClusters,
  getClusterById,
  getNodeByName,
  maskClusterPasswords,
  MAX_CLUSTERS: 3,
  MAX_TOTAL_NODES: 18,
}));

mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: mock(() => {}),
  executeQueryWithBody: mock(() => {}),
}));

const { updateCluster } = await import("../../src/backend/controllers/cluster.js");

function mockReqRes(body = {}, params = {}) {
  const req = {
    body,
    params,
    user: {
      username: "admin",
      role: "admin",
    },
  };

  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };

  return { req, res };
}

describe("TLS/Port Synchronization Integration Tests", () => {
  beforeEach(() => {
    mock.restore();
    getAllClusters.mockReset();
    saveClusters.mockReset();
  });

  it("Scenario: K8s cluster with TLS disabled, then enabled", () => {
    const scenario = "K8s cluster initially without TLS, then admin enables TLS";

    // Initial state: K8s cluster with HTTP (no TLS)
    const initialCluster = {
      id: "k8s_prod_ch",
      name: "Production ClickHouse",
      kind: "k8s",
      port: 8123,
      secure: false,
      endpoint: "clickhouse.example.com",
      chUser: "chops",
      chPassword: "secret",
      k8s: {
        connectionId: "conn1",
        namespace: "production",
        installation: "clickhouse",
        operator: "akoc",
      },
      nodes: [
        {
          name: "ch-0",
          host: "10.0.0.10",
          port: 8123,
          secure: false,
          user: "chops",
          password: "secret",
          source: "k8s",
          shard: 1,
          replica: 1,
        },
        {
          name: "ch-1",
          host: "10.0.0.11",
          port: 8123,
          secure: false,
          user: "chops",
          password: "secret",
          source: "k8s",
          shard: 1,
          replica: 2,
        },
        {
          name: "ch-2",
          host: "10.0.0.12",
          port: 8123,
          secure: false,
          user: "chops",
          password: "secret",
          source: "k8s",
          shard: 1,
          replica: 3,
        },
      ],
    };

    getAllClusters.mockReturnValue([initialCluster]);

    const { req, res } = mockReqRes(
      { port: 8443, secure: true },
      { id: "k8s_prod_ch" }
    );

    updateCluster(req, res);

    // Verify response
    expect(res.statusCode).toBe(200);
    expect(res.jsonData.port).toBe(8443);
    expect(res.jsonData.secure).toBe(true);

    // Verify all nodes were synced
    expect(saveClusters).toHaveBeenCalledTimes(1);
    const saved = saveClusters.mock.calls[0][0];
    const savedCluster = saved[0];

    expect(savedCluster.port).toBe(8443);
    expect(savedCluster.secure).toBe(true);

    // Check all three nodes were updated
    expect(savedCluster.nodes.length).toBe(3);
    for (const node of savedCluster.nodes) {
      expect(node.port).toBe(8443);
      expect(node.secure).toBe(true);
      // Other properties preserved
      expect(node.user).toBe("chops");
      expect(node.password).toBe("secret");
    }
  });

  it("Scenario: Query execution uses correct port after TLS enabled", () => {
    const scenario =
      "After TLS is enabled and nodes synced, queries should use HTTPS port";

    const clusterBeforeUpdate = {
      id: "k8s_test",
      name: "Test Cluster",
      kind: "k8s",
      port: 8123,
      secure: false,
      nodes: [
        {
          name: "node1",
          host: "clickhouse.local",
          port: 8123,
          secure: false,
          user: "default",
          password: "",
        },
      ],
    };

    getAllClusters.mockReturnValue([clusterBeforeUpdate]);

    const { req, res } = mockReqRes({ secure: true, port: 8443 }, { id: "k8s_test" });

    updateCluster(req, res);

    const saved = saveClusters.mock.calls[0][0];
    const updatedCluster = saved[0];

    // When a query later uses this cluster, it will:
    // 1. Get targetNode from cluster.nodes
    // 2. Use targetNode.port (should be 8443)
    // 3. Use targetNode.secure (should be true)
    // 4. Build URL as https://clickhouse.local:8443/

    const nodeForQuery = updatedCluster.nodes[0];
    const expectedProto = nodeForQuery.secure ? "https" : "http";
    const expectedUrl = `${expectedProto}://clickhouse.local:${nodeForQuery.port}/`;

    expect(expectedUrl).toBe("https://clickhouse.local:8443/");
  });

  it("Scenario: Configuration mismatch warning is shown", () => {
    const clusterWithMismatch = {
      id: "cluster1",
      name: "Mismatched Cluster",
      port: 8443,
      secure: true,
      nodes: [
        {
          name: "node1",
          host: "ch1.local",
          port: 8123, // MISMATCH: cluster says 8443
          secure: false, // MISMATCH: cluster says true
        },
        {
          name: "node2",
          host: "ch2.local",
          port: 8443, // correct
          secure: true, // correct
        },
      ],
    };

    getAllClusters.mockReturnValue([clusterWithMismatch]);

    const { req, res } = mockReqRes({ name: "Mismatched Cluster" }, { id: "cluster1" });

    updateCluster(req, res);

    // Should include a warning about the mismatch
    expect(res.jsonData._warning).toBeDefined();
    expect(res.jsonData._warning).toContain("Cluster uses port 8443");
    expect(res.jsonData._warning).toContain("node1");
    expect(res.jsonData._warning).toContain("but");
    expect(res.jsonData._warning).toContain("differ");
  });

  it("Scenario: Kubernetes auto-scaling gets correct config on new nodes", () => {
    // Scenario: K8s cluster with TLS enabled. Auto-scaler adds new pod.
    // The new node should get the cluster's TLS/port configuration.

    const clusterWithNewNode = {
      id: "k8s_autoscaled",
      name: "Autoscaled Cluster",
      kind: "k8s",
      port: 8443, // TLS enabled
      secure: true,
      nodes: [
        {
          name: "ch-0",
          host: "ch-0.local",
          port: 8443,
          secure: true,
        },
        {
          name: "ch-1",
          host: "ch-1.local",
          port: 8443,
          secure: true,
        },
        {
          // New node discovered during refresh
          name: "ch-2",
          host: "ch-2.local",
          port: 8443, // Should be 8443 from cluster config
          secure: true, // Should be true from cluster config
        },
      ],
    };

    getAllClusters.mockReturnValue([clusterWithNewNode]);

    const { req, res } = mockReqRes({ name: "Autoscaled Cluster" }, { id: "k8s_autoscaled" });

    updateCluster(req, res);

    expect(res.statusCode).toBe(200);
    const saved = saveClusters.mock.calls[0][0];

    // All nodes, including new ones, have correct config
    for (const node of saved[0].nodes) {
      expect(node.port).toBe(8443);
      expect(node.secure).toBe(true);
    }
  });

  it("Scenario: User creates query immediately after enabling TLS", () => {
    // The critical scenario: user enables TLS, saves, then tries to run a query
    // The query should succeed because all nodes are synced to TLS config

    const clusterHTTP = {
      id: "prod",
      name: "Production",
      kind: "k8s",
      port: 8123,
      secure: false,
      nodes: [
        { name: "node1", host: "prod-ch.local", port: 8123, secure: false },
        { name: "node2", host: "prod-ch.local", port: 8123, secure: false },
      ],
    };

    getAllClusters.mockReturnValue([clusterHTTP]);

    // Admin enables TLS
    const { req, res } = mockReqRes({ port: 8443, secure: true }, { id: "prod" });
    updateCluster(req, res);

    // Get the updated cluster that will be used for queries
    const saved = saveClusters.mock.calls[0][0];
    const updatedCluster = saved[0];

    // Simulate what query.js does: fetch a node and use its port/secure
    const targetNode = updatedCluster.nodes[0];

    // The URL that would be constructed in executeQuery()
    const proto = targetNode.secure ? "https" : "http";
    const url = `${proto}://${targetNode.host}:${targetNode.port}/`;

    // Should be HTTPS, not HTTP
    expect(url).toBe("https://prod-ch.local:8443/");
    expect(url).not.toContain("8123");
  });
});
