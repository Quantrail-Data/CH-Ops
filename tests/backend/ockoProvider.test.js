// Contributors -> Kathir Moorthy, Kathirdhasan
// Copyright (C) 2026 Quantrail™ Data Private Limited
// ockoProvider.test.js - the OCKO adapter, conditions and label-derived topology

import { describe, it, expect } from "bun:test";
import { createOckoProvider } from "../../src/backend/services/k8s/ocko.js";
import {
  discoverVersion,
  selectors,
  instanceOf,
  createOckoPaths,
} from "../../src/backend/services/k8s/ockoPaths.js";

function stubClient(fixtures) {
  // Exact match first. The discovery path "/apis/clickhouse.com" is a prefix of
  // every resource path under that group, so a substring match would hand back
  // the discovery document whenever a cluster was asked for.
  const match = (path) => {
    if (path in fixtures) return fixtures[path];
    const key = Object.keys(fixtures)
      .filter((k) => !k.startsWith("/apis/"))
      .find((k) => path.includes(k));
    return key ? fixtures[key] : undefined;
  };
  return {
    listAll: async (path) => match(path) ?? [],
    listPage: async (path) => ({ items: match(path) ?? [] }),
    get: async (path) => match(path) ?? {},
    post: async () => ({}),
    stream: async () => null,
  };
}

// The discovery response, so nothing hardcodes v1alpha1.
const DISCOVERY = {
  "/apis/clickhouse.com": {
    preferredVersion: { version: "v1alpha1" },
    versions: [{ version: "v1alpha1" }],
  },
};

function pod({ name, shard = 0, replica = 0, ready = true, status }) {
  return {
    metadata: {
      name,
      labels: {
        app: "test-clickhouse",
        "app.kubernetes.io/instance": "test-clickhouse",
        "app.kubernetes.io/name": "clickhouse-server",
        "clickhouse.com/role": "clickhouse-server",
        "clickhouse.com/shard-id": String(shard),
        "clickhouse.com/replica-id": String(replica),
      },
    },
    spec: { nodeName: "worker-1" },
    status: status ?? {
      phase: "Running",
      conditions: [{ type: "Ready", status: ready ? "True" : "False" }],
      containerStatuses: [
        { name: "clickhouse", restartCount: 0, image: "clickhouse/clickhouse-server:25.8" },
      ],
    },
  };
}

function pvc({ name, shard = 0, replica = 0, resizeState, storageClass = "gp3" }) {
  return {
    metadata: {
      name,
      labels: {
        "app.kubernetes.io/instance": "test-clickhouse",
        "clickhouse.com/role": "clickhouse-server",
        "clickhouse.com/disk": "clickhouse-storage-volume",
        "clickhouse.com/shard-id": String(shard),
        "clickhouse.com/replica-id": String(replica),
      },
    },
    spec: { storageClassName: storageClass, resources: { requests: { storage: "100Gi" } } },
    status: {
      phase: "Bound",
      capacity: { storage: "50Gi" },
      allocatedResources: { storage: "100Gi" },
      ...(resizeState ? { allocatedResourceStatuses: { storage: resizeState } } : {}),
    },
  };
}

const CLUSTER = {
  metadata: { name: "test" },
  spec: {
    shards: 1,
    replicas: 2,
    clusterDomain: "cluster.local",
    keeperClusterRef: { name: "test" },
  },
  status: {
    readyReplicas: 2,
    version: "25.8.1",
    currentRevision: "rev-9",
    updateRevision: "rev-9",
    observedGeneration: 4,
    conditions: [
      { type: "Ready", status: "True", reason: "AllShardsReady" },
      { type: "ClusterSizeAligned", status: "True", reason: "UpToDate" },
      { type: "SchemaInSync", status: "True", reason: "ReplicasInSync" },
    ],
  },
};

const HEADLESS = {
  metadata: { name: "test-clickhouse-headless", labels: { app: "test-clickhouse" } },
  spec: { clusterIP: "None", ports: [{ name: "http", port: 8123 }] },
};

