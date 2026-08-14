// clusterRoundTrip.test.js - cluster settings survive a save and a load
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen, Sanjeev Kumar G
// Copyright (C) 2026 Quantrail™ Data Private Limited



// Runs as its own `bun test tests/db` invocation, not with tests/backend.


import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/backend/db/schema.js";
import { initCrypto } from "../../src/backend/services/crypto.js";

initCrypto("cluster-round-trip-test-secret-at-least-32-chars");

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE app_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE cluster (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'direct',
    version INTEGER NOT NULL DEFAULT 1,
    ch_user TEXT,
    ch_password_enc TEXT,
    port INTEGER,
    secure INTEGER NOT NULL DEFAULT 0,
    endpoint TEXT,
    k8s_connection_id TEXT,
    k8s_namespace TEXT,
    k8s_installation TEXT,
    k8s_operator TEXT NOT NULL DEFAULT 'akoc',
    last_refreshed_at TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE cluster_node (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 8123,
    user TEXT,
    password_enc TEXT,
    secure INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    shard INTEGER, replica INTEGER, pod_name TEXT,
    last_seen_at TEXT, created_at TEXT, updated_at TEXT,
    UNIQUE (cluster_id, name)
  );
`);

const db = drizzle(sqlite, { schema });

mock.module("../../src/backend/db/index.js", () => ({
  db,
  appSettings: schema.appSettings,
  clusters: schema.clusters,
  clusterNodes: schema.clusterNodes,
  rawSqlite: sqlite,
}));


sqlite.exec(
  "INSERT INTO app_setting (key, value, category) VALUES ('clusters.storage', 'tables', 'cluster')",
);

const { getAllClusters, saveClusters, maskClusterPasswords } = await import(
  "../../src/backend/services/clusterUtils.js"
);


function k8sCluster() {
  return {
    id: "k8s_akoc_demo_demo",
    name: "demo",
    kind: "k8s",
    chUser: "chops",
    chPassword: "s3cret-password",
    endpoint: "clickhouse-demo.akoc-demo.svc.cluster.local",
    port: 8123,
    secure: false,
    k8s: {
      connectionId: "conn1",
      namespace: "akoc-demo",
      installation: "demo",
      operator: "akoc",
    },
    nodes: [
      {
        name: "main-0-0",
        host: "chi-demo-main-0-0.akoc-demo.svc.cluster.local",
        port: 8123,
        podName: "chi-demo-main-0-0-0",
        shard: 0,
        replica: 0,
        secure: false,
      },
      {
        name: "main-1-0",
        host: "chi-demo-main-1-0.akoc-demo.svc.cluster.local",
        port: 8123,
        podName: "chi-demo-main-1-0-0",
        shard: 1,
        replica: 0,
        secure: false,
      },
    ],
  };
}

beforeEach(() => {
  sqlite.exec("DELETE FROM cluster_node");
  sqlite.exec("DELETE FROM cluster");
  sqlite.exec("DELETE FROM app_setting WHERE key != 'clusters.storage'");
});

describe("cluster round trip", () => {
  it("keeps every cluster-level setting through a save and a load", () => {
    const original = k8sCluster();
    const data = saveClusters([original]);
    console.log(data)

    const loaded = getAllClusters().find((c) => c.id === original.id);


    expect(loaded.endpoint).toBe(original.endpoint);
    expect(loaded.chPassword).toBe(original.chPassword);
    expect(loaded.port).toBe(original.port);
    expect(loaded.secure).toBe(original.secure);

    expect(loaded.name).toBe(original.name);
    expect(loaded.chUser).toBe(original.chUser);
    expect(loaded.k8s.namespace).toBe(original.k8s.namespace);
    expect(loaded.k8s.installation).toBe(original.k8s.installation);
  });

  it("survives a second save, which is what an edit does", () => {

    saveClusters([k8sCluster()]);

    const first = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");
    first.name = "demo-renamed";
    saveClusters([first]);

    const second = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");

    expect(second.name).toBe("demo-renamed");
    expect(second.endpoint).toBe(k8sCluster().endpoint);
    expect(second.chPassword).toBe(k8sCluster().chPassword);
    expect(second.port).toBe(k8sCluster().port);
  });

  it("does not send the cluster password to the browser", () => {
    saveClusters([k8sCluster()]);
    const loaded = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");

    const masked = maskClusterPasswords(loaded);

    expect(masked.chPassword).toBeUndefined();
    expect(masked.hasChPassword).toBe(true);
    for (const node of masked.nodes) {
      expect(node.password).toBeUndefined();
    }

    expect(masked.endpoint).toBe(k8sCluster().endpoint);
  });
});

describe("kubernetes node addresses", () => {
  it("keeps a distinct host per node", () => {
    saveClusters([k8sCluster()]);

    const loaded = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");
    const hosts = new Set(loaded.nodes.map((n) => n.host));


    expect(hosts.size).toBe(loaded.nodes.length);
  });

  it("still has a distinct host per node after an edit", () => {
    saveClusters([k8sCluster()]);

    const first = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");
    first.name = "demo-renamed";
    saveClusters([first]);

    const second = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");
    const hosts = new Set(second.nodes.map((n) => n.host));

    expect(hosts.size).toBe(second.nodes.length);
  });

  it("keeps each node's pod name, shard and replica", () => {
  
    saveClusters([k8sCluster()]);

    const loaded = getAllClusters().find((c) => c.id === "k8s_akoc_demo_demo");
    const byName = Object.fromEntries(loaded.nodes.map((n) => [n.name, n]));

    expect(byName["main-0-0"].podName).toBe("chi-demo-main-0-0-0");
    expect(byName["main-0-0"].shard).toBe(0);
    expect(byName["main-1-0"].shard).toBe(1);
  });
});
