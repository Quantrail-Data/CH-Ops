// k8s-addressing.test.js - coverage for Kubernetes pod address selection
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { beforeEach, describe, expect, it, mock } from "bun:test";

const executeQuery = mock();
const getConfig = mock(() => 1500);

mock.module("../../src/backend/services/k8s/client.js", () => ({
  paths: {
    services: namespace => `services:${namespace}`,
    endpointSlices: namespace => `slices:${namespace}`,
  },
  selectors: { slicesForService: name => `service=${name}` },
}));
mock.module("../../src/backend/services/clickhouse.js", () => ({ executeQuery }));
mock.module("../../src/backend/services/appConfig.js", () => ({ getConfig }));

const {
  ADDRESSING,
  RESOLUTION,
  findPerPodServices,
  resolveNodeAddresses,
} = await import("../../src/backend/services/k8s/addressing.js");

beforeEach(() => {
  executeQuery.mockReset();
  getConfig.mockClear();
});

describe("findPerPodServices", () => {
  it("returns no mappings when there are no externally reachable services", async () => {
    const client = { listAll: mock().mockResolvedValue([{ spec: { type: "ClusterIP" } }]) };
    expect(await findPerPodServices(client, "prod")).toEqual(new Map());
  });

  it("maps LoadBalancer and NodePort services that each target one pod", async () => {
    const client = {
      listAll: mock((path, options) => {
        if (path === "services:prod") {
          return Promise.resolve([
            { metadata: { name: "lb" }, spec: { type: "LoadBalancer", ports: [{ name: "http", port: 8123 }] }, status: { loadBalancer: { ingress: [{ hostname: "lb.example" }] } } },
            { metadata: { name: "node" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30123 }] } },
          ]);
        }
        return Promise.resolve(options?.query?.labelSelector === "service=lb"
          ? [{ endpoints: [{ targetRef: { name: "pod-lb" } }] }]
          : [{ endpoints: [{ targetRef: { name: "pod-node" } }] }]);
      }),
    };

    expect(await findPerPodServices(client, "prod")).toEqual(new Map([
      ["pod-lb", { host: "lb.example", port: 8123 }],
      ["pod-node", { host: null, port: 30123, needsNodeAddress: true }],
    ]));
  });

  it("skips malformed, ambiguous, unavailable, and duplicate service mappings", async () => {
    const client = {
      listAll: mock((path, options) => {
        if (path === "services:prod") return Promise.resolve([
          { spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30001 }] } },
          { metadata: { name: "broken" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30002 }] } },
          { metadata: { name: "many" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30003 }] } },
          { metadata: { name: "no-http" }, spec: { type: "NodePort", ports: [{ port: 9000, nodePort: 30004 }] } },
          { metadata: { name: "no-node-port" }, spec: { type: "NodePort", ports: [{ port: 8123 }] } },
          { metadata: { name: "no-ingress" }, spec: { type: "LoadBalancer", ports: [{ port: 8123 }] }, status: {} },
          { metadata: { name: "first" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30005 }] } },
          { metadata: { name: "second" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30006 }] } },
        ]);
        if (options?.query?.labelSelector === "service=broken") return Promise.reject(new Error("forbidden"));
        if (options?.query?.labelSelector === "service=many") return Promise.resolve([{ endpoints: [{ targetRef: { name: "one" } }, { targetRef: { name: "two" } }] }]);
        return Promise.resolve([{ endpoints: [{ targetRef: { name: "pod-1" } }] }]);
      }),
    };

    expect(await findPerPodServices(client, "prod")).toEqual(new Map([
      ["pod-1", { host: null, port: 30005, needsNodeAddress: true }],
    ]));
  });
});

describe("resolveNodeAddresses", () => {
  const base = {
    client: { listAll: mock() }, namespace: "prod", endpoint: "public.example", port: 8443,
    secure: true, user: "chops", password: "secret",
    nodes: [{ host: "pod-0.internal", podName: "pod-0" }, { host: "pod-1.internal", podName: "pod-1" }],
  };

  it("requires an endpoint in endpoint mode", async () => {
    await expect(resolveNodeAddresses({ ...base, endpoint: "", mode: ADDRESSING.ENDPOINT })).rejects.toThrow(/No ClickHouse address/);
  });

  it("uses the configured endpoint when selected", async () => {
    await expect(resolveNodeAddresses({ ...base, mode: ADDRESSING.ENDPOINT })).resolves.toEqual({
      resolution: RESOLUTION.ENDPOINT,
      nodes: [{ ...base.nodes[0], host: "public.example", port: 8443, secure: true }, { ...base.nodes[1], host: "public.example", port: 8443, secure: true }],
      perNodeAccurate: false,
    });
  });

  it("honors a forced per-pod FQDN choice", async () => {
    await expect(resolveNodeAddresses({ ...base, mode: ADDRESSING.PER_POD })).resolves.toMatchObject({
      resolution: RESOLUTION.FQDN, perNodeAccurate: true, forced: true,
    });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it("uses FQDNs when their ClickHouse probe succeeds", async () => {
    executeQuery.mockResolvedValue({});
    const result = await resolveNodeAddresses({ ...base });
    expect(result).toMatchObject({ resolution: RESOLUTION.FQDN, perNodeAccurate: true });
    expect(executeQuery).toHaveBeenCalledWith(expect.objectContaining({ host: "pod-0.internal", port: 8123, timeoutMs: 1500 }));
  });

  it("uses a per-pod service after a failed FQDN probe", async () => {
    executeQuery.mockRejectedValue(new Error("unreachable"));
    const client = { listAll: mock(path => path.startsWith("services")
      ? Promise.resolve([{ metadata: { name: "pod-service" }, spec: { type: "LoadBalancer", ports: [{ port: 8123 }] }, status: { loadBalancer: { ingress: [{ ip: "10.0.0.10" }] } } }])
      : Promise.resolve([{ endpoints: [{ targetRef: { name: "pod-0" } }, { targetRef: { name: "pod-1" } }] }])) };
    // One service per pod is required, so make the discovery result explicit for each node.
    client.listAll.mockImplementation((path, options) => path.startsWith("services")
      ? Promise.resolve([
        { metadata: { name: "pod-0-service" }, spec: { type: "LoadBalancer", ports: [{ port: 8123 }] }, status: { loadBalancer: { ingress: [{ ip: "10.0.0.10" }] } } },
        { metadata: { name: "pod-1-service" }, spec: { type: "NodePort", ports: [{ port: 8123, nodePort: 30123 }] } },
      ])
      : Promise.resolve(options?.query?.labelSelector === "service=pod-0-service"
        ? [{ endpoints: [{ targetRef: { name: "pod-0" } }] }]
        : [{ endpoints: [{ targetRef: { name: "pod-1" } }] }]));

    await expect(resolveNodeAddresses({ ...base, client })).resolves.toEqual({
      resolution: RESOLUTION.PER_POD_SERVICE,
      nodes: [
        { ...base.nodes[0], host: "10.0.0.10", port: 8123, secure: true },
        { ...base.nodes[1], host: "public.example", port: 30123, secure: true },
      ],
      perNodeAccurate: true,
    });
  });

  it("falls back to the endpoint when discovery fails or no FQDN exists", async () => {
    executeQuery.mockReset();
    const client = { listAll: mock().mockRejectedValue(new Error("Kubernetes unavailable")) };
    await expect(resolveNodeAddresses({ ...base, client, nodes: [{ host: null, podName: "pod-0" }] })).resolves.toMatchObject({
      resolution: RESOLUTION.ENDPOINT, perNodeAccurate: false,
    });
  });
});