describe("ockoPaths", () => {
  it("builds paths from the discovered version", () => {
    const p = createOckoPaths("v1beta1");

    expect(p.clusters("prod")).toBe(
      "/apis/clickhouse.com/v1beta1/namespaces/prod/clickhouseclusters",
    );
    expect(p.keepers("prod")).toBe(
      "/apis/clickhouse.com/v1beta1/namespaces/prod/keeperclusters",
    );
    expect(p.cluster('prod', 'analytics')).toBe(
      '/apis/clickhouse.com/v1beta1/namespaces/prod/clickhouseclusters/analytics',
    );
    expect(p.keeper('prod', 'zoo')).toBe(
      '/apis/clickhouse.com/v1beta1/namespaces/prod/keeperclusters/zoo',
    );
  });

  it("reads the preferred version from discovery", async () => {
    expect(await discoverVersion(stubClient(DISCOVERY))).toBe("v1alpha1");
  });

  it("returns null when the group is absent", async () => {
    const client = stubClient({});
    client.get = async () => { throw new Error("404"); };

    expect(await discoverVersion(client)).toBeNull();
  });

  // Objects are named <cluster>-clickhouse and carry the instance label.
  it("selects server pods by instance and role", () => {
    expect(selectors.serverPods("test")).toBe(
      "app.kubernetes.io/instance=test-clickhouse,clickhouse.com/role=clickhouse-server",
    );
    expect(instanceOf("test")).toBe("test-clickhouse");
    expect(selectors.ownedByInstance('test')).toBe('app.kubernetes.io/instance=test-clickhouse');
    expect(selectors.keeperOwnedBy('zoo')).toBe('app.kubernetes.io/instance=zoo-keeper');
  });
});

describe('OCKO discovery and installation listing', () => {
  it('lists namespaces and fails clearly when the operator API group is absent', async () => {
    const provider = createOckoProvider(stubClient({
      namespaces: [{ metadata: { name: 'prod' } }, { metadata: { name: 'dev' } }],
    }));
    expect(await provider.listNamespaces()).toEqual(['prod', 'dev']);
    await expect(provider.listInstallations('prod')).rejects.toMatchObject({
      code: 'K8S_OPERATOR_MISSING',
    });
  });

  it('maps condition status and default shard/replica counts for listed clusters', async () => {
    const provider = createOckoProvider(stubClient({
      ...DISCOVERY,
      clickhouseclusters: [
        { metadata: { name: 'ready' }, spec: { shards: 2, replicas: 4 }, status: { version: '25.8', conditions: [{ type: 'Ready', status: 'True' }] } },
        { metadata: { name: 'pending' }, spec: {}, status: { conditions: [{ type: 'Ready', status: 'False', reason: 'Reconciling' }] } },
      ],
    }));

    expect(await provider.listInstallations('prod')).toEqual([
      { namespace: 'prod', name: 'ready', status: 'Ready', version: '25.8', clusters: 1, shards: 2, hosts: 8, endpoint: null },
      { namespace: 'prod', name: 'pending', status: 'Reconciling', version: null, clusters: 1, shards: 1, hosts: 3, endpoint: null },
    ]);
  });
});

describe("getInstallation", () => {
  const client = stubClient({ ...DISCOVERY, clickhouseclusters: CLUSTER });

  it("derives a status string from the Ready condition", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.status.status).toBe("AllShardsReady");
    expect(d.status.chopVersion).toBe("25.8.1");
  });

  // OCKO reports progress through conditions where AKOC uses host arrays.
  it("surfaces the conditions", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.conditions).toHaveLength(3);
    expect(d.conditions.find((c) => c.type === "SchemaInSync").reason).toBe("ReplicasInSync");
  });

  it("reports revisions as up to date when they match", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.revisions.upToDate).toBe(true);
    expect(d.revisions.observedGeneration).toBe(4);
  });

  it("reports revisions as not up to date when they differ", async () => {
    const mid = {
      ...CLUSTER,
      status: { ...CLUSTER.status, currentRevision: "rev-8", updateRevision: "rev-9" },
    };
    const d = await createOckoProvider(
      stubClient({ ...DISCOVERY, clickhouseclusters: mid }),
    ).getInstallation("chtest", "test");

    expect(d.revisions.upToDate).toBe(false);
  });

  it("leaves the AKOC host arrays empty", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.status.hostsWithTablesCreated).toEqual([]);
    expect(d.status.hostsWithReplicaCaughtUp).toEqual([]);
  });

  // No stop, suspend or troubleshoot flag exists, so nothing makes health
  // signals unreliable. Reported rather than omitted.
  it("reports every lifecycle flag as false", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.lifecycle).toEqual({
      stopped: false,
      suspended: false,
      troubleshoot: false,
      restart: null,
    });
  });

  // The reference carries the namespace, so unlike AKOC nothing is parsed out
  // of an FQDN and the answer is never uncertain.
  it("reads Keeper from the reference, defaulting to the cluster namespace", async () => {
    const d = await createOckoProvider(client).getInstallation("chtest", "test");

    expect(d.keeper.name).toBe("test");
    expect(d.keeper.namespace).toBe("chtest");
    expect(d.keeper.namespaceUncertain).toBe(false);
  });

  it("honours an explicit Keeper namespace", async () => {
    const other = {
      ...CLUSTER,
      spec: { ...CLUSTER.spec, keeperClusterRef: { name: "kp", namespace: "zoo" } },
    };
    const d = await createOckoProvider(
      stubClient({ ...DISCOVERY, clickhouseclusters: other }),
    ).getInstallation("chtest", "test");

    expect(d.keeper.namespace).toBe("zoo");
  });

  // What was written is what runs, so a spec-versus-normalized comparison would
  // always report no drift and mislead.
  it("returns no normalized form", async () => {
    expect((await createOckoProvider(client).getInstallation("chtest", "test")).normalized)
      .toBeNull();
  });
});

