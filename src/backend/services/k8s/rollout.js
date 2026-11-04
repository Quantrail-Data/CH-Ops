// Rollout state of the StatefulSets of one installation.
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const ROLLOUT_STATUS = {
  COMPLETE: 'complete',
  IN_PROGRESS: 'in progress',
  STUCK: 'stuck',
};

// A pod that waits for one of these reasons does not recover without a change.
const STUCK_WAITING_REASONS = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'InvalidImageName',
  'CreateContainerConfigError',
  'CreateContainerError',
]);

function stuckReasonOf(host) {
  if (host.podReady) return null;
  if (STUCK_WAITING_REASONS.has(host.waitingReason)) {
    return `${host.podName} is waiting: ${host.waitingReason}`;
  }
  if (host.restartCount > 0) {
    return `${host.podName} is not ready and has restarted ${host.restartCount} times`;
  }
  return null;
}

// statefulSet is the object from the Kubernetes API.
// hosts are the hosts of the installation, from provider.getHosts.
export function summarizeStatefulSet(statefulSet, hosts = []) {
  const spec = statefulSet.spec ?? {};
  const status = statefulSet.status ?? {};
  const name = statefulSet.metadata?.name ?? '';

  const desired = spec.replicas ?? 1;
  const current = status.replicas ?? 0;
  const ready = status.readyReplicas ?? 0;
  const updated = status.updatedReplicas ?? 0;
  const currentRevision = status.currentRevision ?? null;
  const updateRevision = status.updateRevision ?? currentRevision;

  // The controller has not read the latest change yet.
  const changeNotSeen =
    statefulSet.metadata?.generation != null &&
    status.observedGeneration != null &&
    status.observedGeneration < statefulSet.metadata.generation;

  const complete =
    !changeNotSeen &&
    current === desired &&
    ready === desired &&
    updated === desired &&
    currentRevision === updateRevision;

  let rolloutStatus = ROLLOUT_STATUS.COMPLETE;
  let stuckReason = null;
  if (!complete) {
    const ownHosts = hosts.filter((host) => host.statefulSetName === name);
    stuckReason = ownHosts.map(stuckReasonOf).find(Boolean) ?? null;
    rolloutStatus = stuckReason ? ROLLOUT_STATUS.STUCK : ROLLOUT_STATUS.IN_PROGRESS;
  }

  return {
    name,
    desired,
    current,
    ready,
    updated,
    currentRevision,
    updateRevision,
    status: rolloutStatus,
    stuckReason,
  };
}
