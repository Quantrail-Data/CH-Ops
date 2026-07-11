/**
 * cluster.test.js - Unit tests for cluster management controller
 *
 * Tests the cluster CRUD operations with mock clusterUtils and clickhouse
 * services. Covers listing clusters, creating with validation (max 3 clusters,
 * unique names, node name validation), updating cluster name and nodes,
 * deleting clusters, and testing node connections. Permission checks are
 * also tested (non-admin gets 403). Various edge cases like DB errors,
 * missing fields, and duplicate names are covered.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

const getAllClusters = mock(()=>{});
const saveClusters = mock(()=>{});
const getClusterById = mock(()=>{});
const getNodeByName = mock(()=>{});
const executeQuery = mock(()=>{});
const getClusterNodes = mock(()=>{});

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters,
  saveClusters,
  getClusterById,
  getClusterNodes,
  getNodeByName,
  getDefaultCluster: () => null,
  migrateClusterData: () => {},
  MAX_CLUSTERS: 3,
  MAX_TOTAL_NODES: 18,
}));

mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery,
  // bun's mock.module replaces this module for the whole test process, not just
  // this file - stub every real export so whichever test file's mock.module call
  // happens to win doesn't break other files that need executeQueryWithBody.
  executeQueryWithBody: mock(() => {}),
}));



const {
  listClusters,
  createCluster,
  updateCluster,
  deleteCluster,
  testConnection,
} = await import("../../src/backend/controllers/cluster.js");

function mockReqRes(body = {}, params = {}) {
  const req = {
    body,
    params,
    user: {
      username: "admin",
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

beforeEach(() => {
  mock.restore();

  getAllClusters.mockReset();
  saveClusters.mockReset();
  getClusterById.mockReset();
  getNodeByName.mockReset();
  executeQuery.mockReset();

  getClusterById.mockReturnValue({
    id: "cluster1",
    name: "Cluster-1",
    nodes: [],
  });

  getNodeByName.mockReturnValue({
    name: "node1",
    host: "localhost",
    port: 8123,
    user: "default",
  });
});

describe("Cluster Controller", () => {
  describe("listClusters", () => {
    it("returns clusters with node passwords masked", () => {
      getAllClusters.mockReturnValue([
        {
          id: "c1",
          name: "Cluster One",
          nodes: [{ name: "node1", host: "localhost", port: 8123, user: "default", password: "s3cret", secure: false }],
        },
        { id: "c2", name: "Cluster Two", nodes: [] },
      ]);

      const { req, res } = mockReqRes();

      listClusters(req, res);

      expect(res.jsonData).toEqual([
        {
          id: "c1",
          name: "Cluster One",
          nodes: [{ name: "node1", host: "localhost", port: 8123, user: "default", secure: false, hasPassword: true }],
        },
        { id: "c2", name: "Cluster Two", nodes: [] },
      ]);
      expect(JSON.stringify(res.jsonData)).not.toContain("s3cret");
    });
  });

  describe("createCluster", () => {
    it("returns 403 for non-admin", () => {
      const { req, res } = mockReqRes();

      req.user.role = "user";

      createCluster(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData.error).toBe("Admin access required.");
    });

    it("returns max cluster error", () => {
      getAllClusters.mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const { req, res } = mockReqRes({
        name: "New Cluster",
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe("Maximum 3 clusters.");
    });

    it("returns cluster name required", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({});

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe("Cluster name required.");
    });

    it("returns duplicate name error", () => {
      getAllClusters.mockReturnValue([
        {
          id: "1",
          name: "prod-cluster",
          nodes: [],
        },
      ]);

      const { req, res } = mockReqRes({
        name: "prod-cluster",
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe("Cluster name must be unique.");
    });

    it("creates cluster successfully", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ name: "node1" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.name).toBe("new-cluster");
      expect(saveClusters).toHaveBeenCalled();
    });

    it("masks node passwords in the create response", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ name: "node1", host: "localhost", password: "s3cret" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(201);
      expect(JSON.stringify(res.jsonData)).not.toContain("s3cret");
      expect(res.jsonData.nodes[0].hasPassword).toBe(true);
    });

    it("should return 500 internal server error", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ name: "node1" }],
      });

      saveClusters.mockImplementationOnce(() => {
        throw new Error("DB crash");
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({
        error: "DB crash",
      });
      expect(saveClusters).toHaveBeenCalled();
    });

    it("fails when node names are duplicated", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ name: "node1" }, { name: "node1" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe(undefined);
    });

    it("fails when node name is missing", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ host: "localhost" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe(undefined);
    });
  });

  describe("updateCluster", () => {
    it("returns 403 for non-admin", () => {
      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      req.user.role = "viewer";

      updateCluster(req, res);

      expect(res.statusCode).toBe(403);
    });

    it("returns cluster not found", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "missing" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.error).toBe("Cluster not found.");
    });

    it("updates cluster name", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "old",
          nodes: [],
        },
      ]);

      const { req, res } = mockReqRes(
        {
          name: "new",
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.name).toBe("new");
      expect(saveClusters).toHaveBeenCalled();
    });

    it("does not leak decrypted node passwords in the response", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "old",
          nodes: [{ name: "node1", host: "localhost", port: 8123, user: "default", password: "s3cret", secure: false }],
        },
      ]);

      const { req, res } = mockReqRes(
        { name: "new", nodes: [{ name: "node1", host: "localhost", port: 8123, user: "default", password: "", secure: false }] },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.jsonData)).not.toContain("s3cret");
      expect(res.jsonData.nodes[0].hasPassword).toBe(true);
      expect(res.jsonData.nodes[0].password).toBeUndefined();
      // The stored password must still be preserved (re-encrypted) even though masked in the response.
      expect(saveClusters).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "cluster1",
          nodes: [expect.objectContaining({ password: "s3cret" })],
        }),
      ]);
    });

    it("should return cluster name required", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "old",
          nodes: [],
        },
      ]);

      const { req, res } = mockReqRes(
        {
          name: "",
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: "Cluster name required.",
      });
    });

    it("should return cluster name must be unique", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "new",
          nodes: [],
        },
        {
          id: "cluster2",
          name: "new",
          nodes: [],
        },
      ]);

      const { req, res } = mockReqRes(
        {
          name: "new",
          audit: {
            clusterId: "cluster1",
            nodeName: "node",
          },
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: "Cluster name must be unique.",
      });
    });

    it("should return 500 internal ", () => {
      getAllClusters.mockImplementationOnce(() => {
        throw new Error("DB crash");
      });

      const { req, res } = mockReqRes(
        {
          name: "old",
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual("DB crash");
    });
  });

  describe("deleteCluster", () => {
    it("returns 403 for non-admin", () => {
      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      req.user.role = "user";

      deleteCluster(req, res);

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 if cluster does not exist", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
        },
      ]);

      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster999" },
      );

      deleteCluster(req, res);

      expect(res.statusCode).toBe(404);
    });

    it("deletes cluster successfully", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
        },
      ]);

      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      deleteCluster(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual({
        deleted: true,
      });

      expect(saveClusters).toHaveBeenCalled();
    });

    it("deletes cluster successfully", () => {
      getAllClusters.mockImplementationOnce(() => {
        throw new Error("DB crash");
      });

      const { req, res } = mockReqRes(
        {
          audit: {
            clusterId: "cluster1",
            nodeName: "node1",
          },
        },
        { id: "cluster1" },
      );

      deleteCluster(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual("DB crash");
    });
  });

  describe("testConnection", () => {
    it("returns host required", async () => {
      const { req, res } = mockReqRes();

      await testConnection(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe("Host required.");
    });

    it("returns connection result", async () => {
      executeQuery.mockResolvedValue({
        rows: [
          {
            version: "24.1",
            uptime: 12345,
          },
        ],
      });

      const { req, res } = mockReqRes({
        host: "localhost",
        port: 8123,
      });

      await testConnection(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual({
        ok: true,
        version: "24.1",
        uptime: 12345,
      });
    });

    it("returns query error", async () => {
      executeQuery.mockRejectedValue(new Error("Connection failed"));

      const { req, res } = mockReqRes({
        host: "localhost",
      });

      await testConnection(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({
        ok: false,
        error: "Connection failed",
      });
    });
  });
});