describe("getHosts", () => {
  const fixtures = {
    ...DISCOVERY,
    clickhouseclusters: CLUSTER,
    "/pods": [
      pod({ name: "test-clickhouse-0-0-0", shard: 0, replica: 0 }),
      pod({ name: "test-clickhouse-0-1-0", shard: 0, replica: 1 }),
    ],
    persistentvolumeclaims: [
      pvc({ name: "clickhouse-storage-volume-test-clickhouse-0-0-0", replica: 0 }),
      pvc({ name: "clickhouse-storage-volume-test-clickhouse-0-1-0", replica: 1 }),
    ],
    "/services": [HEADLESS],
    endpointslices: [],
  };

  it("reads shard and replica from labels", async () => {
    const hosts = await createOckoProvider(stubClient(fixtures)).getHosts("chtest", "test");

    expect(hosts).toHaveLength(2);
    expect(hosts[0].shard).toBe(0);
    expect(hosts[1].replica).toBe(1);
  });

  it("keys identity on position rather than name", async () => {
    const hosts = await createOckoProvider(stubClient(fixtures)).getHosts("chtest", "test");

    expect(hosts[0].id).toBe("chtest/test/test/0/0");
  });

  // OCKO publishes no fqdns array, so this is built from the headless service
  // and the configured cluster domain.
  it("builds the FQDN from the headless service and cluster domain", async () => {
    const hosts = await createOckoProvider(stubClient(fixtures)).getHosts("chtest", "test");

    expect(hosts[0].fqdn).toBe(
      "test-clickhouse-0-0-0.test-clickhouse-headless.chtest.svc.cluster.local",
    );
  });

  it("honours a custom cluster domain", async () => {
    const custom = {
      ...fixtures,
      clickhouseclusters: {
        ...CLUSTER,
        spec: { ...CLUSTER.spec, clusterDomain: "internal.example" },
      },
    };
    const hosts = await createOckoProvider(stubClient(custom)).getHosts("chtest", "test");

    expect(hosts[0].fqdn).toContain(".svc.internal.example");
  });

  // There is no readiness label, so there is no verdict separate from the pod's.
  // Null rather than false: no opinion is not a negative one.
  it("reports operatorReady as null and falls back to pod readiness", async () => {
    const hosts = await createOckoProvider(stubClient(fixtures)).getHosts("chtest", "test");

    expect(hosts[0].operatorReady).toBeNull();
    expect(hosts[0].podReady).toBe(true);
  });

  it("surfaces the last termination reason", async () => {
    const crashing = {
      ...fixtures,
      "/pods": [
        pod({
          name: "test-clickhouse-0-0-0",
          status: {
            phase: "Running",
            conditions: [],
            containerStatuses: [
              {
                name: "clickhouse",
                restartCount: 5,
                lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
              },
            ],
          },
        }),
      ],
    };
    const hosts = await createOckoProvider(stubClient(crashing)).getHosts("chtest", "test");

    expect(hosts[0].restartCount).toBe(5);
    expect(hosts[0].lastTerminationReason).toBe("OOMKilled");
  });

  // Claims carry shard and replica directly, so no name is parsed.
  it("groups volumes by label rather than by claim name", async () => {
    const hosts = await createOckoProvider(stubClient(fixtures)).getHosts("chtest", "test");

    expect(hosts[0].volumes).toHaveLength(1);
    expect(hosts[0].volumes[0].replica).toBe(0);
    expect(hosts[1].volumes[0].replica).toBe(1);
  });

  it("tolerates a pod with no container statuses", async () => {
    const pending = {
      ...fixtures,
      "/pods": [pod({ name: "test-clickhouse-0-0-0", status: { phase: "Pending" } })],
    };
    const hosts = await createOckoProvider(stubClient(pending)).getHosts("chtest", "test");

    expect(hosts[0].phase).toBe("Pending");
    expect(hosts[0].restartCount).toBe(0);
  });
});

