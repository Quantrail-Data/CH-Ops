/**
 * config.test.js - Unit tests for configuration controller
 *
 * Tests the getConnection endpoint which returns the current cluster
 * configuration. Uses mocked clusterUtils to verify that clusters are
 * fetched and returned correctly. Simple test ensuring the controller
 * returns the expected data structure.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";


mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters:  mock(() =>["node"]),
  getNodeByName : mock(() =>true),
  getClusterById : mock(() =>{}),
  getClusterNodes:mock(()=>{}),
  saveClusters : mock(() =>{}),
  getDefaultCluster: mock(() => null),
  migrateClusterData: mock(() => {}),
  MAX_CLUSTERS:3,
  MAX_TOTAL_NODES:18,
}));

const { getConnection } =
  await import("../../src/backend/controllers/config.js");

function mockReqRes(body = {}, params = {}) {
  const req = {
    body,
    params,
    user: {
      username: "u1",
      role: "admin",
    },
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

describe("Config JS file", () => {
  it("check getConnnection function", async () => {
    const { req, res } = mockReqRes();

    await getConnection(req, res);
    expect(res.jsonData).toEqual({
    clusters:["node"]
    });
  });
});
