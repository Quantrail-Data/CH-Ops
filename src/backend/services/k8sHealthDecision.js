// k8sHealthDecision.js - Decides when a health check result sends a notification.
// Copyright (C) 2026 Quantrail Data Private Limited

// A failure must happen this many times in a row before it sends a notification.
export const FAILURES_BEFORE_NOTIFICATION = 2;

// previousState: the stored state of the check, or undefined the first time.
// checkResult: true (pass), false (fail) or null (could not run).
// Returns the next state and notification: "failure", "recovery" or null.
export function decideHealthNotification(previousState, checkResult) {
  const previous = previousState ?? {
    status: "unknown",
    consecutiveFails: 0,
    notified: false,
  };

  if (checkResult === null) {
    // An unknown result gives no information. It does not send a failure or a recovery.
    return {
      status: "unknown",
      consecutiveFails: 0,
      notified: previous.notified,
      notification: null,
    };
  }

  if (checkResult === false) {
    const consecutiveFails = previous.consecutiveFails + 1;
    const sendFailure =
      consecutiveFails >= FAILURES_BEFORE_NOTIFICATION && !previous.notified;
    return {
      status: "fail",
      consecutiveFails,
      notified: previous.notified || sendFailure,
      notification: sendFailure ? "failure" : null,
    };
  }

  // The check passes. Send a recovery only when a failure was sent before.
  return {
    status: "pass",
    consecutiveFails: 0,
    notified: false,
    notification: previous.notified ? "recovery" : null,
  };
}