describe("rotation", () => {
  const base = { ...DISCOVERY, clickhouseclusters: CLUSTER };
  const sliceFor = (podName, conditions) => ({
    metadata: { name: `slice-${podName}` },
    endpoints: [{ targetRef: { name: podName }, conditions }],
  });

  it("applies the documented default for each absent condition", async () => {
    const p = createOckoProvider(
      stubClient({
        ...base,
        "/pods": [pod({ name: "test-clickhouse-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [HEADLESS],
        endpointslices: [sliceFor("test-clickhouse-0-0-0", {})],
      }),
    );

    expect((await p.getHosts("chtest", "test"))[0].inRotation).toEqual({
      serving: true,
      ready: true,
      terminating: false,
      service: "test-clickhouse-headless",
    });
  });

  it("distinguishes draining from not ready", async () => {
    const p = createOckoProvider(
      stubClient({
        ...base,
        "/pods": [pod({ name: "test-clickhouse-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [HEADLESS],
        endpointslices: [
          sliceFor("test-clickhouse-0-0-0", { ready: false, serving: true, terminating: true }),
        ],
      }),
    );
    const h = (await p.getHosts("chtest", "test"))[0];

    expect(h.inRotation.serving).toBe(true);
    expect(h.inRotation.terminating).toBe(true);
  });

  it("reports null for a pod behind no service", async () => {
    const p = createOckoProvider(
      stubClient({
        ...base,
        "/pods": [pod({ name: "test-clickhouse-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [HEADLESS],
        endpointslices: [],
      }),
    );

    expect((await p.getHosts("chtest", "test"))[0].inRotation).toBeNull();
  });
});

describe("getStorage", () => {
  it("reports requested, allocated and actual separately", async () => {
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        persistentvolumeclaims: [pvc({ name: "data-0" })],
        storageclasses: [{ metadata: { name: "gp3" }, allowVolumeExpansion: true }],
      }),
    );
    const v = (await p.getStorage("chtest", "test"))[0];

    expect(v.requested).toBe("100Gi");
    expect(v.actual).toBe("50Gi");
    expect(v.expandable).toBe(true);
  });

  it("surfaces a resize stalled on the node", async () => {
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        persistentvolumeclaims: [pvc({ name: "data-0", resizeState: "NodeResizePending" })],
        storageclasses: [],
      }),
    );

    expect((await p.getStorage("chtest", "test"))[0].resizeState).toBe("NodeResizePending");
  });

  // The operator leaves claims in place on delete and reuses them when a
  // cluster of the same name is recreated, so retention is operator behaviour
  // rather than a per-volume setting.
  it("reports Retain, which is what this operator does", async () => {
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        persistentvolumeclaims: [pvc({ name: "data-0" })],
        storageclasses: [],
      }),
    );

    expect((await p.getStorage("chtest", "test"))[0].reclaimPolicy).toBe("Retain");
  });

  it("distinguishes not expandable from could not check", async () => {
    const client = stubClient({ ...DISCOVERY, persistentvolumeclaims: [pvc({ name: "d" })] });
    client.listAll = async (path) => {
      if (path.includes("storageclasses")) throw new Error("forbidden");
      return path.includes("persistentvolumeclaims") ? [pvc({ name: "d" })] : [];
    };

    expect((await createOckoProvider(client).getStorage("chtest", "test"))[0].expandable)
      .toBeNull();
  });

  it("ignores Keeper claims", async () => {
    const keeperPvc = {
      metadata: {
        name: "clickhouse-storage-volume-test-keeper-0-0",
        labels: {
          "app.kubernetes.io/instance": "test-keeper",
          "clickhouse.com/role": "clickhouse-keeper",
          "clickhouse.com/keeper-replica-id": "0",
        },
      },
      spec: {},
      status: {},
    };
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        persistentvolumeclaims: [pvc({ name: "data-0" }), keeperPvc],
        storageclasses: [],
      }),
    );

    expect(await p.getStorage("chtest", "test")).toHaveLength(1);
  });
});

