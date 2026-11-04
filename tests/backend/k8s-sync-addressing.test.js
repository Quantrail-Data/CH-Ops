// k8s-sync-addressing.test.js - The background refresh keeps the address of each pod.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock, beforeEach } from "bun:test";

let addressingRequest = null;
let savedNodes = null;

mock.module("../../src/backend/services/k8sConnections.js", () => ({
  ADDRESSING: { AUTO: "auto", PER_POD: "per-pod", ENDPOINT: "endpoint" },
  RESOLUTION: { FQDN: "fqdn", PER_POD_SERVICE: "service", ENDPOINT: "endpoint" },
  readInstallationAddresses: async (request) => {
    addressingRequest = request;
    return {
      nodes: [
        { name: "pod-0", host: "pod-0.ch.svc", port: 8123 },
        { name: "pod-1", host: "pod-1.ch.svc", port: 8123 },
      ],
      resolution: "fqdn",
      perNodeAccurate: true,
    };
  },
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => [],
  updateClusterNodes: (clusterId, nodes) => {
    savedNodes = nodes;
    return true;
  },
  findStaleNodes: () => [],
  removeNodes: () => {},
}));
mock.module("../../src/backend/services/appConfig.js", () => ({
  getConfig: () => 3,
}));

const { refreshOne } = await import("../../src/backend/services/k8sSync.js");

function kubernetesCluster(resolution) {
  return {
    id: "k8s_default_demo",
    kind: "k8s",
    version: 1,
    endpoint: "clickhouse.example.com",
    port: 8443,
    secure: true,
    chUser: "default",
    chPassword: "",
    k8s: { connectionId: "k8s_1", namespace: "default", installation: "demo", operator: "akoc" },
    k8sAddressing: { mode: "auto", resolution },
    nodes: [{ name: "pod-0", host: "pod-0.ch.svc", port: 8123 }],
  };
}

beforeEach(() => {
  addressingRequest = null;
  savedNodes = null;
});

describe("refreshOne", () => {
  it("keeps the address of each pod when the cluster uses pod addresses", async () => {
    const result = await refreshOne(kubernetesCluster("fqdn"));
    expect(result.ok).toBe(true);
    expect(addressingRequest.mode).toBe("per-pod");
    expect(savedNodes.map((node) => node.host)).toEqual(["pod-0.ch.svc", "pod-1.ch.svc"]);
  });

  it("uses the stored ClickHouse address, not the address of the first pod", async () => {
    await refreshOne(kubernetesCluster("endpoint"));
    expect(addressingRequest.mode).toBe("endpoint");
    expect(addressingRequest.endpoint).toBe("clickhouse.example.com");
  });
});
