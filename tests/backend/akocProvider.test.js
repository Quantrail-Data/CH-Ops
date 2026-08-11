// Copyright (C) 2026 Quantrail™ Data Private Limited
// akocProvider.test.js - the AKOC adapter, reading topology from labels rather than names
// Contributors -> Kathir Moorthy, Praveen kumar

import { describe, it, expect } from "bun:test";
import { createAkocProvider } from "../../src/backend/services/k8s/akoc.js";

// Build a stub client whose listAll and get resolve from a path-keyed map.
function stubClient(fixtures) {
  const match = (path) => {
    const key = Object.keys(fixtures).find((k) => path.includes(k));
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

function pod({ name, cluster = "c1", shard = 0, replica = 0, ready = "yes", status }) {
  return {
    metadata: {
      name,
      labels: {
        "clickhouse.altinity.com/chi": "analytics",
        "clickhouse.altinity.com/cluster": cluster,
        "clickhouse.altinity.com/shard": String(shard),
        "clickhouse.altinity.com/replica": String(replica),
        "clickhouse.altinity.com/ready": ready,
      },
    },
    spec: { nodeName: "worker-1" },
    status: status ?? {
      phase: "Running",
      conditions: [{ type: "Ready", status: "True" }],
      containerStatuses: [
        {
          name: "clickhouse",
          restartCount: 0,
          image: "clickhouse/clickhouse-server:24.8",
        },
      ],
    },
  };
}

const CHI = {
  metadata: { name: "analytics" },
  spec: {
    stop: "no",
    suspend: "no",
    troubleshoot: "no",
    configuration: {
      zookeeper: {
        nodes: [{ host: "keeper-0.keepers.zoo-ns.svc.cluster.local", port: 2181 }],
      },
    },
  },
  status: {
    status: "Completed",
    "chop-version": "0.27.1",
    hostsCount: 2,
    pods: ["chi-analytics-c1-0-0-0", "chi-analytics-c1-0-1-0"],
    fqdns: [
      "chi-analytics-c1-0-0-0.prod.svc.cluster.local",
      "chi-analytics-c1-0-1-0.prod.svc.cluster.local",
    ],
    normalizedCompleted: { spec: "normalized" },
    usedTemplates: [{ name: "default-template" }],
  },
};

describe("getInstallation: spec versus running config", () => {
  it("returns both the written spec and the normalized form", async () => {
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: CHI }));

    const detail = await provider.getInstallation("prod", "analytics");

    expect(detail.spec).toBeDefined();
    expect(detail.normalized).toEqual({ spec: "normalized" });
    expect(detail.usedTemplates).toHaveLength(1);
  });

  it("reads the four lifecycle flags", async () => {
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: CHI }));

    expect((await provider.getInstallation("prod", "analytics")).lifecycle).toEqual({
      stopped: false,
      suspended: false,
      troubleshoot: false,
      restart: null,
    });
  });

  it("recognises the operator's yes/no spelling for troubleshoot mode", async () => {
    const chi = { ...CHI, spec: { ...CHI.spec, troubleshoot: "yes" } };
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: chi }));

    // This flag disables liveness and readiness probes, so callers must stop
    // trusting pod readiness when it is set.
    expect(
      (await provider.getInstallation("prod", "analytics")).lifecycle.troubleshoot,
    ).toBe(true);
  });

  it("parses the Keeper namespace out of the zookeeper host", async () => {
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: CHI }));

    const detail = await provider.getInstallation("prod", "analytics");

    expect(detail.keeper.namespace).toBe("zoo-ns");
    expect(detail.keeper.namespaceUncertain).toBe(false);
  });

  it("flags the Keeper namespace as uncertain when the domain is customised", async () => {
    // namespaceDomainPattern can replace the suffix, so the usual position of
    // the namespace in the FQDN is not guaranteed.
    const chi = {
      ...CHI,
      spec: {
        ...CHI.spec,
        configuration: { zookeeper: { nodes: [{ host: "keeper-0.internal" }] } },
      },
    };
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: chi }));

    expect(
      (await provider.getInstallation("prod", "analytics")).keeper.namespaceUncertain,
    ).toBe(true);
  });

  it("returns null Keeper when none is configured", async () => {
    const chi = { ...CHI, spec: { ...CHI.spec, configuration: {} } };
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: chi }));

    expect((await provider.getInstallation("prod", "analytics")).keeper).toBeNull();
  });
});