describe("getNetwork", () => {
  // The operator creates a budget per shard, so unlike AKOC this is normally
  // populated on a default install.
  it("reports disruption budgets", async () => {
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        "/services": [HEADLESS],
        networkpolicies: [],
        ingresses: [],
        poddisruptionbudgets: [
          {
            metadata: { name: "test-clickhouse-0" },
            status: {
              disruptionsAllowed: 1,
              currentHealthy: 2,
              desiredHealthy: 1,
              conditions: [
                { type: "DisruptionAllowed", status: "True", reason: "SufficientPods" },
              ],
            },
          },
        ],
      }),
    );
    const n = await p.getNetwork("chtest", "test");

    expect(n.disruptionBudgets[0].disruptionsAllowed).toBe(1);
    expect(n.disruptionBudgets[0].reason).toBe("SufficientPods");
  });

  it("reports the headless service", async () => {
    const p = createOckoProvider(
      stubClient({
        ...DISCOVERY,
        "/services": [HEADLESS],
        networkpolicies: [],
        ingresses: [],
        poddisruptionbudgets: [],
      }),
    );

    expect((await p.getNetwork("chtest", "test")).services[0].name)
      .toBe("test-clickhouse-headless");
  });
});

describe('OCKO events, logs, and operator health', () => {
  it('maps service, policy, ingress, and event information', async () => {
    const provider = createOckoProvider(stubClient({
      ...DISCOVERY,
      '/services': [{
        metadata: { name: 'public' }, spec: { type: 'LoadBalancer', clusterIP: '10.1.0.2', ports: [{ name: 'https', port: 8443, targetPort: 8123 }] },
        status: { loadBalancer: { ingress: [{ ip: '203.0.113.8' }] } },
      }],
      networkpolicies: [{ metadata: { name: 'allow-client' }, spec: { policyTypes: ['Ingress'] } }],
      ingresses: [{ metadata: { name: 'web' }, spec: { rules: [{ host: 'ch.example.test' }, {}] } }],
      poddisruptionbudgets: [],
      events: [
        { type: 'Normal', reason: 'Old', message: 'old', involvedObject: { name: 'test-clickhouse-0' }, lastTimestamp: '2026-01-01T00:00:00Z' },
        { type: 'Warning', reason: 'New', message: 'new', involvedObject: { name: 'test' }, count: 2, eventTime: '2026-01-02T00:00:00Z' },
        { type: 'Normal', reason: 'Skip', involvedObject: { name: 'other' } },
      ],
    }));
    const network = await provider.getNetwork('prod', 'test');
    expect(network.services[0]).toEqual({
      name: 'public', type: 'LoadBalancer', clusterIP: '10.1.0.2', externalAddress: '203.0.113.8',
      ports: [{ name: 'https', port: 8443, targetPort: 8123 }],
    });
    expect(network.networkPolicies).toEqual([{ name: 'allow-client', policyTypes: ['Ingress'] }]);
    expect(network.ingresses).toEqual([{ name: 'web', hosts: ['ch.example.test'] }]);

    const events = await provider.getEvents('prod', 'test');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ reason: 'New', count: 2 });
    expect(events[1]).toMatchObject({ reason: 'Old', count: 1 });
  });

  it('forwards log options and reports reachable or unavailable operators', async () => {
    let received;
    const client = stubClient(DISCOVERY);
    client.stream = async (path, options) => { received = { path, options }; return 'stream'; };
    const provider = createOckoProvider(client);
    expect(await provider.streamLogs('prod', 'test-0', {
      container: 'sidecar', tailLines: 10, sinceSeconds: 30, previous: true,
      timestamps: false, follow: true, limitBytes: 50,
    })).toBe('stream');
    expect(received.options).toEqual({
      query: { container: 'sidecar', tailLines: 10, sinceSeconds: 30, previous: 'true', timestamps: undefined, follow: 'true', limitBytes: 50 },
      context: { namespace: 'prod', resource: 'pods/log' },
    });
    expect(await provider.getOperatorHealth('prod')).toEqual({ reachable: true, version: 'v1alpha1' });

    const unavailable = stubClient({});
    unavailable.get = async () => { const error = new Error('forbidden'); error.code = 403; throw error; };
    expect(await createOckoProvider(unavailable).getOperatorHealth('prod')).toEqual({
      reachable: false, reason: 'K8S_OPERATOR_MISSING',
      message: 'The Official ClickHouse® Kubernetes Operator was not found in this cluster.',
    });
  });
});

describe("isUnmanaged", () => {
  it("treats a cluster the operator never observed as unmanaged", () => {
    const p = createOckoProvider(stubClient(DISCOVERY));

    expect(p.isUnmanaged({ revisions: { observedGeneration: null }, conditions: [] })).toBe(true);
  });

  it("treats an observed cluster as managed", () => {
    const p = createOckoProvider(stubClient(DISCOVERY));

    expect(
      p.isUnmanaged({ revisions: { observedGeneration: 4 }, conditions: [{ type: "Ready" }] }),
    ).toBe(false);
  });
});
