// Copyright (C) 2026 Quantrail™ Data Private Limited
// Kubernetes connection, discovery and installation import endpoints.
// Contributors -> Kathir Moorthy, Praveen kumar

import {
  listConnections,
  getConnection,
  saveConnection,
  deleteConnection,
  providerFor,
  readInstallationHosts,
  testConnection as runConnectionTest,
  OPERATORS,
} from '../services/k8sConnections.js';
import { getAllClusters, saveClusters, MAX_CLUSTERS } from '../services/clusterUtils.js';
import { clearCapabilities } from '../services/capabilities.js';
import { executeQuery } from '../services/clickhouse.js';

// A K8sError carries a message written for a person.
function fail(res, err) {
  const isK8s = typeof err?.code === 'string' && err.code.startsWith('K8S_');
  const message = isK8s ? err.message : 'The request could not be completed.';
  const status = err?.code === 'K8S_FORBIDDEN' ? 403 : 502;
  return res.status(status).json({ error: message, code: err?.code ?? null });
}

// GET /api/k8s/operators
export function listOperators(req, res) {
  return res.json({ operators: Object.values(OPERATORS) });
}

// GET /api/k8s/connections
export function listK8sConnections(req, res) {
  try {
    return res.json(listConnections());
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// POST /api/k8s/connections
export function createK8sConnection(req, res) {
  const { name, apiAddress, caCertificate, token, namespaces } = req.body || {};

  if (!name?.trim()) return res.status(400).json({ error: 'A name is required.' });
  if (!apiAddress?.trim()) return res.status(400).json({ error: 'An API address is required.' });
  if (!caCertificate?.trim()) {
    return res.status(400).json({ error: 'A CA certificate is required.' });
  }
  if (!token?.trim()) return res.status(400).json({ error: 'A token is required.' });
  if (!/^https:\/\//i.test(apiAddress.trim())) {
    return res.status(400).json({ error: 'The API address must start with https://' });
  }

  try {
    const id = saveConnection({
      name: name.trim(),
      apiAddress: apiAddress.trim(),
      caCertificate: caCertificate.trim(),
      token: token.trim(),
      namespaces,
    });
    return res.status(201).json({ id });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// PUT /api/k8s/connections/:id
export function updateK8sConnection(req, res) {
  const { id } = req.params;
  const existing = getConnection(id);
  if (!existing) return res.status(404).json({ error: 'Connection not found.' });

  const { name, apiAddress, caCertificate, token, namespaces } = req.body || {};

  try {
    saveConnection({
      id,
      name: name?.trim() || existing.name,
      apiAddress: apiAddress?.trim() || existing.apiAddress,
      // Absent certificate or token means keep the stored one.
      caCertificate: caCertificate?.trim() || undefined,
      token: token?.trim() || undefined,
      namespaces: namespaces ?? existing.namespaces,
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// DELETE /api/k8s/connections/:id
export function deleteK8sConnection(req, res) {
  const { id } = req.params;

  // Refuse while a cluster still depends on it, rather than leaving that cluster pointing at nothing.
  const dependent = getAllClusters().filter((c) => c.k8s?.connectionId === id);
  if (dependent.length) {
    return res.status(409).json({
      error: `This connection is used by ${dependent.length} cluster(s). Remove them first.`,
      clusters: dependent.map((c) => c.name),
    });
  }

  try {
    deleteConnection(id);
    return res.json({ deleted: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// POST /api/k8s/test
export async function testK8sConnection(req, res) {
  const { apiAddress, caCertificate, token, namespace, connectionId } = req.body || {};

  try {
    // Testing a stored connection re-uses its token rather than asking the caller to send it again.
    if (connectionId) {
      const stored = getConnection(connectionId, { includeToken: true });
      if (!stored) return res.status(404).json({ error: 'Connection not found.' });
      return res.json(
        await runConnectionTest({
          apiAddress: stored.apiAddress,
          caCertificate: stored.caCertificate,
          token: stored.token,
          namespace,
        }),
      );
    }

    if (!apiAddress || !caCertificate || !token) {
      return res.status(400).json({ error: 'Address, certificate and token are required.' });
    }

    return res.json(await runConnectionTest({ apiAddress, caCertificate, token, namespace }));
  } catch (err) {
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/namespaces
export async function listNamespaces(req, res) {
  try {
    const { provider, connection } = providerFor(req.params.id);

    // An explicit allowlist means we do not need to ask the cluster
    if (connection.namespaces?.length) {
      return res.json({ namespaces: connection.namespaces, source: 'allowlist' });
    }

    return res.json({ namespaces: await provider.listNamespaces(), source: 'cluster' });
  } catch (err) {
    if (err?.code === 'K8S_FORBIDDEN') {
      // Expected with a namespace-scoped token.
      return res.json({ namespaces: [], source: 'restricted' });
    }
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/installations?namespace=
export async function listInstallations(req, res) {
  const { namespace } = req.query;
  if (!namespace) return res.status(400).json({ error: 'A namespace is required.' });

  try {
    const { provider } = providerFor(req.params.id, req.query.operator);
    return res.json({ installations: await provider.listInstallations(namespace) });
  } catch (err) {
    return fail(res, err);
  }
}

// GET /api/k8s/connections/:id/installations/:name?namespace=
export async function getInstallation(req, res) {
  const { namespace } = req.query;
  if (!namespace) return res.status(400).json({ error: 'A namespace is required.' });

  try {
    const { provider } = providerFor(req.params.id, req.query.operator);
    const detail = await provider.getInstallation(namespace, req.params.name);
    return res.json({ ...detail, unmanaged: provider.isUnmanaged(detail) });
  } catch (err) {
    return fail(res, err);
  }
}

// Try the ClickHouse® credentials against the endpoint the user gave.
async function checkClickHouseCredentials({ host, port, secure, user, password }) {
  try {
    const result = await executeQuery({
      host,
      port,
      secure,
      user,
      password,
      readOnly: true,
      sql: 'SELECT version() AS version',
    });
    return { ok: true, version: result?.rows?.[0]?.version ?? null };
  } catch (err) {
    const raw = String(err?.message ?? '');
    const lower = raw.toLowerCase();

    // Authentication rejected.
    if (
      lower.includes('authentication failed') ||
      lower.includes('password is incorrect') ||
      lower.includes('unknown user') ||
      lower.includes('access denied') ||
      lower.includes('code: 516') ||
      lower.includes('code: 192')
    ) {
      return {
        ok: false,
        reason: 'auth',
        message:
          user === 'default'
            ? 'ClickHouse® rejected these credentials. The default user is often restricted to the cluster\'s own pods, so it cannot connect from outside even with the right password. Create a dedicated user instead.'
            : 'ClickHouse® rejected these credentials.',
        detail: raw,
      };
    }

    if (
      lower.includes('econnrefused') ||
      lower.includes('etimedout') ||
      lower.includes('enotfound') ||
      lower.includes('ehostunreach') ||
      lower.includes('network')
    ) {
      return {
        ok: false,
        reason: 'unreachable',
        message:
          'The address could not be reached. Addresses Kubernetes uses internally do not resolve from outside the cluster, so this needs a load balancer, an ingress or a port forward.',
        detail: raw,
      };
    }

    return {
      ok: false,
      reason: 'unknown',
      message: 'ClickHouse® did not answer.',
      detail: raw,
    };
  }
}

// POST /api/k8s/import Creates a CHOps cluster from an installation.
export async function importInstallation(req, res) {
  const {
    connectionId,
    namespace,
    installation,
    operator = 'akoc',
    displayName,
    endpoint,
    port,
    secure,
    chUser,
    chPassword,
    acknowledgeCredentialFailure = false,
  } = req.body || {};

  if (!OPERATORS[operator]) {
    return res.status(400).json({ error: 'Unknown operator.' });
  }

  if (!connectionId || !namespace || !installation) {
    return res.status(400).json({
      error: 'A connection, namespace and installation are required.',
    });
  }
  if (!endpoint?.trim()) {
    return res.status(400).json({
      error:
        'A reachable ClickHouse address is required. Internal cluster addresses do not resolve from outside the cluster.',
    });
  }

  const existing = getAllClusters();
  if (existing.length >= MAX_CLUSTERS) {
    return res.status(400).json({
      error: `Maximum ${MAX_CLUSTERS} clusters allowed. Remove one before adding another.`,
    });
  }

  const duplicate = existing.find(
    (c) => c.k8s?.namespace === namespace && c.k8s?.installation === installation,
  );
  if (duplicate) {
    return res.status(409).json({
      error: `${installation} in ${namespace} has already been added as "${duplicate.name}".`,
    });
  }

  // The display name defaults to the installation name
  const proposedName = (displayName?.trim() || installation).toLowerCase();
  const nameClash = existing.find((c) => c.name.trim().toLowerCase() === proposedName);
  if (nameClash) {
    return res.status(409).json({
      error: `A cluster named "${nameClash.name}" already exists. Give this one a different display name.`,
    });
  }

  try {
    const nodes = await readInstallationHosts(connectionId, namespace, installation, operator);
    if (!nodes.length) {
      return res.status(400).json({
        error: 'That installation reported no hosts. It may not have finished starting.',
      });
    }

    const resolvedPort = port || 8443;
    const resolvedSecure = secure !== false;

    // Checked before anything is written.
    const credentials = await checkClickHouseCredentials({
      host: endpoint.trim(),
      port: resolvedPort,
      secure: resolvedSecure,
      user: chUser || 'default',
      password: chPassword || '',
    });

    if (!credentials.ok && !acknowledgeCredentialFailure) {
      // Not an error status.
      return res.json({
        needsConfirmation: true,
        credentialCheck: credentials,
        hosts: nodes.length,
      });
    }

    const cluster = {
      id: `k8s_${namespace}_${installation}`.replace(/[^a-zA-Z0-9_]/g, '_'),
      name: displayName?.trim() || installation,
      kind: 'k8s',
      chUser: chUser || 'default',
      chPassword: chPassword || '',
      port: resolvedPort,
      secure: resolvedSecure,
      k8s: { connectionId, namespace, installation, operator },
      // The endpoint is the address queries actually go to.
      nodes: nodes.map((n) => ({
        ...n,
        host: endpoint.trim(),
        port: resolvedPort,
        secure: resolvedSecure,
      })),
    };

    try {
      saveClusters([...existing, cluster]);
    } catch (err) {
      // A name collision or the cluster cap.
      return res.status(400).json({ error: err.message });
    }
    clearCapabilities(cluster.id);
    return res.status(201).json({
      id: cluster.id,
      hosts: nodes.length,
      // Carried back so the interface can say what is unavailable until the credentials are
      credentialCheck: credentials,
    });
  } catch (err) {
    return fail(res, err);
  }
}

// POST /api/k8s/clusters/:id/refresh
export async function refreshCluster(req, res) {
  const cluster = getAllClusters().find((c) => c.id === req.params.id);
  if (!cluster) return res.status(404).json({ error: 'Cluster not found.' });
  if (cluster.kind !== 'k8s') {
    return res.status(400).json({ error: 'That cluster was not added through Kubernetes.' });
  }

  try {
    const nodes = await readInstallationHosts(
      cluster.k8s.connectionId,
      cluster.k8s.namespace,
      cluster.k8s.installation,
      cluster.k8s.operator,
    );

    const endpoint = cluster.nodes[0]?.host;
    const port = cluster.nodes[0]?.port ?? 8443;

    const updated = {
      ...cluster,
      nodes: nodes.map((n) => ({ ...n, host: endpoint, port })),
    };

    const others = getAllClusters().filter((c) => c.id !== cluster.id);
    saveClusters([...others, updated]);

    return res.json({ ok: true, hosts: nodes.length, refreshedAt: new Date().toISOString() });
  } catch (err) {
    return fail(res, err);
  }
}