describe('AKOC discovery', () => {
  it('lists namespaces by metadata name', async () => {
    const provider = createAkocProvider(stubClient({ namespaces: [
      { metadata: { name: 'prod' } }, { metadata: { name: 'staging' } },
    ] }));

    expect(await provider.listNamespaces()).toEqual(['prod', 'staging']);
  });

  it('uses AKOC table printer columns when the API honours the Table request', async () => {
    const client = stubClient({ clickhouseinstallations: {
      kind: 'Table',
      columnDefinitions: [
        { name: 'Name' }, { name: 'Status' }, { name: 'Version' }, { name: 'Clusters' },
        { name: 'Shards' }, { name: 'Hosts' }, { name: 'Endpoint' }, { name: 'Age' },
      ],
      rows: [{ cells: ['analytics', 'Completed', '0.27', '1', '2', '4', 'http://ch', '4d'] }],
    } });

    expect(await createAkocProvider(client).listInstallations('prod')).toEqual([{
      namespace: 'prod', name: 'analytics', status: 'Completed', version: '0.27',
      clusters: '1', shards: '2', hosts: '4', endpoint: 'http://ch', age: '4d',
    }]);
  });

  it('falls back to custom-resource rows if the API does not return a Table', async () => {
    const client = stubClient({ clickhouseinstallations: [
      { metadata: { name: 'analytics' }, status: { status: 'Completed', hostsCount: 2 } },
    ] });
    client.get = async () => ({ kind: 'List' });

    expect(await createAkocProvider(client).listInstallations('prod')).toEqual([{
      namespace: 'prod', name: 'analytics', status: 'Completed', version: null,
      clusters: null, shards: null, hosts: 2, endpoint: null,
    }]);
  });
});

describe("isUnmanaged", () => {
  it("treats an installation with an empty status as not being reconciled", async () => {
    // The operator can be configured to watch only some namespaces. An
    // installation outside that set exists and nothing acts on it.
    const chi = { metadata: { name: "orphan" }, spec: {}, status: {} };
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: chi }));

    expect(provider.isUnmanaged(await provider.getInstallation("prod", "orphan"))).toBe(
      true,
    );
  });

  it("treats a reconciled installation as managed", async () => {
    const provider = createAkocProvider(stubClient({ clickhouseinstallations: CHI }));

    expect(
      provider.isUnmanaged(await provider.getInstallation("prod", "analytics")),
    ).toBe(false);
  });
});

describe("getHosts: topology from labels", () => {
  const fixtures = {
    clickhouseinstallations: CHI,
    "/pods": [
      pod({ name: "chi-analytics-c1-0-0-0", shard: 0, replica: 0 }),
      pod({ name: "chi-analytics-c1-0-1-0", shard: 0, replica: 1 }),
    ],
    persistentvolumeclaims: [],
    "/services": [],
    endpointslices: [],
  };

  it("reads shard and replica from labels, not from the pod name", async () => {
    const hosts = await createAkocProvider(stubClient(fixtures)).getHosts(
      "prod",
      "analytics",
    );

    expect(hosts).toHaveLength(2);
    expect(hosts[0].shard).toBe(0);
    expect(hosts[0].replica).toBe(0);
    expect(hosts[1].replica).toBe(1);
  });

  it("builds an identity from position rather than name", async () => {
    const hosts = await createAkocProvider(stubClient(fixtures)).getHosts(
      "prod",
      "analytics",
    );

    // A scale-down renumbers names but not positions, so this is what a node
    // row must be keyed on.
    expect(hosts[0].id).toBe("prod/analytics/c1/0/0");
    expect(hosts[1].id).toBe("prod/analytics/c1/0/1");
  });

  it("takes the FQDN from installation status rather than constructing it", async () => {
    const hosts = await createAkocProvider(stubClient(fixtures)).getHosts(
      "prod",
      "analytics",
    );

    expect(hosts[0].fqdn).toBe("chi-analytics-c1-0-0-0.prod.svc.cluster.local");
  });

  it("reports the operator's readiness verdict separately from pod readiness", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...fixtures,
        "/pods": [pod({ name: "chi-analytics-c1-0-0-0", ready: "no" })],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    expect(hosts[0].podReady).toBe(true);
    expect(hosts[0].operatorReady).toBe(false);
  });

  it("surfaces the last termination reason for a crash-looping pod", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...fixtures,
        "/pods": [
          pod({
            name: "chi-analytics-c1-0-0-0",
            status: {
              phase: "Running",
              conditions: [],
              containerStatuses: [
                {
                  name: "clickhouse",
                  restartCount: 7,
                  lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
                },
              ],
            },
          }),
        ],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    expect(hosts[0].restartCount).toBe(7);
    expect(hosts[0].lastTerminationReason).toBe("OOMKilled");
    expect(hosts[0].lastTerminationExitCode).toBe(137);
  });

  it("tolerates a pod with no container statuses yet", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...fixtures,
        "/pods": [pod({ name: "chi-analytics-c1-0-0-0", status: { phase: "Pending" } })],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    expect(hosts[0].phase).toBe("Pending");
    expect(hosts[0].restartCount).toBe(0);
    expect(hosts[0].lastTerminationReason).toBeNull();
  });
});

