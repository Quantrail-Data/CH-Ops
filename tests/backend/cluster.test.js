// Contributors - Kathir Moorthy, Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited
// cluster.test.js - unit tests for cluster management controller

import { describe, it, expect, beforeEach, mock} from "bun:test";

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
  // Real implementation, not a stub: the masking assertions below are the
  // point of several tests, so stubbing this would make them vacuous.
  maskClusterPasswords: (cluster) => ({
    ...cluster,
    nodes: (cluster.nodes || []).map(({ password, ...rest }) => ({
      ...rest,
      hasPassword: !!password,
    })),
  }),
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

    it("fails when node are empty", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe(`No nodes found. Add at least one node before creating the cluster.`);
    });

    it("fails when node names are duplicated", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ name: "node1" }, { name: "node1" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe(`Node names must be unique within a cluster.`);
    });

    it("fails when node name is missing", () => {
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({
        name: "new-cluster",
        nodes: [{ host: "localhost" }],
      });

      createCluster(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe(`Node Name is required for all nodes.`);
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
      // Bare strings used to be sent here; apiFetch reads data.error, so the
      // message was lost and the user saw "Request failed (500)".
      expect(res.jsonData).toEqual({ error: "DB crash" });
    });
  });

  describe("updateCluster credential preservation", () => {
    const savedCluster = () => ({
      id: "cluster1",
      name: "Cluster-1",
      nodes: [
        {
          name: "node1",
          host: "10.0.0.1",
          port: 8123,
          user: "chops",
          password: "stored-secret",
          secure: false,
        },
      ],
    });

    it("keeps the stored password when the node is renamed", () => {
      // The UI leaves the password field blank to mean "unchanged". Matching
      // the existing node by name meant a rename lost the password silently.
      getAllClusters.mockReturnValue([savedCluster()]);

      const { req, res } = mockReqRes(
        {
          name: "Cluster-1",
          nodes: [
            {
              name: "renamed-node",
              host: "10.0.0.1",
              port: 8123,
              user: "chops",
              password: "",
              secure: false,
            },
          ],
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(saveClusters).toHaveBeenCalledTimes(1);
      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].nodes[0].name).toBe("renamed-node");
      expect(saved[0].nodes[0].password).toBe("stored-secret");
    });

    it("replaces the password when a new one is supplied", () => {
      getAllClusters.mockReturnValue([savedCluster()]);

      const { req, res } = mockReqRes(
        {
          name: "Cluster-1",
          nodes: [
            {
              name: "node1",
              host: "10.0.0.1",
              port: 8123,
              user: "chops",
              password: "brand-new",
            },
          ],
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].nodes[0].password).toBe("brand-new");
    });

    it("accepts a body with nodes but no name", () => {
      // name.trim() used to run unguarded, so a nodes-only update threw a
      // TypeError and surfaced as a 500.
      getAllClusters.mockReturnValue([savedCluster()]);

      const { req, res } = mockReqRes(
        {
          nodes: [
            {
              name: "node1",
              host: "10.0.0.1",
              port: 8123,
              user: "chops",
              password: "",
            },
          ],
        },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      expect(saveClusters).toHaveBeenCalledTimes(1);
      expect(saveClusters.mock.calls[0][0][0].name).toBe("Cluster-1");
    });

    it("never returns a decrypted password", () => {
      getAllClusters.mockReturnValue([savedCluster()]);

      const { req, res } = mockReqRes(
        { name: "Cluster-1" },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.jsonData.nodes[0].password).toBeUndefined();
      expect(res.jsonData.nodes[0].hasPassword).toBe(true);
    });
  });

  describe("updateCluster TLS/port synchronization (bug fix)", () => {
    it("syncs port to all nodes when cluster port is updated", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8123,
          secure: false,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8123, secure: false },
            { name: "node2", host: "10.0.0.2", port: 8123, secure: false },
            { name: "node3", host: "10.0.0.3", port: 8123, secure: false },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { port: 8443 },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(saveClusters).toHaveBeenCalledTimes(1);
      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].port).toBe(8443);
      expect(saved[0].nodes[0].port).toBe(8443);
      expect(saved[0].nodes[1].port).toBe(8443);
      expect(saved[0].nodes[2].port).toBe(8443);
    });

    it("syncs secure flag to all nodes when cluster TLS is enabled", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8123,
          secure: false,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8123, secure: false },
            { name: "node2", host: "10.0.0.2", port: 8123, secure: false },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { secure: true },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(saveClusters).toHaveBeenCalledTimes(1);
      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].secure).toBe(true);
      expect(saved[0].nodes[0].secure).toBe(true);
      expect(saved[0].nodes[1].secure).toBe(true);
    });

    it("syncs secure flag to false when cluster TLS is disabled", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8443,
          secure: true,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8443, secure: true },
            { name: "node2", host: "10.0.0.2", port: 8443, secure: true },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { secure: false },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].secure).toBe(false);
      expect(saved[0].nodes[0].secure).toBe(false);
      expect(saved[0].nodes[1].secure).toBe(false);
    });

    it("syncs both port and secure when both are updated", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8123,
          secure: false,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8123, secure: false },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { port: 8443, secure: true },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].port).toBe(8443);
      expect(saved[0].secure).toBe(true);
      expect(saved[0].nodes[0].port).toBe(8443);
      expect(saved[0].nodes[0].secure).toBe(true);
    });

    it("handles clusters with no nodes gracefully", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8123,
          secure: false,
          nodes: [],
        },
      ]);

      const { req, res } = mockReqRes(
        { port: 8443, secure: true },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].port).toBe(8443);
      expect(saved[0].secure).toBe(true);
      expect(saved[0].nodes).toEqual([]);
    });

    it("includes configuration mismatch warning in response when detected", () => {
      // This tests the validation added to detect inconsistencies
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8443,
          secure: true,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8123, secure: false },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { name: "Cluster-1" },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      // The response should include a warning about the mismatch
      expect(res.jsonData._warning).toBeDefined();
      expect(res.jsonData._warning).toContain("Cluster uses port 8443");
      expect(res.jsonData._warning).toContain("node1");
    });

    it("does not include warning when cluster and nodes are in sync", () => {
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          port: 8443,
          secure: true,
          nodes: [
            { name: "node1", host: "10.0.0.1", port: 8443, secure: true },
            { name: "node2", host: "10.0.0.2", port: 8443, secure: true },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { name: "Cluster-1" },
        { id: "cluster1" },
      );

      updateCluster(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData._warning).toBeUndefined();
    });

    it("syncs port when updating K8s cluster", () => {
      // K8s clusters should also have nodes synced when port changes
      getAllClusters.mockReturnValue([
        {
          id: "k8s_prod_ch1",
          name: "Production ClickHouse",
          kind: "k8s",
          port: 8123,
          secure: false,
          k8s: { connectionId: "conn1", namespace: "default", installation: "ch" },
          nodes: [
            { name: "ch-0", host: "10.0.0.1", port: 8123, secure: false, source: "k8s" },
            { name: "ch-1", host: "10.0.0.2", port: 8123, secure: false, source: "k8s" },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { port: 8443 },
        { id: "k8s_prod_ch1" },
      );

      updateCluster(req, res);

      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].port).toBe(8443);
      expect(saved[0].nodes[0].port).toBe(8443);
      expect(saved[0].nodes[1].port).toBe(8443);
    });

    it("syncs secure flag when updating K8s cluster", () => {
      getAllClusters.mockReturnValue([
        {
          id: "k8s_prod_ch1",
          name: "Production ClickHouse",
          kind: "k8s",
          port: 8123,
          secure: false,
          k8s: { connectionId: "conn1", namespace: "default", installation: "ch" },
          nodes: [
            { name: "ch-0", host: "10.0.0.1", port: 8123, secure: false, source: "k8s" },
          ],
        },
      ]);

      const { req, res } = mockReqRes(
        { secure: true },
        { id: "k8s_prod_ch1" },
      );

      updateCluster(req, res);

      const saved = saveClusters.mock.calls[0][0];
      expect(saved[0].secure).toBe(true);
      expect(saved[0].nodes[0].secure).toBe(true);
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
      // Bare strings used to be sent here; apiFetch reads data.error, so the
      // message was lost and the user saw "Request failed (500)".
      expect(res.jsonData).toEqual({ error: "DB crash" });
    });
  });

  describe("testConnection", () => {
    it("returns 403 for non-admin", async () => {
      const { req, res } = mockReqRes({ host: "localhost" });
      req.user.role = "editor";

      await testConnection(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData.error).toBe("Admin access required.");
    });

    it("returns host required", async () => {
      getAllClusters.mockReturnValue([]);
      const { req, res } = mockReqRes();

      await testConnection(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe("Host required.");
    });

    it("rejects an unsaved node that carries no password", async () => {
      // Not in the cluster configuration and no password supplied: there is
      // nothing to resolve, and connecting anyway would let this endpoint probe
      // arbitrary internal addresses.
      getAllClusters.mockReturnValue([]);

      const { req, res } = mockReqRes({ host: "10.0.0.5", port: 8123 });

      await testConnection(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toMatch(/has not been saved yet/);
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("resolves the stored password for a saved node", async () => {
      // The browser no longer holds decrypted passwords, so a saved node is
      // tested with the credential from the cluster configuration.
      getAllClusters.mockReturnValue([
        {
          id: "cluster1",
          name: "Cluster-1",
          nodes: [
            {
              name: "node1",
              host: "localhost",
              port: 8123,
              user: "chops",
              password: "stored-secret",
              secure: false,
            },
          ],
        },
      ]);

      executeQuery.mockResolvedValue({
        rows: [{ version: "24.1", uptime: 12345 }],
      });

      const { req, res } = mockReqRes({ host: "localhost", port: 8123 });

      await testConnection(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual({
        ok: true,
        version: "24.1",
        uptime: 12345,
      });
      expect(executeQuery).toHaveBeenCalledTimes(1);
      const args = executeQuery.mock.calls[0][0];
      expect(args.password).toBe("stored-secret");
      expect(args.user).toBe("chops");
    });

    it("accepts an unsaved node when credentials are supplied", async () => {
      getAllClusters.mockReturnValue([]);
      executeQuery.mockResolvedValue({
        rows: [{ version: "24.1", uptime: 1 }],
      });

      const { req, res } = mockReqRes({
        host: "10.0.0.5",
        port: 8123,
        user: "someone",
        password: "typed-in-the-form",
      });

      await testConnection(req, res);

      expect(res.statusCode).toBe(200);
      const args = executeQuery.mock.calls[0][0];
      expect(args.password).toBe("typed-in-the-form");
      expect(args.user).toBe("someone");
    });

    it("returns query error", async () => {
      getAllClusters.mockReturnValue([]);
      executeQuery.mockRejectedValue(new Error("Connection failed"));

      const { req, res } = mockReqRes({
        host: "localhost",
        password: "pw",
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


