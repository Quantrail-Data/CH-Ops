// zoneRisks.js - Finds shards that have two or more replicas in one availability zone.
// Copyright (C) 2026 Quantrail Data Private Limited

// hosts: the rows from getHosts. zoneByNode: a Map from node name to zone.
// Returns a list of { cluster, shard, zone, replicas }, or null when zoneByNode is null.
export function buildZoneRisks(hosts, zoneByNode) {
  if (!zoneByNode) return null;

  const replicaCountByShardAndZone = new Map();
  for (const host of hosts || []) {
    if (!host.node) continue;
    const zone = zoneByNode.get(host.node);
    if (!zone) continue;
    const key = `${host.cluster}|${host.shard}|${zone}`;
    replicaCountByShardAndZone.set(
      key,
      (replicaCountByShardAndZone.get(key) ?? 0) + 1,
    );
  }

  const risks = [];
  for (const [key, replicaCount] of replicaCountByShardAndZone) {
    if (replicaCount < 2) continue;
    const [cluster, shard, zone] = key.split("|");
    risks.push({ cluster, shard: Number(shard), zone, replicas: replicaCount });
  }
  return risks;
}
