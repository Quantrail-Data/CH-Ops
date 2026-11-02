// k8s-health-decision.test.js - When a health check result sends a notification.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { decideHealthNotification } from "../../src/backend/services/k8sHealthDecision.js";

const NOTIFIED_FAILURE = { status: "fail", consecutiveFails: 2, notified: true };

describe("decideHealthNotification", () => {
  it("sends nothing on the first failure", () => {
    const nextState = decideHealthNotification(undefined, false);
    expect(nextState.notification).toBe(null);
    expect(nextState.consecutiveFails).toBe(1);
  });

  it("sends one failure on the second failure in a row, and no more after that", () => {
    const first = decideHealthNotification(undefined, false);
    const second = decideHealthNotification(first, false);
    expect(second.notification).toBe("failure");
    const third = decideHealthNotification(second, false);
    expect(third.notification).toBe(null);
  });

  it("sends a recovery only after a failure was sent", () => {
    expect(decideHealthNotification(NOTIFIED_FAILURE, true).notification).toBe("recovery");
    const failureNotSent = { status: "fail", consecutiveFails: 1, notified: false };
    expect(decideHealthNotification(failureNotSent, true).notification).toBe(null);
  });

  it("treats unknown as neither failure nor recovery", () => {
    const nextState = decideHealthNotification(NOTIFIED_FAILURE, null);
    expect(nextState.notification).toBe(null);
    expect(nextState.notified).toBe(true);
  });

  it("counts from zero again when an unknown comes between two failures", () => {
    let state = decideHealthNotification(undefined, false);
    state = decideHealthNotification(state, null);
    state = decideHealthNotification(state, false);
    expect(state.notification).toBe(null);
  });
});
