// k8sHealth.js - The Kubernetes health checks, used by the Health tab and by the health alerts.
// Copyright (C) 2026 Quantrail Data Private Limited

import { providerFor } from "./k8sConnections.js";
import { getClusterById } from "./clusterUtils.js";
import { ensureCapabilities, unavailableFeatures } from "./capabilities.js";
import { buildZoneRisks } from "./k8s/zoneRisks.js";

// Finds the cluster and its Kubernetes provider. Same as resolve() in controllers/k8sInsight.js.
function findKubernetesCluster(clusterId) {
  const cluster = getClusterById(clusterId);
  if (!cluster) {
    throw Object.assign(new Error("Cluster not found."), { status: 404 });
  }
  if (cluster.kind !== "k8s") {
    throw Object.assign(
      new Error("That cluster was not added through Kubernetes."),
      { status: 400 },
    );
  }
  const { provider } = providerFor(
    cluster.k8s.connectionId,
    cluster.k8s.operator,
  );
  return {
    cluster,
    provider,
    namespace: cluster.k8s.namespace,
    installationName: cluster.k8s.installation,
  };
}

// Runs every check one time. Returns { checks, passing, unknown, total, unavailable }.
// Each check is { name, ok, detail }: ok is true (pass), false (fail) or null (could not run).
export async function runHealthChecks(clusterId) {
  const { cluster, provider, namespace, installationName } =
    findKubernetesCluster(clusterId);
  await ensureCapabilities(cluster.id);
  const [hosts, installation, network, volumes, operator] = await Promise.all([
    provider.getHosts(namespace, installationName),
    provider.getInstallation(namespace, installationName),
    provider.getNetwork(namespace, installationName),
    provider.getStorage(namespace, installationName),
    provider.getOperatorHealth(namespace),
  ]);

  const checks = [];
  function addCheck(name, ok, detail) {
    checks.push({ name, ok, detail });
  }
  function addUnknownCheck(name, detail) {
    checks.push({ name, ok: null, detail });
  }

  addCheck(
    "Operator reachable",
    operator.reachable,
    "If the operator is down the cluster looks healthy and nothing you change will apply.",
  );

  // AKOC gives its own readiness verdict. OCKO does not, so the pod readiness counts.
  function isHostReady(host) {
    return host.operatorReady === null ? host.podReady : host.operatorReady;
  }
  if (hosts.length === 0) {
    addUnknownCheck(
      "All hosts ready",
      "No hosts reported, so readiness cannot be checked.",
    );
    addUnknownCheck("All hosts in rotation", "No hosts reported.");
  } else {
    addCheck(
      "All hosts ready",
      hosts.every(isHostReady),
      `${hosts.filter(isHostReady).length} of ${hosts.length} ready`,
    );
    addCheck(
      "All hosts in rotation",
      hosts.every((host) => host.inRotation?.ready !== false),
      "A pod can be Running and still be removed from the service.",
    );
  }

  const imageNames = [
    ...new Set(hosts.map((host) => host.image).filter(Boolean)),
  ];
  addCheck(
    "No version skew",
    imageNames.length <= 1,
    imageNames.length > 1
      ? `Running ${imageNames.length} different images`
      : "Consistent",
  );

  addCheck(
    "Health signals trustworthy",
    !installation.lifecycle.troubleshoot,
    installation.lifecycle.troubleshoot
      ? "Troubleshoot mode is on, which disables liveness and readiness probes. Pod readiness means nothing right now."
      : "Probes are active.",
  );

  addCheck(
    "Protected against node drains",
    network.disruptionBudgets.length > 0,
    network.disruptionBudgets.length === 0
      ? "No pod disruption budget exists, so a node drain can evict several replicas at once."
      : "A budget is in place.",
  );

  addCheck(
    "No stalled volume expansion",
    !volumes.some(
      (volume) =>
        String(volume.resizeState).includes("Pending") ||
        String(volume.resizeState).includes("Failed"),
    ),
    "NodeResizePending looks finished and is not.",
  );

  const volumesWithKnownPolicy = volumes.filter(
    (volume) => volume.reclaimPolicy,
  );
  if (!volumes.length || volumesWithKnownPolicy.length !== volumes.length) {
    addUnknownCheck(
      "Data survives a scale-down",
      "The reclaim policy could not be read for every volume, so this cannot be answered either way.",
    );
  } else {
    addCheck(
      "Data survives a scale-down",
      volumesWithKnownPolicy.every(
        (volume) => volume.reclaimPolicy === "Retain",
      ),
      "Volumes without a Retain policy are deleted when their host is removed.",
    );
  }

  // A pod without a memory limit can use all the memory of its node.
  if (hosts.length === 0) {
    addUnknownCheck("Memory limits set", "No hosts reported.");
  } else {
    const hostsWithoutMemoryLimit = hosts.filter(
      (host) => !host.resources?.memoryLimit,
    );
    addCheck(
      "Memory limits set",
      hostsWithoutMemoryLimit.length === 0,
      hostsWithoutMemoryLimit.length > 0
        ? `${hostsWithoutMemoryLimit.length} of ${hosts.length} pods have no memory limit`
        : "Every pod has a memory limit.",
    );
  }

  // Replicas of one shard in one availability zone fail together.
  let zoneByNode = null;
  try {
    zoneByNode = await provider.getNodeZones(
      hosts.map((host) => host.node).filter(Boolean),
    );
  } catch {
    // No nodes grant. The check then shows as unknown.
  }
  if (!zoneByNode || zoneByNode.size === 0) {
    addUnknownCheck(
      "Replicas spread across zones",
      "Node zone labels could not be read. The token may lack the nodes grant, or the nodes have no zone label.",
    );
  } else {
    const zoneRisks = buildZoneRisks(hosts, zoneByNode);
    let zoneDetail = "No shard keeps two replicas in one zone.";
    if (zoneRisks.length > 0) {
      const riskTexts = zoneRisks.map(
        (risk) =>
          `shard ${risk.shard} has ${risk.replicas} replicas in ${risk.zone}`,
      );
      zoneDetail = riskTexts.join("; ");
    }
    addCheck("Replicas spread across zones", zoneRisks.length === 0, zoneDetail);
  }

  return {
    checks,
    passing: checks.filter((check) => check.ok === true).length,
    unknown: checks.filter((check) => check.ok === null).length,
    // A check that could not run does not count against the cluster.
    total: checks.filter((check) => check.ok !== null).length,
    unavailable: unavailableFeatures(cluster.id),
  };
}