describe("getStorage: expansion and survival", () => {
  function pvc({ name, resizeState, storageClass = "gp3", reclaim = "Delete" }) {
    return {
      metadata: {
        name,
        labels: {
          "clickhouse.altinity.com/shard": "0",
          "clickhouse.altinity.com/replica": "0",
          "clickhouse.altinity.com/reclaimPolicy": reclaim,
        },
      },
      spec: {
        storageClassName: storageClass,
        resources: { requests: { storage: "100Gi" } },
      },
      status: {
        phase: "Bound",
        capacity: { storage: "50Gi" },
        allocatedResources: { storage: "100Gi" },
        ...(resizeState ? { allocatedResourceStatuses: { storage: resizeState } } : {}),
      },
    };
  }

  it("reports requested, allocated and actual separately", async () => {
    const provider = createAkocProvider(
      stubClient({
        persistentvolumeclaims: [pvc({ name: "data-chi-analytics-c1-0-0-0" })],
        storageclasses: [{ metadata: { name: "gp3" }, allowVolumeExpansion: true }],
      }),
    );

    const volumes = await provider.getStorage("prod", "analytics");

    // Allocated exceeding actual is how a pending expansion looks.
    expect(volumes[0].requested).toBe("100Gi");
    expect(volumes[0].allocated).toBe("100Gi");
    expect(volumes[0].actual).toBe("50Gi");
  });

  it("surfaces a resize that has stalled on the node", async () => {
    const provider = createAkocProvider(
      stubClient({
        persistentvolumeclaims: [pvc({ name: "data-0", resizeState: "NodeResizePending" })],
        storageclasses: [],
      }),
    );

    // The state that looks finished and is not.
    expect((await provider.getStorage("prod", "analytics"))[0].resizeState).toBe(
      "NodeResizePending",
    );
  });

  it("leaves resizeState null when no expansion is running", async () => {
    const provider = createAkocProvider(
      stubClient({ persistentvolumeclaims: [pvc({ name: "data-0" })], storageclasses: [] }),
    );

    expect((await provider.getStorage("prod", "analytics"))[0].resizeState).toBeNull();
  });

  it("marks a volume expandable when its storage class allows it", async () => {
    const provider = createAkocProvider(
      stubClient({
        persistentvolumeclaims: [pvc({ name: "data-0" })],
        storageclasses: [{ metadata: { name: "gp3" }, allowVolumeExpansion: true }],
      }),
    );

    expect((await provider.getStorage("prod", "analytics"))[0].expandable).toBe(true);
  });

  it("distinguishes not expandable from could not check", async () => {
    // A namespace-scoped token cannot read storage classes, and "unknown" is a
    // different answer from "no".
    const client = stubClient({ persistentvolumeclaims: [pvc({ name: "data-0" })] });
    client.listAll = async (path) => {
      if (path.includes("storageclasses")) throw new Error("forbidden");
      return path.includes("persistentvolumeclaims") ? [pvc({ name: "data-0" })] : [];
    };

    expect(
      (await createAkocProvider(client).getStorage("prod", "analytics"))[0].expandable,
    ).toBeNull();
  });

  it("reports the reclaim policy that decides whether data survives a scale-down", async () => {
    const provider = createAkocProvider(
      stubClient({
        persistentvolumeclaims: [pvc({ name: "data-0", reclaim: "Retain" })],
        storageclasses: [],
      }),
    );

    expect((await provider.getStorage("prod", "analytics"))[0].reclaimPolicy).toBe(
      "Retain",
    );
  });
});

