// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy
// migrateClusters.test.js - moving cluster config out of the JSON blob and the checks that guard it

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  inspectBlob,
  createClusterTables,
  verifyMigration,
} from "../../src/backend/db/migrateClusters.js";

// A cluster shaped exactly as saveClusters() writes it: passwords already
// encrypted, node fields limited to the stored whitelist.
const SAMPLE = [
  {
    id: "cluster_1",
    name: "Production",
    nodes: [
      {
        name: "node1",
        host: "10.0.0.1",
        port: 8123,
        user: "default",
        password: "aabb:ccdd:eeff112233",
        secure: false,
      },
      {
        name: "node2",
        host: "10.0.0.2",
        port: 8123,
        user: "default",
        password: "1122:3344:556677889900",
        secure: false,
      },
    ],
  },
  {
    id: "cluster_2",
    name: "Staging",
    nodes: [
      {
        name: "stage1",
        host: "10.0.1.1",
        port: 8443,
        user: "chops",
        password: "dead:beef:cafebabe",
        secure: true,
      },
    ],
  },
];

let sqlite;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
});

describe("inspectBlob: validation", () => {
  it("counts clusters and nodes in a well-formed blob", () => {
    const result = inspectBlob(JSON.stringify(SAMPLE));

    expect(result.clusters).toBe(2);
    expect(result.nodes).toBe(3);
    expect(result.problems).toEqual([]);
    expect(result.parsed).toHaveLength(2);
  });

  it("reports a missing key as a fresh install and does not parse", () => {
    const result = inspectBlob(null);

    expect(result.parsed).toBeNull();
    expect(result.clusters).toBe(0);
    expect(result.problems[0]).toContain("fresh install");
  });

  it("refuses invalid JSON instead of returning an empty list", () => {
    // getAllClusters swallows this and returns []. Here that would migrate zero
    // clusters, flip the flag, and lose everything.
    const result = inspectBlob("{not json");

    expect(result.parsed).toBeNull();
    expect(result.problems[0]).toContain("not valid JSON");
  });

  it("rejects a blob that is not an array", () => {
    const result = inspectBlob(JSON.stringify({ id: "cluster_1" }));

    expect(result.parsed).toBeNull();
    expect(result.problems[0]).toContain("not an array");
  });

  it("flags a cluster with no id", () => {
    const result = inspectBlob(JSON.stringify([{ name: "Nameless", nodes: [] }]));

    expect(result.problems).toContain("A cluster has no id.");
  });

  it("flags duplicate cluster ids", () => {
    const blob = JSON.stringify([
      { id: "dup", name: "One", nodes: [] },
      { id: "dup", name: "Two", nodes: [] },
    ]);

    expect(
      inspectBlob(blob).problems.some((p) => p.includes("Duplicate cluster id")),
    ).toBe(true);
  });

  it("flags duplicate node names inside one cluster", () => {
    const blob = JSON.stringify([
      {
        id: "cluster_1",
        name: "Production",
        nodes: [
          { name: "node1", host: "10.0.0.1" },
          { name: "node1", host: "10.0.0.2" },
        ],
      },
    ]);

    expect(
      inspectBlob(blob).problems.some((p) => p.includes("Duplicate node name")),
    ).toBe(true);
  });

  it("flags a node with no host", () => {
    const blob = JSON.stringify([
      { id: "cluster_1", name: "Production", nodes: [{ name: "node1" }] },
    ]);

    expect(inspectBlob(blob).problems.some((p) => p.includes("has no host"))).toBe(
      true,
    );
  });

  it("treats a cluster with no nodes array as having zero nodes", () => {
    const result = inspectBlob(JSON.stringify([{ id: "c1", name: "Empty" }]));

    expect(result.nodes).toBe(0);
    expect(result.clusters).toBe(1);
  });
});

