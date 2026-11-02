// k8s-health.test.js - The Kubernetes health checks, with a fake cluster and a fake provider.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock } from "bun:test";

// Each test sets these before it calls runHealthChecks.
let fakeCluster;
let fakeProvider;

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterById: () => fakeCluster,
}));
mock.module("../../src/backend/services/k8sConnections.js", () => ({
  providerFor: () => ({ provider: fakeProvider }),
}));
mock.module("../../src/backend/services/capabilities.js", () => ({
  ensureCapabilities: async () => {},
  unavailableFeatures: () => [],
}));

const { runHealthChecks } = await import(
  "../../src/backend/services/k8sHealth.js"
);

const KUBERNETES_CLUSTER = {
  id: "k8s_default_demo",
  kind: "k8s",
  k8s: { connectionId: 1, operator: "akoc", namespace: "default", installation: "demo" },
};

function healthyHost(podName) {
  return {
    podName,
    node: `node-${podName}`,
    image: "clickhouse/clickhouse-server:26.3",
    operatorReady: true,
    podReady: true,
    inRotation: { ready: true },
    resources: { memoryLimit: "4Gi" },
  };
}

// A provider that reports a healthy cluster. A test changes one part of it.
function healthyProvider(changes = {}) {
  return {
    getHosts: async () => [healthyHost("pod-0"), healthyHost("pod-1")],
    getInstallation: async () => ({ lifecycle: { troubleshoot: false } }),
    getNetwork: async () => ({ disruptionBudgets: [{ name: "budget" }] }),
    getStorage: async () => [{ reclaimPolicy: "Retain", resizeState: null }],
    getOperatorHealth: async () => ({ reachable: true }),
    ...changes,
  };
}

function checkNamed(report, name) {
  return report.checks.find((check) => check.name === name);
}

describe("runHealthChecks", () => {
  it("passes every check that can run on a healthy cluster", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    fakeProvider = healthyProvider();
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    const checksThatRan = report.checks.filter((check) => check.ok !== null);
    expect(checksThatRan.length).toBeGreaterThanOrEqual(7);
    expect(checksThatRan.every((check) => check.ok === true)).toBe(true);
    expect(report.passing).toBe(report.total);
  });

  it("answers unknown for the host checks when no host is reported", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    fakeProvider = healthyProvider({ getHosts: async () => [] });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "All hosts ready").ok).toBe(null);
    expect(checkNamed(report, "All hosts in rotation").ok).toBe(null);
  });

  it("fails readiness, version skew and probes when they are wrong", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    const notReadyHost = { ...healthyHost("pod-1"), operatorReady: false, image: "other:1" };
    fakeProvider = healthyProvider({
      getHosts: async () => [healthyHost("pod-0"), notReadyHost],
      getInstallation: async () => ({ lifecycle: { troubleshoot: true } }),
    });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "All hosts ready")).toMatchObject({ ok: false, detail: "1 of 2 ready" });
    expect(checkNamed(report, "No version skew").ok).toBe(false);
    expect(checkNamed(report, "Health signals trustworthy").ok).toBe(false);
  });

  it("uses the pod readiness when the operator gives no verdict", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    const ockoHost = { ...healthyHost("pod-0"), operatorReady: null, podReady: true };
    fakeProvider = healthyProvider({ getHosts: async () => [ockoHost] });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "All hosts ready").ok).toBe(true);
  });

  it("answers unknown when a reclaim policy cannot be read", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    fakeProvider = healthyProvider({
      getStorage: async () => [{ reclaimPolicy: "Retain" }, { reclaimPolicy: null }],
    });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "Data survives a scale-down").ok).toBe(null);
  });

  it("refuses a missing cluster and a cluster not from Kubernetes", async () => {
    fakeCluster = null;
    await expect(runHealthChecks("missing")).rejects.toMatchObject({ status: 404 });
    fakeCluster = { id: "cluster_1", kind: "direct" };
    await expect(runHealthChecks("cluster_1")).rejects.toMatchObject({ status: 400 });
  });

  it("fails the zone check when a shard has two replicas in one zone", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    fakeProvider = healthyProvider({
      getHosts: async () => [
        { ...healthyHost("pod-0"), cluster: "main", shard: 0 },
        { ...healthyHost("pod-1"), cluster: "main", shard: 0 },
      ],
      getNodeZones: async () =>
        new Map([
          ["node-pod-0", "zone-a"],
          ["node-pod-1", "zone-a"],
        ]),
    });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "Replicas spread across zones")).toMatchObject({
      ok: false,
      detail: "shard 0 has 2 replicas in zone-a",
    });
  });

  it("answers unknown for the zone check when the nodes cannot be read", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    fakeProvider = healthyProvider({
      getNodeZones: async () => {
        throw new Error("forbidden");
      },
    });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "Replicas spread across zones").ok).toBe(null);
  });

  it("fails the memory limit check when a pod has no memory limit", async () => {
    fakeCluster = KUBERNETES_CLUSTER;
    const hostWithoutLimit = { ...healthyHost("pod-1"), resources: { memoryLimit: null } };
    fakeProvider = healthyProvider({
      getHosts: async () => [healthyHost("pod-0"), hostWithoutLimit],
    });
    const report = await runHealthChecks(KUBERNETES_CLUSTER.id);
    expect(checkNamed(report, "Memory limits set")).toMatchObject({
      ok: false,
      detail: "1 of 2 pods have no memory limit",
    });
  });
});
