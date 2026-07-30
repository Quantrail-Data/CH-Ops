// Contributors -> Kathir Moorthy
// Read-only Kubernetes views: topology, reconcile, storage, network, events, logs and health.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { providerFor } from '../services/k8sConnections.js';
import { getClusterById } from '../services/clusterUtils.js';
import { executeQuery } from '../services/clickhouse.js';
import {
  hasCapability,
  ensureCapabilities,
  explain,
  CAPABILITY,
  unavailableFeatures,
  rbacContext,
} from '../services/capabilities.js';
import { getLastResult, refreshOne } from '../services/k8sSync.js';

function fail(res, err) {
  const isK8s = typeof err?.code === 'string' && err.code.startsWith('K8S_');
  return res.status(err?.code === 'K8S_FORBIDDEN' ? 403 : 502).json({
    error: isK8s ? err.message : 'The request could not be completed.',
    code: err?.code ?? null,
  });
}

// Resolve a CHOps cluster to its provider and installation coordinates.
function resolve(clusterId) {
  const cluster = getClusterById(clusterId);
  if (!cluster) throw Object.assign(new Error('Cluster not found.'), { status: 404 });
  if (cluster.kind !== 'k8s') {
    throw Object.assign(new Error('That cluster was not added through Kubernetes.'), {
      status: 400,
    });
  }
  const { provider } = providerFor(cluster.k8s.connectionId, cluster.k8s.operator);
  return { cluster, provider, ns: cluster.k8s.namespace, name: cluster.k8s.installation };
}

// Run one statement against the cluster's endpoint.
async function query(cluster, sql) {
  const node = cluster.nodes[0];
  const result = await executeQuery({
    host: node.host,
    port: node.port,
    secure: node.secure,
    user: node.user,
    password: node.password,
    readOnly: true,
    sql,
  });
  return result?.rows ?? [];
}

// The name ClickHouse® knows this cluster by, which is not reliably the installation name.
async function resolveChClusterName(cluster, installation) {
  try {
    const rows = await query(
      cluster,
      "SELECT DISTINCT cluster FROM system.clusters WHERE cluster != '' ORDER BY cluster",
    );
    const names = rows.map((r) => r.cluster);
    if (!names.length) return null;
    return names.includes(installation) ? installation : names[0];
  } catch {
    return null;
  }
}

