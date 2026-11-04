// k8s-rollout.test.js - The rollout status of a StatefulSet.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { summarizeStatefulSet, ROLLOUT_STATUS } from "../../src/backend/services/k8s/rollout.js";

function statefulSet({ desired = 1, current = 1, ready = 1, updated = 1, currentRevision = "rev-1", updateRevision = "rev-1", generation = 2, observedGeneration = 2 } = {}) {
  return {
    metadata: { name: "chi-demo-main-0-0", generation },
    spec: { replicas: desired },
    status: {
      replicas: current,
      readyReplicas: ready,
      updatedReplicas: updated,
      currentRevision,
      updateRevision,
      observedGeneration,
    },
  };
}

function host(overrides = {}) {
  return {
    podName: "chi-demo-main-0-0-0",
    statefulSetName: "chi-demo-main-0-0",
    podReady: false,
    restartCount: 0,
    waitingReason: null,
    ...overrides,
  };
}

describe("summarizeStatefulSet", () => {
  it("reports the replica counts and the revisions", () => {
    const summary = summarizeStatefulSet(statefulSet({ desired: 3, current: 3, ready: 2, updated: 1, updateRevision: "rev-2" }));
    expect(summary).toMatchObject({
      name: "chi-demo-main-0-0",
      desired: 3,
      current: 3,
      ready: 2,
      updated: 1,
      currentRevision: "rev-1",
      updateRevision: "rev-2",
    });
  });

  it("is complete when every replica is ready and updated to one revision", () => {
    expect(summarizeStatefulSet(statefulSet()).status).toBe(ROLLOUT_STATUS.COMPLETE);
  });

  it("is in progress while the revisions differ", () => {
    const summary = summarizeStatefulSet(statefulSet({ updated: 0, updateRevision: "rev-2" }), [host()]);
    expect(summary.status).toBe(ROLLOUT_STATUS.IN_PROGRESS);
  });

  it("is in progress while the controller has not seen the latest change", () => {
    const summary = summarizeStatefulSet(statefulSet({ generation: 3, observedGeneration: 2 }));
    expect(summary.status).toBe(ROLLOUT_STATUS.IN_PROGRESS);
  });

  it("is stuck when a pod of the set waits in a back-off", () => {
    const summary = summarizeStatefulSet(statefulSet({ ready: 0 }), [host({ waitingReason: "ImagePullBackOff" })]);
    expect(summary.status).toBe(ROLLOUT_STATUS.STUCK);
    expect(summary.stuckReason).toContain("ImagePullBackOff");
  });

  it("is stuck when a pod of the set is not ready and restarts", () => {
    const summary = summarizeStatefulSet(statefulSet({ ready: 0 }), [host({ restartCount: 4 })]);
    expect(summary.status).toBe(ROLLOUT_STATUS.STUCK);
  });

  it("ignores pods of other StatefulSets", () => {
    const otherHost = host({ statefulSetName: "chi-demo-main-1-0", waitingReason: "CrashLoopBackOff" });
    const summary = summarizeStatefulSet(statefulSet({ ready: 0 }), [otherHost]);
    expect(summary.status).toBe(ROLLOUT_STATUS.IN_PROGRESS);
  });
});
