// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Praveen kumar, Kathir Moorthy
// Kubernetes connection storage, permission checks and provider selection.

import { eq } from 'drizzle-orm';
import { db, k8sConnections } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';
import { createK8sClient, paths } from './k8s/client.js';
import { createAkocProvider } from './k8s/akoc.js';
import { createOckoProvider } from './k8s/ocko.js';
import { discoverVersion, OCKO_GROUP } from './k8s/ockoPaths.js';
import { K8S_ERROR } from './k8s/errors.js';

// Everything CHOps reads, expressed the way SelfSubjectRulesReview reports it
const REQUIRED_PERMISSIONS = [
  { group: 'clickhouse.altinity.com', resource: 'clickhouseinstallations', verb: 'list' },
  { group: '', resource: 'pods', verb: 'list' },
  { group: '', resource: 'pods/log', verb: 'get' },
  { group: '', resource: 'persistentvolumeclaims', verb: 'list' },
  { group: '', resource: 'services', verb: 'list' },
  { group: '', resource: 'configmaps', verb: 'list' },
  { group: '', resource: 'events', verb: 'list' },
  { group: 'discovery.k8s.io', resource: 'endpointslices', verb: 'list' },
  { group: 'apps', resource: 'statefulsets', verb: 'list' },
];

// Features that degrade rather than fail when a permission is absent.
const OPTIONAL_PERMISSIONS = [
  {
    group: 'storage.k8s.io',
    resource: 'storageclasses',
    verb: 'list',
    feature: 'Volume expansion checks',
  },
  {
    group: 'policy',
    resource: 'poddisruptionbudgets',
    verb: 'list',
    feature: 'Node drain survivability',
  },
  {
    group: 'networking.k8s.io',
    resource: 'networkpolicies',
    verb: 'list',
    feature: 'Connectivity diagnostics',
  },
  {
    group: '',
    resource: 'resourcequotas',
    verb: 'list',
    feature: 'Scale-out headroom',
  },
];

function rowToConnection(row, { includeToken = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    apiAddress: row.apiAddress,
    namespaces: row.namespacesJson ? JSON.parse(row.namespacesJson) : null,
    affinityOk: row.affinityOk,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Only ever true for internal callers building a client.
    ...(includeToken
      ? { token: decrypt(row.tokenEnc), caCertificate: row.caCertificate }
      : {}),
  };
}

export function listConnections() {
  return db.select().from(k8sConnections).all().map((r) => rowToConnection(r));
}

export function getConnection(id, options) {
  const row = db.select().from(k8sConnections).where(eq(k8sConnections.id, id)).get();
  return rowToConnection(row, options);
}

export function saveConnection({ id, name, apiAddress, caCertificate, token, namespaces }) {
  const now = new Date().toISOString();
  const connectionId = id || `k8s_${Date.now().toString(36)}`;

  const values = {
    name,
    // Trim trailing slashes without using a regex on user input
    apiAddress: (() => {
      let a = String(apiAddress || '');
      while (a.endsWith('/')) a = a.slice(0, -1);
      return a;
    })(),
    namespacesJson: namespaces?.length ? JSON.stringify(namespaces) : null,
    updatedAt: now,
  };
  if (caCertificate) values.caCertificate = caCertificate;
  // Only overwrite the stored token when a new one was supplied
  if (token) values.tokenEnc = encrypt(token);

  const existing = db
    .select()
    .from(k8sConnections)
    .where(eq(k8sConnections.id, connectionId))
    .get();

  if (existing) {
    db.update(k8sConnections).set(values).where(eq(k8sConnections.id, connectionId)).run();
  } else {
    if (!token) throw new Error('A token is required when creating a connection.');
    if (!caCertificate) throw new Error('A CA certificate is required when creating a connection.');
    db.insert(k8sConnections).values({ id: connectionId, ...values }).run();
  }

  return connectionId;
}

export function deleteConnection(id) {
  db.delete(k8sConnections).where(eq(k8sConnections.id, id)).run();
}

export function setAffinityResult(id, sticky) {
  db.update(k8sConnections)
    .set({ affinityOk: sticky, updatedAt: new Date().toISOString() })
    .where(eq(k8sConnections.id, id))
    .run();
}

export const OPERATORS = {
  akoc: {
    id: 'akoc',
    name: 'Altinity® Kubernetes Operator for ClickHouse®',
    short: 'AKOC',
    group: 'clickhouse.altinity.com',
    earlyAccess: false,
  },
  ocko: {
    id: 'ocko',
    name: 'Official ClickHouse® Kubernetes Operator',
    short: 'OCKO',
    group: OCKO_GROUP,
    // That operator's CRDs are at v1alpha1
    earlyAccess: true,
  },
};

