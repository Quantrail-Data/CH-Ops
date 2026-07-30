// API paths, label keys and version discovery for OCKO.
// Contributors -> Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const OCKO_GROUP = 'clickhouse.com';

// The CRDs are at v1alpha1 today.
export const OCKO_FALLBACK_VERSION = 'v1alpha1';

export const LABEL = {
  instance: 'app.kubernetes.io/instance',
  name: 'app.kubernetes.io/name',
  role: 'clickhouse.com/role',
  shard: 'clickhouse.com/shard-id',
  replica: 'clickhouse.com/replica-id',
  keeperReplica: 'clickhouse.com/keeper-replica-id',
  disk: 'clickhouse.com/disk',
};

export const ROLE = {
  server: 'clickhouse-server',
  keeper: 'clickhouse-keeper',
};

// Ask the API server which versions of a group it serves.
export async function discoverVersion(client, group = OCKO_GROUP) {
  try {
    const body = await client.get(`/apis/${group}`);
    return body?.preferredVersion?.version ?? body?.versions?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

// Objects the operator creates are named <cluster>-clickhouse and <keeper>-keeper
export function instanceOf(clusterName) {
  return `${clusterName}-clickhouse`;
}

export function createOckoPaths(version = OCKO_FALLBACK_VERSION) {
  const base = `/apis/${OCKO_GROUP}/${version}`;
  return {
    clusters: (ns) => `${base}/namespaces/${ns}/clickhouseclusters`,
    cluster: (ns, name) => `${base}/namespaces/${ns}/clickhouseclusters/${name}`,
    keepers: (ns) => `${base}/namespaces/${ns}/keeperclusters`,
    keeper: (ns, name) => `${base}/namespaces/${ns}/keeperclusters/${name}`,
  };
}

export const selectors = {
  serverPods: (clusterName) =>
    `${LABEL.instance}=${instanceOf(clusterName)},${LABEL.role}=${ROLE.server}`,
  ownedByInstance: (clusterName) => `${LABEL.instance}=${instanceOf(clusterName)}`,
  keeperOwnedBy: (keeperName) => `${LABEL.instance}=${keeperName}-keeper`,
};
