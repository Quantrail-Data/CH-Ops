// Copyright (C) 2026 Quantrail™ Data Private Limited
// Adapter for AKOC, the Altinity® Kubernetes Operator for ClickHouse®.
// Contributors -> Kathir Moorthy

import { paths, selectors, TABLE_ACCEPT } from './client.js';

const LABEL = {
  chi: 'clickhouse.altinity.com/chi',
  cluster: 'clickhouse.altinity.com/cluster',
  shard: 'clickhouse.altinity.com/shard',
  replica: 'clickhouse.altinity.com/replica',
  ready: 'clickhouse.altinity.com/ready',
  reclaimPolicy: 'clickhouse.altinity.com/reclaimPolicy',
};

function labelOf(obj, key) {
  return obj?.metadata?.labels?.[key] ?? null;
}

function intLabel(obj, key) {
  const raw = labelOf(obj, key);
  const n = Number(raw);
  return Number.isFinite(n) && raw !== null ? n : null;
}

// The operator writes yes/no rather than true/false in several places.
function isYes(value) {
  return String(value).toLowerCase() === 'yes' || value === true || value === 1;
}

export function createAkocProvider(client) {
  // Discovery

  async function listNamespaces() {
    const items = await client.listAll(paths.namespaces());
    return items.map((n) => n.metadata.name);
  }

  // Uses the Table representation so the operator's own printer columns come back rendered
  async function listInstallations(namespace) {
    let table;
    try {
      table = await client.get(paths.installations(namespace), {
        accept: TABLE_ACCEPT,
        context: { isCustomResource: true, namespace, resource: 'clickhouseinstallations' },
      });
    } catch (err) {
      throw err;
    }

    if (table?.kind !== 'Table') {
      // Server did not honour the Table request.
      const items = await client.listAll(paths.installations(namespace), {
        context: { isCustomResource: true, namespace },
      });
      return items.map((chi) => ({
        namespace,
        name: chi.metadata.name,
        status: chi.status?.status ?? null,
        version: chi.status?.['chop-version'] ?? null,
        clusters: chi.status?.clusters ?? null,
        shards: chi.status?.shards ?? null,
        hosts: chi.status?.hostsCount ?? null,
        endpoint: chi.status?.endpoint ?? null,
      }));
    }

    const col = (name) =>
      (table.columnDefinitions || []).findIndex(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
    const iStatus = col('status');
    const iVersion = col('version');
    const iClusters = col('clusters');
    const iShards = col('shards');
    const iHosts = col('hosts');
    const iEndpoint = col('endpoint');
    const iAge = col('age');

    return (table.rows || []).map((row) => ({
      namespace,
      name: row.object?.metadata?.name ?? row.cells?.[0],
      status: iStatus >= 0 ? row.cells[iStatus] : null,
      version: iVersion >= 0 ? row.cells[iVersion] : null,
      clusters: iClusters >= 0 ? row.cells[iClusters] : null,
      shards: iShards >= 0 ? row.cells[iShards] : null,
      hosts: iHosts >= 0 ? row.cells[iHosts] : null,
      endpoint: iEndpoint >= 0 ? row.cells[iEndpoint] : null,
      age: iAge >= 0 ? row.cells[iAge] : null,
    }));
  }

  async function getInstallation(namespace, name) {
    const chi = await client.get(paths.installation(namespace, name), {
      context: { isCustomResource: true, namespace, resource: 'clickhouseinstallations' },
    });

    return {
      name: chi.metadata.name,
      namespace,
      // What was written versus what is actually in effect.
      spec: chi.spec,
      normalized: chi.status?.normalizedCompleted ?? chi.status?.normalized ?? null,
      usedTemplates: chi.status?.usedTemplates ?? [],
      status: {
        status: chi.status?.status ?? null,
        chopVersion: chi.status?.['chop-version'] ?? null,
        taskID: chi.status?.taskID ?? null,
        hostsCount: chi.status?.hostsCount ?? null,
        hostsCompleted: chi.status?.hostsCompleted ?? null,
        hostsUpdated: chi.status?.hostsUpdated ?? null,
        hostsAdded: chi.status?.hostsAdded ?? null,
        hostsDeleted: chi.status?.hostsDeleted ?? null,
        hostsFailed: chi.status?.hostsFailed ?? null,
        hostsWithTablesCreated: chi.status?.hostsWithTablesCreated ?? [],
        hostsWithReplicaCaughtUp: chi.status?.hostsWithReplicaCaughtUp ?? [],
        fqdns: chi.status?.fqdns ?? [],
        pods: chi.status?.pods ?? [],
        endpoint: chi.status?.endpoint ?? null,
        errors: chi.status?.errors ?? [],
      },
      // Four lifecycle flags, each of which makes an ordinary signal misleading.
      lifecycle: {
        stopped: isYes(chi.spec?.stop),
        suspended: isYes(chi.spec?.suspend),
        troubleshoot: isYes(chi.spec?.troubleshoot),
        restart: chi.spec?.restart ?? null,
      },
      keeper: parseKeeperReference(chi),
    };
  }

  // Keeper is referenced by service host, so the namespace has to be parsed out of an FQDN.
  function parseKeeperReference(chi) {
    const nodes = chi.spec?.configuration?.zookeeper?.nodes ?? [];
    if (!nodes.length) return null;
    const host = nodes[0]?.host ?? '';
    // Expected shape: <pod>.<service>.<namespace>.svc.<domain>
    const parts = host.split('.');
    const namespace = parts.length >= 3 ? parts[2] : null;
    return {
      hosts: nodes.map((n) => n.host),
      namespace,
      namespaceUncertain: namespace === null || !host.includes('.svc.'),
    };
  }

  // Hosts

  async function getHosts(namespace, installation) {
    const labelSelector = selectors.ownedByInstallation(installation);

    const [pods, pvcs, services, chi] = await Promise.all([
      client.listAll(paths.pods(namespace), { query: { labelSelector } }),
      client.listAll(paths.pvcs(namespace), { query: { labelSelector } }),
      client.listAll(paths.services(namespace), { query: { labelSelector } }),
      getInstallation(namespace, installation),
    ]);

    const rotation = await getRotationMap(namespace, services);
    const fqdnByPod = mapFqdnsToPods(chi.status.fqdns, chi.status.pods);
    const pvcsByPod = groupPvcsByPod(pvcs);

    return pods.map((pod) => {
      const podName = pod.metadata.name;
      const container =
        (pod.status?.containerStatuses ?? []).find((c) => c.name === 'clickhouse') ??
        pod.status?.containerStatuses?.[0];

      const shard = intLabel(pod, LABEL.shard);
      const replica = intLabel(pod, LABEL.replica);

      return {
        id: [namespace, installation, labelOf(pod, LABEL.cluster), shard, replica].join('/'),
        namespace,
        installation,
        cluster: labelOf(pod, LABEL.cluster),
        shard,
        replica,

        podName,
        statefulSetName: podName.replace(/-0$/, ''),
        fqdn: fqdnByPod.get(podName) ?? null,

        phase: pod.status?.phase ?? null,
        // The operator's own verdict, which is more reliable than pod readiness
        operatorReady: isYes(labelOf(pod, LABEL.ready)),
        podReady: (pod.status?.conditions ?? []).some(
          (c) => c.type === 'Ready' && c.status === 'True',
        ),
        restartCount: container?.restartCount ?? 0,
        // The single most useful field when a pod is crash-looping
        lastTerminationReason: container?.lastState?.terminated?.reason ?? null,
        lastTerminationExitCode: container?.lastState?.terminated?.exitCode ?? null,

        image: container?.image ?? null,
        node: pod.spec?.nodeName ?? null,

        // A pod can be Running and quietly absent from the service.
        inRotation: rotation.get(podName) ?? null,

        volumes: pvcsByPod.get(podName) ?? [],
      };
    });
  }

  // The operator writes status.fqdns and status.pods as parallel arrays.
  function mapFqdnsToPods(fqdns, pods) {
    const map = new Map();
    for (let i = 0; i < pods.length; i += 1) {
      if (fqdns[i]) map.set(pods[i], fqdns[i]);
    }
    return map;
  }

  // Rotation, via

  async function getRotationMap(namespace, services) {
    const map = new Map();

    for (const service of services) {
      const slices = await client.listAll(paths.endpointSlices(namespace), {
        query: { labelSelector: selectors.slicesForService(service.metadata.name) },
      });

      for (const slice of slices) {
        for (const endpoint of slice.endpoints ?? []) {
          const podName = endpoint.targetRef?.name;
          if (!podName) continue;

          // All three conditions default when absent
          const serving = endpoint.conditions?.serving ?? true;
          const ready = endpoint.conditions?.ready ?? true;
          const terminating = endpoint.conditions?.terminating ?? false;

          const prior = map.get(podName);
          const current = { serving, ready, terminating, service: service.metadata.name };
          // A pod behind several services counts as in rotation if any of them is routing to it.
          if (!prior || (!prior.ready && ready)) map.set(podName, current);
        }
      }
    }

    return map;
  }

  // Storage

  function groupPvcsByPod(pvcs) {
    const map = new Map();
    for (const pvc of pvcs) {
      // The operator names claims <template>-<statefulset>-0 and the pod is <statefulset>-0
      const key = pvc.metadata.name.replace(/^[^-]+-/, '');

      const entry = {
        name: pvc.metadata.name,
        shard: intLabel(pvc, LABEL.shard),
        replica: intLabel(pvc, LABEL.replica),
        phase: pvc.status?.phase ?? null,
        storageClass: pvc.spec?.storageClassName ?? null,
        requested: pvc.spec?.resources?.requests?.storage ?? null,
        allocated: pvc.status?.allocatedResources?.storage ?? null,
        actual: pvc.status?.capacity?.storage ?? null,
        reclaimPolicy: labelOf(pvc, LABEL.reclaimPolicy),
        // Absent means no resize is running.
        resizeState: pvc.status?.allocatedResourceStatuses?.storage ?? null,
      };

      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    return map;
  }

  async function getStorage(namespace, installation) {
    const labelSelector = selectors.ownedByInstallation(installation);
    const [pvcs, storageClasses] = await Promise.all([
      client.listAll(paths.pvcs(namespace), { query: { labelSelector } }),
      // Cluster-scoped.
      client.listAll(paths.storageClasses()).catch(() => null),
    ]);

    const expandableByClass = new Map();
    if (storageClasses) {
      for (const sc of storageClasses) {
        expandableByClass.set(sc.metadata.name, sc.allowVolumeExpansion === true);
      }
    }

    return pvcs.map((pvc) => {
      const className = pvc.spec?.storageClassName ?? null;
      return {
        name: pvc.metadata.name,
        namespace,
        shard: intLabel(pvc, LABEL.shard),
        replica: intLabel(pvc, LABEL.replica),
        phase: pvc.status?.phase ?? null,
        storageClass: className,
        requested: pvc.spec?.resources?.requests?.storage ?? null,
        allocated: pvc.status?.allocatedResources?.storage ?? null,
        actual: pvc.status?.capacity?.storage ?? null,
        resizeState: pvc.status?.allocatedResourceStatuses?.storage ?? null,
        // null means we could not check, which is different from false.
        expandable: storageClasses ? (expandableByClass.get(className) ?? false) : null,
        // Retain keeps the volume when the host is removed.
        reclaimPolicy: labelOf(pvc, LABEL.reclaimPolicy),
      };
    });
  }

  // Network

  async function getNetwork(namespace, installation) {
    const labelSelector = selectors.ownedByInstallation(installation);

    const [services, policies, ingresses, budgets] = await Promise.all([
      client.listAll(paths.services(namespace), { query: { labelSelector } }),
      client.listAll(paths.networkPolicies(namespace)).catch(() => []),
      client.listAll(paths.ingresses(namespace)).catch(() => []),
      client.listAll(paths.podDisruptionBudgets(namespace)).catch(() => []),
    ]);

    return {
      services: services.map((s) => ({
        name: s.metadata.name,
        type: s.spec?.type ?? null,
        clusterIP: s.spec?.clusterIP ?? null,
        externalAddress:
          s.status?.loadBalancer?.ingress?.[0]?.hostname ??
          s.status?.loadBalancer?.ingress?.[0]?.ip ??
          null,
        ports: (s.spec?.ports ?? []).map((p) => ({
          name: p.name,
          port: p.port,
          targetPort: p.targetPort,
        })),
      })),
      // Present means something is restricting traffic to these pods
      networkPolicies: policies.map((p) => ({
        name: p.metadata.name,
        policyTypes: p.spec?.policyTypes ?? [],
      })),
      ingresses: ingresses.map((i) => ({
        name: i.metadata.name,
        hosts: (i.spec?.rules ?? []).map((r) => r.host).filter(Boolean),
      })),
      // Answers "will this cluster survive a node drain".
      disruptionBudgets: budgets.map((b) => ({
        name: b.metadata.name,
        disruptionsAllowed: b.status?.disruptionsAllowed ?? null,
        currentHealthy: b.status?.currentHealthy ?? null,
        desiredHealthy: b.status?.desiredHealthy ?? null,
        reason:
          (b.status?.conditions ?? []).find((c) => c.type === 'DisruptionAllowed')?.reason ??
          null,
      })),
    };
  }

  // Events and logs

  async function getEvents(namespace, installation) {
    const events = await client.listAll(paths.events(namespace));
    // Events do not carry the operator's labels
    const prefix = `chi-${installation}-`;
    return events
      .filter((e) => {
        const name = e.involvedObject?.name ?? '';
        return name.startsWith(prefix) || name === installation;
      })
      .map((e) => ({
        type: e.type,
        reason: e.reason,
        message: e.message,
        object: e.involvedObject?.name ?? null,
        count: e.count ?? 1,
        firstSeen: e.firstTimestamp ?? e.eventTime ?? null,
        lastSeen: e.lastTimestamp ?? e.eventTime ?? null,
      }))
      .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  }

  // Stream a pod's logs.
  async function streamLogs(namespace, podName, options = {}) {
    const {
      container = 'clickhouse',
      tailLines = 1000,
      sinceSeconds,
      previous = false,
      // Every line is prefixed with an RFC3339 timestamp written by the container runtime.
      timestamps = true,
      follow = false,
      // 10000 lines of ClickHouse® logs can pass 5 MB.
      limitBytes = 20 * 1024 * 1024,
    } = options;

    return client.stream(paths.podLog(namespace, podName), {
      query: {
        container,
        tailLines,
        sinceSeconds,
        previous: previous ? 'true' : undefined,
        timestamps: timestamps ? 'true' : undefined,
        follow: follow ? 'true' : undefined,
        limitBytes,
      },
      context: { namespace, resource: 'pods/log' },
    });
  }

  // Operator health If the

  async function getOperatorHealth(namespace) {
    try {
      // Presence of the CRD is the cheapest proof the operator was ever installed.
      await client.listPage(paths.installations(namespace), {
        limit: 1,
        context: { isCustomResource: true, namespace },
      });
    } catch (err) {
      return { reachable: false, reason: err.code ?? 'unknown', message: err.message };
    }
    return { reachable: true };
  }

  // An installation whose status is empty is not being reconciled.
  function isUnmanaged(installationDetail) {
    const s = installationDetail?.status;
    return !s?.status && !s?.chopVersion && !(s?.pods?.length);
  }

  return {
    listNamespaces,
    listInstallations,
    getInstallation,
    getHosts,
    getStorage,
    getNetwork,
    getEvents,
    streamLogs,
    getOperatorHealth,
    isUnmanaged,
  };
}