// GET /api/k8s/insight/:clusterId/topology
export async function getTopology(req, res) {
  try {
    const { cluster, provider, ns, name } = resolve(req.params.clusterId);
    const [hosts, installation, network] = await Promise.all([
      provider.getHosts(ns, name),
      provider.getInstallation(ns, name),
      provider.getNetwork(ns, name),
    ]);

    // Group by cluster and shard so the interface can render a grid rather than a flat list.
    const grid = {};
    for (const h of hosts) {
      grid[h.cluster] ??= {};
      grid[h.cluster][h.shard] ??= [];
      grid[h.cluster][h.shard].push(h);
    }

    // Replicas of one shard sharing a node have no redundancy against that node failing.
    const placementRisks = [];
    for (const [clusterName, shards] of Object.entries(grid)) {
      for (const [shard, replicas] of Object.entries(shards)) {
        const byNode = new Map();
        for (const r of replicas) {
          if (!r.node) continue;
          byNode.set(r.node, (byNode.get(r.node) ?? 0) + 1);
        }
        for (const [node, count] of byNode) {
          if (count > 1) {
            placementRisks.push({
              cluster: clusterName,
              shard: Number(shard),
              node,
              replicas: count,
            });
          }
        }
      }
    }

    // Hosts running different images mean an upgrade stopped part way.
    const images = [...new Set(hosts.map((h) => h.image).filter(Boolean))];

    return res.json({
      grid,
      hosts,
      lifecycle: installation.lifecycle,
      // In troubleshoot mode the operator disables liveness and readiness probes
      healthSignalsUnreliable: installation.lifecycle.troubleshoot,
      keeper: installation.keeper,
      placementRisks,
      versionSkew: images.length > 1 ? images : null,
      disruptionBudgets: network.disruptionBudgets,
      drainProtection:
        network.disruptionBudgets.length === 0
          ? { protected: false, reason: 'no-pod-disruption-budget' }
          : {
              protected: true,
              blocked: network.disruptionBudgets.some((b) => b.disruptionsAllowed === 0),
            },
      lastRefresh: getLastResult(cluster.id),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/reconcile
export async function getReconcile(req, res) {
  try {
    const { provider, ns, name } = resolve(req.params.clusterId);
    const installation = await provider.getInstallation(ns, name);
    const health = await provider.getOperatorHealth(ns);

    const s = installation.status;
    const total = s.hostsCount ?? 0;
    const done = s.hostsCompleted ?? 0;

    return res.json({
      status: s.status,
      // A deliberate pause reports as Aborted, which must not be painted as a failure.
      aborted: s.status === 'Aborted' && !installation.lifecycle.suspended,
      suspended: installation.lifecycle.suspended,
      stopped: installation.lifecycle.stopped,
      progress: total ? Math.round((done / total) * 100) : null,
      hosts: {
        total,
        completed: done,
        updated: s.hostsUpdated,
        added: s.hostsAdded,
        deleted: s.hostsDeleted,
        failed: s.hostsFailed,
      },
      taskID: s.taskID,
      // The answer to "is the new replica usable yet"
      tablesCreated: s.hostsWithTablesCreated,
      replicasCaughtUp: s.hostsWithReplicaCaughtUp,
      errors: s.errors,
      operator: health,
      unmanaged: provider.isUnmanaged(installation),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// Passwords appear in plain text under configuration.users when somebody puts them there, and people do.
const SECRET_KEY = /password|secret|token|key$|_key/i;

function redact(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v);
  }
  return out;
}

// GET /api/k8s/insight/:clusterId/config
export async function getConfig(req, res) {
  try {
    const { provider, ns, name } = resolve(req.params.clusterId);
    const installation = await provider.getInstallation(ns, name);

    return res.json({
      // Templates are merged into the normalized form, so what was written and what is running routinely differ.
      written: redact(installation.spec),
      running: redact(installation.normalized),
      templates: installation.usedTemplates,
      drift: JSON.stringify(installation.spec) !== JSON.stringify(installation.normalized),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/storage The differentiator.
export async function getStorage(req, res) {
  try {
    const { cluster, provider, ns, name } = resolve(req.params.clusterId);
    // hasCapability is synchronous, so the probe has to have run first.
    await ensureCapabilities(cluster.id);
    const volumes = await provider.getStorage(ns, name);

    let disks = [];
    if (hasCapability(cluster.id, CAPABILITY.DISKS)) {
      const chCluster = await resolveChClusterName(cluster, name);
      if (chCluster) {
        try {
          disks = await query(
            cluster,
            `SELECT hostName() AS host, name, free_space, total_space
             FROM clusterAllReplicas('${chCluster}', system.disks)`,
          );
        } catch {
          disks = [];
        }
      }
      if (!disks.length) {
        // Fan-out unavailable or refused.
        try {
          disks = await query(
            cluster,
            'SELECT hostName() AS host, name, free_space, total_space FROM system.disks',
          );
        } catch {
          disks = [];
        }
      }
    }

    const warnings = [];
    for (const v of volumes) {
      if (v.resizeState === 'NodeResizePending') {
        warnings.push({
          volume: v.name,
          severity: 'high',
          message:
            'An expansion has finished in the control plane but not on the node. Many storage drivers need the pod restarted to complete it. Until then the volume is still its old size.',
        });
      }
      if (v.resizeState === 'ControllerResizeFailed' || v.resizeState === 'NodeResizeFailed') {
        warnings.push({
          volume: v.name,
          severity: 'high',
          message: 'A volume expansion failed and will not retry on its own.',
        });
      }
      if (v.expandable === false) {
        warnings.push({
          volume: v.name,
          severity: 'info',
          message: `Storage class ${v.storageClass} does not allow expansion, so this volume cannot be grown in place.`,
        });
      }
      if (v.reclaimPolicy && v.reclaimPolicy !== 'Retain') {
        warnings.push({
          volume: v.name,
          severity: 'info',
          message:
            'This volume is deleted when its host is removed. Scaling the cluster down destroys the data on it.',
        });
      }
    }

    return res.json({
      volumes,
      disks,
      warnings,
      capabilities: {
        disks: hasCapability(cluster.id, CAPABILITY.DISKS),
        disksMessage: hasCapability(cluster.id, CAPABILITY.DISKS)
          ? null
          : explain(CAPABILITY.DISKS),
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/network Three views of the same cluster that should agree.
export async function getNetwork(req, res) {
  try {
    const { cluster, provider, ns, name } = resolve(req.params.clusterId);
    const [network, hosts] = await Promise.all([
      provider.getNetwork(ns, name),
      provider.getHosts(ns, name),
    ]);

    const chCluster = await resolveChClusterName(cluster, name);
    let systemClusters = [];
    if (chCluster) {
      try {
        systemClusters = await query(
          cluster,
          `SELECT cluster, shard_num, replica_num, host_name
           FROM system.clusters WHERE cluster = '${chCluster}'`,
        );
      } catch {
        systemClusters = [];
      }
    }

    const inKubernetes = new Set(hosts.map((h) => `${h.shard}/${h.replica}`));
    // ClickHouse® numbers shards and replicas from one; the operator labels them from zero.
    const inClickHouse = new Set(
      systemClusters.map((r) => `${r.shard_num - 1}/${r.replica_num - 1}`),
    );
    const routable = new Set(
      hosts.filter((h) => h.inRotation?.ready).map((h) => `${h.shard}/${h.replica}`),
    );

    return res.json({
      ...network,
      chClusterName: chCluster,
      topologyCheck: systemClusters.length
        ? {
            checked: true,
            // Configured in the installation but absent from remote_servers means a reconcile has not propagated.
            missingFromClickHouse: [...inKubernetes].filter((k) => !inClickHouse.has(k)),
            // Present in remote_servers but not routable means a host is configured and unreachable.
            notRoutable: [...inClickHouse].filter((k) => !routable.has(k)),
          }
        : { checked: false, reason: 'could-not-read-system-clusters' },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/events
export async function getEvents(req, res) {
  try {
    const { provider, ns, name } = resolve(req.params.clusterId);
    return res.json({ events: await provider.getEvents(ns, name) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/logs/:pod previous=true reads the container that died
export async function getLogs(req, res) {
  const { pod } = req.params;
  const { previous, tailLines, sinceSeconds } = req.query;

  try {
    const { provider, ns } = resolve(req.params.clusterId);
    const stream = await provider.streamLogs(ns, pod, {
      previous: previous === 'true',
      tailLines: Math.min(Number(tailLines) || 1000, 10000),
      sinceSeconds: sinceSeconds ? Number(sinceSeconds) : undefined,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (!stream) return res.end();

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    return res.end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/health The individual checks are each small.
export async function getHealth(req, res) {
  try {
    const { cluster, provider, ns, name } = resolve(req.params.clusterId);
    await ensureCapabilities(cluster.id);
    const [hosts, installation, network, storage, operator] = await Promise.all([
      provider.getHosts(ns, name),
      provider.getInstallation(ns, name),
      provider.getNetwork(ns, name),
      provider.getStorage(ns, name),
      provider.getOperatorHealth(ns),
    ]);

    // A check can pass, fail, or be unable to run.
    const checks = [];
    const add = (label, ok, detail) => checks.push({ name: label, ok, detail });
    const unknown = (label, detail) =>
      checks.push({ name: label, ok: null, detail });

    add(
      'Operator reachable',
      operator.reachable,
      'If the operator is down the cluster looks healthy and nothing you change will apply.',
    );

    // AKOC publishes its own readiness verdict
    const readyOf = (h) => (h.operatorReady === null ? h.podReady : h.operatorReady);
    add(
      'All hosts ready',
      hosts.every(readyOf),
      `${hosts.filter(readyOf).length} of ${hosts.length} ready`,
    );

    add(
      'All hosts in rotation',
      hosts.every((h) => h.inRotation?.ready !== false),
      'A pod can be Running and still be removed from the service.',
    );

    const images = [...new Set(hosts.map((h) => h.image).filter(Boolean))];
    add(
      'No version skew',
      images.length <= 1,
      images.length > 1 ? `Running ${images.length} different images` : 'Consistent',
    );

    add(
      'Health signals trustworthy',
      !installation.lifecycle.troubleshoot,
      installation.lifecycle.troubleshoot
        ? 'Troubleshoot mode is on, which disables liveness and readiness probes. Pod readiness means nothing right now.'
        : 'Probes are active.',
    );

    add(
      'Protected against node drains',
      network.disruptionBudgets.length > 0,
      network.disruptionBudgets.length === 0
        ? 'No pod disruption budget exists, so a node drain can evict several replicas at once.'
        : 'A budget is in place.',
    );

    add(
      'No stalled volume expansion',
      !storage.some(
        (v) =>
          String(v.resizeState).includes('Pending') || String(v.resizeState).includes('Failed'),
      ),
      'NodeResizePending looks finished and is not.',
    );

    const knownPolicy = storage.filter((v) => v.reclaimPolicy);
    if (!storage.length || knownPolicy.length !== storage.length) {
      unknown(
        'Data survives a scale-down',
        'The reclaim policy could not be read for every volume, so this cannot be answered either way.',
      );
    } else {
      add(
        'Data survives a scale-down',
        knownPolicy.every((v) => v.reclaimPolicy === 'Retain'),
        'Volumes without a Retain policy are deleted when their host is removed.',
      );
    }

    return res.json({
      checks,
      passing: checks.filter((c) => c.ok === true).length,
      unknown: checks.filter((c) => c.ok === null).length,
      // Checks that could not run are excluded from the denominator rather than counted against the cluster.
      total: checks.filter((c) => c.ok !== null).length,
      unavailable: unavailableFeatures(cluster.id),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return fail(res, err);
  }
}

// GET /api/k8s/insight/:clusterId/rbac-context
export async function getRbacContext(req, res) {
  try {
    const context = await rbacContext(req.params.clusterId);
    if (!context) return res.status(404).json({ error: 'Cluster not found.' });
    return res.json(context);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// POST /api/k8s/insight/:clusterId/refresh
export async function refreshNow(req, res) {
  try {
    const cluster = getClusterById(req.params.clusterId);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found.' });
    return res.json(await refreshOne(cluster));
  } catch (err) {
    return fail(res, err);
  }
}
