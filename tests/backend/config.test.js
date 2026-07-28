// Copyright (C) 2026 Quantrail™ Data Private Limited
// config.test.js - unit tests for configuration controller
// Contributors - Kathirdhasan, Kathir Moorthy

import { describe, it, expect, mock } from "bun:test";

const CLUSTERS = [
  {
    id: "cluster1",
    name: "Cluster-1",
    nodes: [
      {
        name: "node1",
        host: "10.0.0.1",
        port: 8123,
        user: "chops",
        password: "super-secret",
        secure: false,
      },
      {
        name: "node2",
        host: "10.0.0.2",
        port: 8123,
        user: "chops",
        password: "",
        secure: true,
      },
    ],
  },
];

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  // Returns decrypted passwords, exactly as the real implementation does.
  getAllClusters: mock(() => JSON.parse(JSON.stringify(CLUSTERS))),
  maskClusterPasswords: (cluster) => ({
    ...cluster,
    nodes: (cluster.nodes || []).map(({ password, ...rest }) => ({
      ...rest,
      hasPassword: !!password,
    })),
  }),
  getNodeByName: mock(() => true),
  getClusterById: mock(() => {}),
  getClusterNodes: mock(() => {}),
  saveClusters: mock(() => {}),
  getDefaultCluster: mock(() => null),
  migrateClusterData: mock(() => {}),
  MAX_CLUSTERS: 3,
  MAX_TOTAL_NODES: 18,
}));

const { getConnection } = await import(
  "../../src/backend/controllers/config.js"
);

function mockReqRes(role = "admin") {
  const req = {
    body: {},
    params: {},
    user: { username: "u1", role },
    ip: "127.0.0.1",
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

describe("getConnection", () => {
  it("returns the cluster and node topology", () => {
    const { req, res } = mockReqRes();

    getConnection(req, res);

    expect(res.jsonData.clusters).toHaveLength(1);
    const cluster = res.jsonData.clusters[0];
    expect(cluster.id).toBe("cluster1");
    expect(cluster.name).toBe("Cluster-1");
    expect(cluster.nodes).toHaveLength(2);
    expect(cluster.nodes[0].host).toBe("10.0.0.1");
    expect(cluster.nodes[0].port).toBe(8123);
    expect(cluster.nodes[0].user).toBe("chops");
    expect(cluster.nodes[1].secure).toBe(true);
  });

  it("never sends a node password", () => {
    const { req, res } = mockReqRes();

    getConnection(req, res);

    for (const node of res.jsonData.clusters[0].nodes) {
      expect(node.password).toBeUndefined();
    }
    // Belt and braces: no password value anywhere in the serialized payload.
    expect(JSON.stringify(res.jsonData)).not.toContain("super-secret");
  });

  it("reports whether a password is set without revealing it", () => {
    const { req, res } = mockReqRes();

    getConnection(req, res);

    const [withPassword, withoutPassword] = res.jsonData.clusters[0].nodes;
    expect(withPassword.hasPassword).toBe(true);
    expect(withoutPassword.hasPassword).toBe(false);
  });

  it("masks for a readonly user too", () => {
    const { req, res } = mockReqRes("readonly");

    getConnection(req, res);

    expect(JSON.stringify(res.jsonData)).not.toContain("super-secret");
    expect(res.jsonData.clusters[0].nodes[0].hasPassword).toBe(true);
  });
});