// Build a client and a provider for a stored connection.
export function providerFor(connectionId, operator = 'akoc') {
  const conn = getConnection(connectionId, { includeToken: true });
  if (!conn) throw new Error('Kubernetes connection not found.');

  const client = createK8sClient({
    apiAddress: conn.apiAddress,
    caCertificate: conn.caCertificate,
    token: conn.token,
  });

  const provider =
    operator === 'ocko' ? createOckoProvider(client) : createAkocProvider(client);

  return { client, provider, connection: conn, operator };
}

// Which operators are installed in this cluster.
export async function detectOperators(client, namespace) {
  const found = [];

  try {
    await client.listPage(
      `/apis/clickhouse.altinity.com/v1/namespaces/${namespace}/clickhouseinstallations`,
      { limit: 1, context: { isCustomResource: true, namespace } },
    );
    found.push('akoc');
  } catch {
    // Absent, which a 404 on the resource type reports.
  }

  if (await discoverVersion(client, OCKO_GROUP)) found.push('ocko');

  return found;
}

// Ask the cluster what this token is allowed to do, in one namespace.
export async function checkPermissions(client, namespace) {
  let rules;
  try {
    const review = await client.post(paths.selfSubjectRulesReviews(), {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectRulesReview',
      spec: { namespace },
    });
    rules = review?.status?.resourceRules ?? [];
  } catch (err) {
    // Not fatal.
    return { checked: false, reason: err.message, missing: [], degraded: [] };
  }

  const allows = ({ group, resource, verb }) =>
    rules.some((rule) => {
      const groups = rule.apiGroups ?? [];
      const resources = rule.resources ?? [];
      const verbs = rule.verbs ?? [];
      const groupOk = groups.includes('*') || groups.includes(group);
      const resourceOk = resources.includes('*') || resources.includes(resource);
      const verbOk = verbs.includes('*') || verbs.includes(verb);
      return groupOk && resourceOk && verbOk;
    });

  return {
    checked: true,
    missing: REQUIRED_PERMISSIONS.filter((p) => !allows(p)),
    degraded: OPTIONAL_PERMISSIONS.filter((p) => !allows(p)),
  };
}

// Test a connection without saving it.
export async function testConnection({ apiAddress, caCertificate, token, namespace }) {
  const result = {
    kubernetes: { ok: false, message: null, code: null },
    permissions: null,
    operator: null,
  };

  let client;
  try {
    client = createK8sClient({ apiAddress, caCertificate, token });
  } catch (err) {
    result.kubernetes.message = err.message;
    return result;
  }

  // Cheapest possible authenticated call.
  try {
    await client.listPage(paths.namespaces(), { limit: 1 });
    result.kubernetes.ok = true;
    result.kubernetes.message = 'Connected.';
  } catch (err) {
    // A 403 here is fine when the token is namespace-scoped: it proves the token is valid
    if (err.code === K8S_ERROR.FORBIDDEN && namespace) {
      result.kubernetes.ok = true;
      result.kubernetes.message =
        'Connected. This token cannot list namespaces, so you will need to type the namespace name.';
    } else {
      result.kubernetes.message = err.message;
      result.kubernetes.code = err.code;
      return result;
    }
  }

  if (namespace) {
    result.permissions = await checkPermissions(client, namespace);
    result.operators = await detectOperators(client, namespace);
    // Kept for the existing interface, which reports AKOC reachability.
    result.operator = result.operators.includes('akoc')
      ? { reachable: true }
      : {
        reachable: false,
        message: result.operators.includes('ocko')
          ? 'AKOC was not found. This namespace runs the Official ClickHouse® Kubernetes Operator (OCKO).'
          : 'No supported ClickHouse® operator was found in this namespace.',
      };
  }

  return result;
}

// Read the hosts of an installation and shape them the way clusterUtils expects.
export async function readInstallationHosts(connectionId, namespace, installation, operator = 'akoc') {
  const { provider } = providerFor(connectionId, operator);
  const hosts = await provider.getHosts(namespace, installation);

  return hosts
    .filter((h) => h.fqdn || h.podName)
    .map((h) => ({
      // A readable name derived from position, which is stable in a way pod names are not.
      name: `${h.cluster}-${h.shard}-${h.replica}`,
      host: h.fqdn || h.podName,
      port: 8123,
      shard: h.shard,
      replica: h.replica,
      podName: h.podName,
      secure: false,
    }));
}
