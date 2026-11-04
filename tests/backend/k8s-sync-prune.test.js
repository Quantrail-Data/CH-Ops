// k8s-sync-prune.test.js - The refresh removes missing hosts after the configured time.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock, beforeEach } from "bun:test";

const configValues = {};
let staleCutoff = null;

mock.module("../../src/backend/services/k8sConnections.js", () => ({
  ADDRESSING: { AUTO: "auto", PER_POD: "per-pod", ENDPOINT: "endpoint" },
  RESOLUTION: { FQDN: "fqdn", PER_POD_SERVICE: "service", ENDPOINT: "endpoint" },
  readInstallationAddresses: async () => ({
    nodes: [{ name: "pod-0", host: "pod-0.ch.svc", port: 8123 }],
  }),
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => [],
  updateClusterNodes: () => true,
  findStaleNodes: (clusterId, olderThanIso) => {
    staleCutoff = olderThanIso;
    return [];
  },
  removeNodes: () => {},
}));
mock.module("../../src/backend/services/appConfig.js", () => ({
  getConfig: (key) => configValues[key],
}));

const { refreshOne, pruneMissingHosts } = await import("../../src/backend/services/k8sSync.js");

const ONE_MINUTE = 60 * 1000;

function kubernetesCluster() {
  return {
    id: "k8s_default_demo",
    kind: "k8s",
    version: 1,
    endpoint: "clickhouse.example.com",
    port: 8123,
    k8s: { connectionId: "k8s_1", namespace: "default", installation: "demo", operator: "akoc" },
    nodes: [{ name: "pod-0", host: "pod-0.ch.svc", port: 8123 }],
  };
}

// How far back the cutoff is, in minutes.
function cutoffAgeInMinutes() {
  return Math.round((Date.now() - new Date(staleCutoff).getTime()) / ONE_MINUTE);
}

beforeEach(() => {
  staleCutoff = null;
  configValues["k8s.syncIntervalMs"] = ONE_MINUTE;
  configValues["k8s.missesBeforeRemoval"] = 3;
});

describe("pruning missing hosts", () => {
  it("uses the configured refresh interval, not the default of 15 minutes", async () => {
    const result = await refreshOne(kubernetesCluster());
    expect(result.ok).toBe(true);
    expect(cutoffAgeInMinutes()).toBe(3);
  });

  it("reads the missed refreshes setting on each call", () => {
    pruneMissingHosts("k8s_default_demo", ONE_MINUTE);
    expect(cutoffAgeInMinutes()).toBe(3);

    configValues["k8s.missesBeforeRemoval"] = 5;
    pruneMissingHosts("k8s_default_demo", ONE_MINUTE);
    expect(cutoffAgeInMinutes()).toBe(5);
  });
});
