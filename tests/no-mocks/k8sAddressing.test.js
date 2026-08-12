// k8sAddressing.test.js - per-pod address resolution
// Contributors - sanjeev Kumar G
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, test, expect } from "bun:test";
import {
  findPerPodServices,
  ADDRESSING,
  RESOLUTION,
} from "../../src/backend/services/k8s/addressing.js";


function fakeClient({ services = [], slices = {} }) {
  return {
    async listAll(path, options) {
      if (path.includes("/services")) return services;
      if (path.includes("/endpointslices")) {
        const selector = options?.query?.labelSelector ?? "";
        const name = selector.split("=")[1];
        return slices[name] ?? [];
      }
      return [];
    },
  };
}

const svc = (name, type, extra = {}) => ({
  metadata: { name },
  spec: { type, ports: [{ name: "http", port: 8123, nodePort: 30001 }] },
  ...extra,
});

const sliceFor = (...podNames) => [
  { endpoints: podNames.map((n) => ({ targetRef: { name: n } })) },
];

describe("finding per-pod services", () => {
  test("a service backing one pod counts", async () => {
    const client = fakeClient({
      services: [svc("ch-0", "NodePort")],
      slices: { "ch-0": sliceFor("pod-0") },
    });
    const found = await findPerPodServices(client, "ns");
    expect(found.has("pod-0")).toBe(true);
    expect(found.get("pod-0").port).toBe(30001);
  });

  test("a service backing two pods does not", async () => {

    const client = fakeClient({
      services: [svc("ch-all", "NodePort")],
      slices: { "ch-all": sliceFor("pod-0", "pod-1") },
    });
    expect((await findPerPodServices(client, "ns")).size).toBe(0);
  });

  test("a ClusterIP service is ignored", async () => {

    const client = fakeClient({
      services: [svc("ch-0", "ClusterIP")],
      slices: { "ch-0": sliceFor("pod-0") },
    });
    expect((await findPerPodServices(client, "ns")).size).toBe(0);
  });

  test("a LoadBalancer with no address yet is ignored", async () => {
    const s = svc("ch-0", "LoadBalancer");
    s.status = { loadBalancer: { ingress: [] } };
    const client = fakeClient({ services: [s], slices: { "ch-0": sliceFor("pod-0") } });
    expect((await findPerPodServices(client, "ns")).size).toBe(0);
  });

  test("a LoadBalancer with a hostname is used", async () => {
    const s = svc("ch-0", "LoadBalancer");
    s.status = { loadBalancer: { ingress: [{ hostname: "ch-0.example.com" }] } };
    const client = fakeClient({ services: [s], slices: { "ch-0": sliceFor("pod-0") } });
    const found = await findPerPodServices(client, "ns");
    expect(found.get("pod-0").host).toBe("ch-0.example.com");
  });

  test("a service with no slice is skipped rather than throwing", async () => {
    const client = fakeClient({ services: [svc("ch-0", "NodePort")], slices: {} });
    expect((await findPerPodServices(client, "ns")).size).toBe(0);
  });

  test("no services at all returns empty, not an error", async () => {
    expect((await findPerPodServices(fakeClient({}), "ns")).size).toBe(0);
  });
});

describe("the mode constants", () => {
  test("auto is the default mode name used by the controller", () => {
    expect(ADDRESSING.AUTO).toBe("auto");
    expect(ADDRESSING.PER_POD).toBe("per-pod");
    expect(ADDRESSING.ENDPOINT).toBe("endpoint");
  });

  test("every resolution has a distinct value", () => {
    const values = Object.values(RESOLUTION);
    expect(new Set(values).size).toBe(values.length);
  });
});