describe('host PVC association', () => {
  it('attaches PVC metadata to the pod derived from its claim name', async () => {
    const claim = {
      metadata: {
        name: 'data-chi-analytics-c1-0-0-0',
        labels: {
          'clickhouse.altinity.com/shard': '0',
          'clickhouse.altinity.com/replica': '0',
          'clickhouse.altinity.com/reclaimPolicy': 'Retain',
        },
      },
      spec: { storageClassName: 'fast', resources: { requests: { storage: '10Gi' } } },
      status: {
        phase: 'Bound', capacity: { storage: '8Gi' }, allocatedResources: { storage: '10Gi' },
        allocatedResourceStatuses: { storage: 'NodeResizePending' },
      },
    };
    const provider = createAkocProvider(stubClient({
      clickhouseinstallations: CHI,
      '/pods': [pod({ name: 'chi-analytics-c1-0-0-0' })],
      persistentvolumeclaims: [claim], '/services': [], endpointslices: [],
    }));

    expect((await provider.getHosts('prod', 'analytics'))[0].volumes).toEqual([{
      name: claim.metadata.name, shard: 0, replica: 0, phase: 'Bound', storageClass: 'fast',
      requested: '10Gi', allocated: '10Gi', actual: '8Gi', reclaimPolicy: 'Retain',
      resizeState: 'NodeResizePending',
    }]);
  });
});

