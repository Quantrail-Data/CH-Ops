// Contributors -> Kathir Moorthy, Kathirdhasan
// Adapter for OCKO, the Official ClickHouse® Kubernetes Operator.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { paths as corePaths, selectors as coreSelectors } from './client.js';
import {
  LABEL,
  ROLE,
  createOckoPaths,
  discoverVersion,
  selectors as ockoSelectors,
  instanceOf,
} from './ockoPaths.js';

function labelOf(obj, key) {
  return obj?.metadata?.labels?.[key] ?? null;
}

function intLabel(obj, key) {
  const raw = labelOf(obj, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function conditionOf(status, type) {
  return (status?.conditions ?? []).find((c) => c.type === type) ?? null;
}

export function createOckoProvider(client, { version } = {}) {
  let paths = createOckoPaths(version);
  let resolved = version ?? null;

  // Resolve the served version once per provider.
  async function ready() {
    if (resolved) return;
    resolved = (await discoverVersion(client)) ?? undefined;
    if (!resolved) {
      const err = new Error(
        'The Official ClickHouse® Kubernetes Operator was not found in this cluster.',
      );
      err.code = 'K8S_OPERATOR_MISSING';
      throw err;
    }
    paths = createOckoPaths(resolved);
  }

  async function listNamespaces() {
    const items = await client.listAll(corePaths.namespaces());
    return items.map((n) => n.metadata.name);
  }

  async function listInstallations(namespace) {
    await ready();
    const items = await client.listAll(paths.clusters(namespace), {
      context: { isCustomResource: true, namespace, resource: 'clickhouseclusters' },
    });

    return items.map((c) => {
      const st = c.status ?? {};
      const readyCond = conditionOf(st, 'Ready');
      return {
        namespace,
        name: c.metadata.name,
        // OCKO has no single status string
        status: readyCond?.reason ?? (readyCond?.status === 'True' ? 'Ready' : null),
        version: st.version ?? null,
        clusters: 1,
        shards: c.spec?.shards ?? 1,
        hosts: (c.spec?.shards ?? 1) * (c.spec?.replicas ?? 3),
        endpoint: null,
      };
    });
  }

  async function getInstallation(namespace, name) {
    await ready();
    const cc = await client.get(paths.cluster(namespace, name), {
      context: { isCustomResource: true, namespace, resource: 'clickhouseclusters' },
    });

    const st = cc.status ?? {};
    const spec = cc.spec ?? {};

    return {
      name: cc.metadata.name,
      namespace,
      spec,
      // OCKO does not publish a merged form.
      normalized: null,
      usedTemplates: [],
      status: {
        status: conditionOf(st, 'Ready')?.reason ?? null,
        chopVersion: st.version ?? null,
        taskID: st.updateRevision ?? null,
        hostsCount: (spec.shards ?? 1) * (spec.replicas ?? 3),
        hostsCompleted: st.readyReplicas ?? null,
        hostsUpdated: null,
        hostsAdded: null,
        hostsDeleted: null,
        hostsFailed: null,
        // AKOC publishes these as host arrays.
        hostsWithTablesCreated: [],
        hostsWithReplicaCaughtUp: [],
        fqdns: [],
        pods: [],
        endpoint: null,
        errors: [],
      },
      // Surfaced for the Reconcile screen.
      conditions: (st.conditions ?? []).map((c) => ({
        type: c.type,
        status: c.status,
        reason: c.reason,
        message: c.message,
        lastTransitionTime: c.lastTransitionTime,
      })),
      revisions: {
        current: st.currentRevision ?? null,
        update: st.updateRevision ?? null,
        // Equal revisions mean the operator has applied what was asked for.
        upToDate: !!st.currentRevision && st.currentRevision === st.updateRevision,
        observedGeneration: st.observedGeneration ?? null,
      },
      // OCKO has no stop, suspend or troubleshoot flag, so nothing here makes health signals unreliable.
      lifecycle: {
        stopped: false,
        suspended: false,
        troubleshoot: false,
        restart: null,
      },
      keeper: spec.keeperClusterRef
        ? {
            name: spec.keeperClusterRef.name,
            // The reference carries the namespace when it differs
            namespace: spec.keeperClusterRef.namespace ?? namespace,
            namespaceUncertain: false,
            hosts: [],
          }
        : null,
    };
  }

  async function getHosts(namespace, clusterName) {
    await ready();
    const labelSelector = ockoSelectors.serverPods(clusterName);

    const [pods, pvcs, services, detail] = await Promise.all([
      client.listAll(corePaths.pods(namespace), { query: { labelSelector } }),
      client.listAll(corePaths.pvcs(namespace), {
        query: { labelSelector: ockoSelectors.ownedByInstance(clusterName) },
      }),
      client.listAll(corePaths.services(namespace), {
        query: { labelSelector: `app=${instanceOf(clusterName)}` },
      }),
      getInstallation(namespace, clusterName),
    ]);

    const rotation = await getRotationMap(namespace, services);
    const volumesByHost = groupVolumes(pvcs);
    const domain = detail.spec?.clusterDomain ?? 'cluster.local';

    return pods.map((pod) => {
      const podName = pod.metadata.name;
      const container =
        (pod.status?.containerStatuses ?? []).find((c) => c.name === 'clickhouse') ??
        pod.status?.containerStatuses?.[0];

      const shard = intLabel(pod, LABEL.shard);
      const replica = intLabel(pod, LABEL.replica);
      const headless = services.find((s) => s.spec?.clusterIP === 'None');

      return {
        id: [namespace, clusterName, clusterName, shard, replica].join('/'),
        namespace,
        installation: clusterName,
        // OCKO has one cluster per resource, so the resource name is the cluster name.
        cluster: clusterName,
        shard,
        replica,

        podName,
        statefulSetName: podName.replace(/-\d+$/, ''),
        // OCKO publishes no fqdns array, so this is built from the headless service
        fqdn: headless
          ? `${podName}.${headless.metadata.name}.${namespace}.svc.${domain}`
          : null,

        phase: pod.status?.phase ?? null,
        // OCKO has no readiness label, so there is no verdict separate from the pod's own.
        operatorReady: null,
        podReady: (pod.status?.conditions ?? []).some(
          (c) => c.type === 'Ready' && c.status === 'True',
        ),
        restartCount: container?.restartCount ?? 0,
        lastTerminationReason: container?.lastState?.terminated?.reason ?? null,
        lastTerminationExitCode: container?.lastState?.terminated?.exitCode ?? null,

        image: container?.image ?? null,
        node: pod.spec?.nodeName ?? null,

        inRotation: rotation.get(podName) ?? null,
        volumes: volumesByHost.get(`${shard}/${replica}`) ?? [],
      };
    });
  }

  // A Service can own several EndpointSlices, so they are joined by the service-name label.
  async function getRotationMap(namespace, services) {
    const map = new Map();

    for (const service of services) {
      const slices = await client.listAll(corePaths.endpointSlices(namespace), {
        query: {
          labelSelector: coreSelectors.slicesForService(service.metadata.name),
        },
      });

      for (const slice of slices) {
        for (const endpoint of slice.endpoints ?? []) {
          const podName = endpoint.targetRef?.name;
          if (!podName) continue;

          // All three conditions default when absent
          const current = {
            serving: endpoint.conditions?.serving ?? true,
            ready: endpoint.conditions?.ready ?? true,
            terminating: endpoint.conditions?.terminating ?? false,
            service: service.metadata.name,
          };
          const prior = map.get(podName);
          if (!prior || (!prior.ready && current.ready)) map.set(podName, current);
        }
      }
    }

    return map;
  }

  // OCKO labels claims with shard and replica directly, so unlike AKOC there is no claim name to parse.
  function groupVolumes(pvcs) {
    const map = new Map();
    for (const pvc of pvcs) {
      if (labelOf(pvc, LABEL.role) !== ROLE.server) continue;
      const key = `${intLabel(pvc, LABEL.shard)}/${intLabel(pvc, LABEL.replica)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        name: pvc.metadata.name,
        disk: labelOf(pvc, LABEL.disk),
        shard: intLabel(pvc, LABEL.shard),
        replica: intLabel(pvc, LABEL.replica),
        phase: pvc.status?.phase ?? null,
        storageClass: pvc.spec?.storageClassName ?? null,
        requested: pvc.spec?.resources?.requests?.storage ?? null,
        allocated: pvc.status?.allocatedResources?.storage ?? null,
        actual: pvc.status?.capacity?.storage ?? null,
        resizeState: pvc.status?.allocatedResourceStatuses?.storage ?? null,
      });
    }
    return map;
  }

  async function getStorage(namespace, clusterName) {
    await ready();
    const [pvcs, storageClasses] = await Promise.all([
      client.listAll(corePaths.pvcs(namespace), {
        query: { labelSelector: ockoSelectors.ownedByInstance(clusterName) },
      }),
      client.listAll(corePaths.storageClasses()).catch(() => null),
    ]);

    const expandableByClass = new Map();
    if (storageClasses) {
      for (const sc of storageClasses) {
        expandableByClass.set(sc.metadata.name, sc.allowVolumeExpansion === true);
      }
    }

    return pvcs
      .filter((pvc) => labelOf(pvc, LABEL.role) === ROLE.server)
      .map((pvc) => {
        const className = pvc.spec?.storageClassName ?? null;
        return {
          name: pvc.metadata.name,
          namespace,
          disk: labelOf(pvc, LABEL.disk),
          shard: intLabel(pvc, LABEL.shard),
          replica: intLabel(pvc, LABEL.replica),
          phase: pvc.status?.phase ?? null,
          storageClass: className,
          requested: pvc.spec?.resources?.requests?.storage ?? null,
          allocated: pvc.status?.allocatedResources?.storage ?? null,
          actual: pvc.status?.capacity?.storage ?? null,
          resizeState: pvc.status?.allocatedResourceStatuses?.storage ?? null,
          expandable: storageClasses ? (expandableByClass.get(className) ?? false) : null,
          // OCKO does not label claims with a reclaim policy
          reclaimPolicy: 'Retain',
        };
      });
  }

  async function getNetwork(namespace, clusterName) {
    await ready();
    const [services, policies, ingresses, budgets] = await Promise.all([
      client.listAll(corePaths.services(namespace), {
        query: { labelSelector: `app=${instanceOf(clusterName)}` },
      }),
      client.listAll(corePaths.networkPolicies(namespace)).catch(() => []),
      client.listAll(corePaths.ingresses(namespace)).catch(() => []),
      client.listAll(corePaths.podDisruptionBudgets(namespace)).catch(() => []),
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
      networkPolicies: policies.map((p) => ({
        name: p.metadata.name,
        policyTypes: p.spec?.policyTypes ?? [],
      })),
      ingresses: ingresses.map((i) => ({
        name: i.metadata.name,
        hosts: (i.spec?.rules ?? []).map((r) => r.host).filter(Boolean),
      })),
      // OCKO creates a budget per shard automatically
      disruptionBudgets: budgets.map((b) => ({
        name: b.metadata.name,
        disruptionsAllowed: b.status?.disruptionsAllowed ?? null,
        currentHealthy: b.status?.currentHealthy ?? null,
        desiredHealthy: b.status?.desiredHealthy ?? null,
        reason:
          (b.status?.conditions ?? []).find((c) => c.type === 'DisruptionAllowed')
            ?.reason ?? null,
      })),
    };
  }

  async function getEvents(namespace, clusterName) {
    const events = await client.listAll(corePaths.events(namespace));
    // Objects created by this operator are named from the instance, so a name prefix is a reliable match here.
    const instance = instanceOf(clusterName);
    return events
      .filter((e) => {
        const name = e.involvedObject?.name ?? '';
        return name.startsWith(instance) || name === clusterName;
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

  // Pod logs have nothing to do with the operator, so this is the AKOC implementation unchanged.
  async function streamLogs(namespace, podName, options = {}) {
    const {
      container = 'clickhouse',
      tailLines = 1000,
      sinceSeconds,
      previous = false,
      timestamps = true,
      follow = false,
      limitBytes = 20 * 1024 * 1024,
    } = options;

    return client.stream(corePaths.podLog(namespace, podName), {
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

  async function getOperatorHealth(namespace) {
    try {
      await ready();
      await client.listPage(paths.clusters(namespace), {
        limit: 1,
        context: { isCustomResource: true, namespace },
      });
    } catch (err) {
      return { reachable: false, reason: err.code ?? 'unknown', message: err.message };
    }
    return { reachable: true, version: resolved };
  }

  // A cluster the operator has never observed has no generation recorded.
  function isUnmanaged(detail) {
    return detail?.revisions?.observedGeneration == null && !detail?.conditions?.length;
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