describe("createClusterTables", () => {
  it("creates cluster, cluster_node and k8s_connection", () => {
    createClusterTables(sqlite);

    const names = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);

    expect(names).toContain("cluster");
    expect(names).toContain("cluster_node");
    expect(names).toContain("k8s_connection");
  });

  it("is safe to run twice", () => {
    createClusterTables(sqlite);
    expect(() => createClusterTables(sqlite)).not.toThrow();
  });

  it("enforces one node name per cluster", () => {
    createClusterTables(sqlite);
    sqlite
      .prepare("INSERT INTO cluster (id, name) VALUES (?, ?)")
      .run("cluster_1", "Production");

    const insert = sqlite.prepare(
      "INSERT INTO cluster_node (cluster_id, name, host) VALUES (?, ?, ?)",
    );
    insert.run("cluster_1", "node1", "10.0.0.1");

    expect(() => insert.run("cluster_1", "node1", "10.0.0.2")).toThrow();
  });

  it("allows the same node name in two different clusters", () => {
    createClusterTables(sqlite);
    const insertCluster = sqlite.prepare(
      "INSERT INTO cluster (id, name) VALUES (?, ?)",
    );
    insertCluster.run("cluster_1", "Production");
    insertCluster.run("cluster_2", "Staging");

    const insert = sqlite.prepare(
      "INSERT INTO cluster_node (cluster_id, name, host) VALUES (?, ?, ?)",
    );
    insert.run("cluster_1", "node1", "10.0.0.1");

    expect(() => insert.run("cluster_2", "node1", "10.0.1.1")).not.toThrow();
  });

  it("defaults a new cluster to kind 'direct' and version 1", () => {
    createClusterTables(sqlite);
    sqlite
      .prepare("INSERT INTO cluster (id, name) VALUES (?, ?)")
      .run("c1", "Production");

    const row = sqlite.query("SELECT kind, version FROM cluster WHERE id = 'c1'").get();

    expect(row.kind).toBe("direct");
    expect(row.version).toBe(1);
  });

  it("defaults a new node to source 'manual'", () => {
    createClusterTables(sqlite);
    sqlite.prepare("INSERT INTO cluster (id, name) VALUES (?, ?)").run("c1", "P");
    sqlite
      .prepare("INSERT INTO cluster_node (cluster_id, name, host) VALUES (?, ?, ?)")
      .run("c1", "n1", "10.0.0.1");

    expect(sqlite.query("SELECT source FROM cluster_node").get().source).toBe(
      "manual",
    );
  });
});

describe("verifyMigration: the gate before the commit point", () => {
  // Insert the sample the way the migration does, so verification has something
  // correct to check against.
  function insertSample() {
    createClusterTables(sqlite);
    const insertCluster = sqlite.prepare(
      "INSERT INTO cluster (id, name, kind, version, port, secure) VALUES (?, ?, 'direct', 1, ?, ?)",
    );
    const insertNode = sqlite.prepare(
      `INSERT INTO cluster_node (cluster_id, name, host, port, user, password_enc, secure, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
    );
    for (const cluster of SAMPLE) {
      const first = cluster.nodes[0];
      insertCluster.run(cluster.id, cluster.name, first.port, first.secure ? 1 : 0);
      for (const node of cluster.nodes) {
        insertNode.run(
          cluster.id,
          node.name,
          node.host,
          node.port,
          node.user,
          node.password,
          node.secure ? 1 : 0,
        );
      }
    }
  }

  it("passes when every cluster, node, host and ciphertext matches", () => {
    insertSample();

    const result = verifyMigration(sqlite, SAMPLE);

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("fails when a cluster is missing from the tables", () => {
    insertSample();
    sqlite.exec("DELETE FROM cluster WHERE id = 'cluster_2'");

    const result = verifyMigration(sqlite, SAMPLE);

    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("Cluster count mismatch"))).toBe(
      true,
    );
  });

  it("fails when a node is missing", () => {
    insertSample();
    sqlite.exec("DELETE FROM cluster_node WHERE name = 'node2'");

    const result = verifyMigration(sqlite, SAMPLE);

    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("Node count mismatch"))).toBe(true);
  });

  it("fails when password ciphertext differs by even one character", () => {
    // The failure this whole procedure exists to prevent. Decrypting and
    // re-encrypting with a drifted SESSION_SECRET would produce exactly this
    // and report success.
    insertSample();
    sqlite.exec(
      "UPDATE cluster_node SET password_enc = 'aabb:ccdd:eeff112234' WHERE name = 'node1'",
    );

    const result = verifyMigration(sqlite, SAMPLE);

    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("Password ciphertext changed"))).toBe(
      true,
    );
  });

  it("fails when a host was rewritten", () => {
    insertSample();
    sqlite.exec("UPDATE cluster_node SET host = '10.9.9.9' WHERE name = 'node1'");

    const result = verifyMigration(sqlite, SAMPLE);

    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("Host changed"))).toBe(true);
  });

  it("treats an empty password as a value to preserve, not to skip", () => {
    const withEmpty = [
      {
        id: "c1",
        name: "Production",
        nodes: [
          { name: "n1", host: "10.0.0.1", port: 8123, user: "default", password: "" },
        ],
      },
    ];
    createClusterTables(sqlite);
    sqlite
      .prepare("INSERT INTO cluster (id, name, port, secure) VALUES (?, ?, ?, 0)")
      .run("c1", "Production", 8123);
    sqlite
      .prepare(
        `INSERT INTO cluster_node (cluster_id, name, host, port, user, password_enc, secure, source)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'manual')`,
      )
      .run("c1", "n1", "10.0.0.1", 8123, "default", "");

    expect(verifyMigration(sqlite, withEmpty).ok).toBe(true);
  });
});