describe("rotation: joining EndpointSlices", () => {
  const chiFixture = { clickhouseinstallations: CHI };

  function sliceFor(podName, conditions) {
    return {
      metadata: { name: `slice-${podName}` },
      endpoints: [{ targetRef: { name: podName }, conditions }],
    };
  }

  it("joins several slices for one service rather than reading the first", async () => {
    // Reading only the first slice would report the second pod as out of
    // rotation, which is a false alarm during an incident.
    const provider = createAkocProvider(
      stubClient({
        ...chiFixture,
        "/pods": [
          pod({ name: "chi-analytics-c1-0-0-0", shard: 0, replica: 0 }),
          pod({ name: "chi-analytics-c1-0-1-0", shard: 0, replica: 1 }),
        ],
        persistentvolumeclaims: [],
        "/services": [{ metadata: { name: "clickhouse-analytics" } }],
        endpointslices: [
          sliceFor("chi-analytics-c1-0-0-0", { ready: true, serving: true }),
          sliceFor("chi-analytics-c1-0-1-0", { ready: true, serving: true }),
        ],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    expect(hosts[0].inRotation.ready).toBe(true);
    expect(hosts[1].inRotation.ready).toBe(true);
  });

  it("applies the documented default for each condition when absent", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...chiFixture,
        "/pods": [pod({ name: "chi-analytics-c1-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [{ metadata: { name: "clickhouse-analytics" } }],
        // No conditions at all. ready and serving default to true; terminating
        // defaults to false.
        endpointslices: [sliceFor("chi-analytics-c1-0-0-0", {})],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    expect(hosts[0].inRotation).toEqual({
      serving: true,
      ready: true,
      terminating: false,
      service: "clickhouse-analytics",
    });
  });

  it("distinguishes a draining pod from one that is simply not ready", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...chiFixture,
        "/pods": [pod({ name: "chi-analytics-c1-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [{ metadata: { name: "clickhouse-analytics" } }],
        endpointslices: [
          sliceFor("chi-analytics-c1-0-0-0", {
            ready: false,
            serving: true,
            terminating: true,
          }),
        ],
      }),
    );

    const hosts = await provider.getHosts("prod", "analytics");

    // Still answering queries while shutting down. The old Endpoints API could
    // not express this.
    expect(hosts[0].inRotation.serving).toBe(true);
    expect(hosts[0].inRotation.terminating).toBe(true);
  });

  it("reports null rotation for a pod behind no service at all", async () => {
    const provider = createAkocProvider(
      stubClient({
        ...chiFixture,
        "/pods": [pod({ name: "chi-analytics-c1-0-0-0" })],
        persistentvolumeclaims: [],
        "/services": [{ metadata: { name: "clickhouse-analytics" } }],
        endpointslices: [],
      }),
    );

    expect((await provider.getHosts("prod", "analytics"))[0].inRotation).toBeNull();
  });
});

describe("getNetwork: drain survivability", () => {
  it("reports a blocked drain with its reason", async () => {
    const provider = createAkocProvider(
      stubClient({
        "/services": [],
        networkpolicies: [],
        ingresses: [],
        poddisruptionbudgets: [
          {
            metadata: { name: "clickhouse-pdb" },
            status: {
              disruptionsAllowed: 0,
              currentHealthy: 2,
              desiredHealthy: 2,
              conditions: [
                { type: "DisruptionAllowed", status: "False", reason: "InsufficientPods" },
              ],
            },
          },
        ],
      }),
    );

    const network = await provider.getNetwork("prod", "analytics");

    expect(network.disruptionBudgets[0].disruptionsAllowed).toBe(0);
    expect(network.disruptionBudgets[0].reason).toBe("InsufficientPods");
  });

  it("returns an empty budget list when nothing protects the cluster", async () => {
    const provider = createAkocProvider(
      stubClient({
        "/services": [],
        networkpolicies: [],
        ingresses: [],
        poddisruptionbudgets: [],
      }),
    );

    // Absence is itself the finding: a node drain can evict several replicas at
    // once.
    expect((await provider.getNetwork("prod", "analytics")).disruptionBudgets).toEqual(
      [],
    );
  });

  it("reports network policies, which explain a timeout with correct credentials", async () => {
    const provider = createAkocProvider(
      stubClient({
        "/services": [],
        networkpolicies: [
          { metadata: { name: "deny-all" }, spec: { policyTypes: ["Ingress"] } },
        ],
        ingresses: [],
        poddisruptionbudgets: [],
      }),
    );

    expect((await provider.getNetwork("prod", "analytics")).networkPolicies[0].name).toBe(
      "deny-all",
    );
  });
});

describe('AKOC network, events, logs, and health', () => {
  it('maps service addresses and ports plus ingress host rules', async () => {
    const provider = createAkocProvider(stubClient({
      '/services': [{
        metadata: { name: 'ch-http' }, spec: { type: 'LoadBalancer', clusterIP: '10.0.0.10', ports: [{ name: 'http', port: 8123, targetPort: 8123 }] },
        status: { loadBalancer: { ingress: [{ hostname: 'ch.example.test' }] } },
      }],
      networkpolicies: [],
      ingresses: [{ metadata: { name: 'ui' }, spec: { rules: [{ host: 'ui.example.test' }, {}] } }],
      poddisruptionbudgets: [],
    }));

    const network = await provider.getNetwork('prod', 'analytics');
    expect(network.services[0]).toEqual({
      name: 'ch-http', type: 'LoadBalancer', clusterIP: '10.0.0.10', externalAddress: 'ch.example.test',
      ports: [{ name: 'http', port: 8123, targetPort: 8123 }],
    });
    expect(network.ingresses).toEqual([{ name: 'ui', hosts: ['ui.example.test'] }]);
  });

  it('filters installation events and orders newest first', async () => {
    const provider = createAkocProvider(stubClient({ events: [
      { type: 'Normal', reason: 'Old', message: 'old', involvedObject: { name: 'chi-analytics-0' }, lastTimestamp: '2026-01-01T00:00:00Z' },
      { type: 'Warning', reason: 'New', message: 'new', involvedObject: { name: 'analytics' }, count: 2, eventTime: '2026-01-02T00:00:00Z' },
      { type: 'Normal', reason: 'Other', involvedObject: { name: 'unrelated' } },
    ] }));

    const events = await provider.getEvents('prod', 'analytics');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ reason: 'New', count: 2, object: 'analytics' });
    expect(events[1]).toMatchObject({ reason: 'Old', count: 1 });
  });

  it('passes log streaming options through to the Kubernetes client', async () => {
    let received;
    const client = stubClient({});
    client.stream = async (path, options) => { received = { path, options }; return 'stream'; };
    const stream = await createAkocProvider(client).streamLogs('prod', 'chi-0', {
      container: 'sidecar', tailLines: 50, sinceSeconds: 60, previous: true, timestamps: false,
      follow: true, limitBytes: 99,
    });

    expect(stream).toBe('stream');
    expect(received.options).toEqual({
      query: { container: 'sidecar', tailLines: 50, sinceSeconds: 60, previous: 'true', timestamps: undefined, follow: 'true', limitBytes: 99 },
      context: { namespace: 'prod', resource: 'pods/log' },
    });
  });

  it('reports an unreachable operator and a reachable one', async () => {
    const bad = stubClient({});
    bad.listPage = async () => { const error = new Error('forbidden'); error.code = 403; throw error; };
    expect(await createAkocProvider(bad).getOperatorHealth('prod')).toEqual({
      reachable: false, reason: 403, message: 'forbidden',
    });
    expect(await createAkocProvider(stubClient({})).getOperatorHealth('prod')).toEqual({ reachable: true });
  });
});
