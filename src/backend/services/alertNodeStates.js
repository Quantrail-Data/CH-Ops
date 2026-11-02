// alertNodeStates.js - The state of an alert rule on each node, and which notifications it sends.
// Copyright (C) 2026 Quantrail Data Private Limited
//
// Each node of a rule has its own state. So the first firing node does not hide a second
// node that starts to fire. The rule still sends one message for all its nodes. It sends a new
// message when the list of firing nodes changes. It sends "resolved" when the list is empty again.
// Query errors and breaches have different states. So an error on one node does not stop the
// breach messages of the other nodes.

// The name that identifies a node in the rule state. Names are unique within a cluster.
export function nodeKey(node) {
  return node.name || node.host;
}

// The nodes that a rule runs on. selectedNodes holds node names. Rules saved before node names
// were used hold hosts: such a value matches the nodes with that host.
export function selectRuleNodes(allNodes, selectedNodes) {
  if (!Array.isArray(selectedNodes) || selectedNodes.length === 0) return allNodes;
  const nodeNames = new Set(allNodes.map(nodeKey));
  return allNodes.filter(
    (node) =>
      selectedNodes.includes(nodeKey(node)) ||
      (selectedNodes.includes(node.host) && !nodeNames.has(node.host)),
  );
}

// previousState: the stored state of one node, or undefined the first time.
// result: { value, breached, error } from this run on that node.
// When the query fails, the breach state does not change.
// The node did not answer, so its state is not known.
export function nextNodeState(previousState, result, breachRunsRequired) {
  const previous = previousState ?? { firing: false, breachRunCount: 0 };
  if (result.error) {
    return {
      firing: previous.firing,
      breachRunCount: previous.breachRunCount,
      value: null,
      error: result.error,
    };
  }
  const breachRunCount = result.breached ? previous.breachRunCount + 1 : 0;
  return {
    firing: result.breached && breachRunCount >= breachRunsRequired,
    breachRunCount,
    value: result.value,
    error: null,
  };
}

function sameNames(first, second) {
  return first.size === second.size && [...first].every((name) => second.has(name));
}

// Decides the notifications of one run. Each argument is a Set of node names.
// Returns a list of { kind, newNodes, stoppedNodes } with kind "breach", "reminder", "resolved",
// "failure" or "recovery". A breach has firstBreach: true when no node fired before.
export function decideRuleNotifications({
  previousFiring,
  currentFiring,
  previousErrored,
  currentErrored,
  reminderDue,
}) {
  const notifications = [];

  if (currentFiring.size > 0 && !sameNames(previousFiring, currentFiring)) {
    notifications.push({
      kind: "breach",
      firstBreach: previousFiring.size === 0,
      newNodes: [...currentFiring].filter((name) => !previousFiring.has(name)),
      stoppedNodes: [...previousFiring].filter((name) => !currentFiring.has(name)),
    });
  } else if (currentFiring.size > 0 && reminderDue) {
    notifications.push({ kind: "reminder", newNodes: [], stoppedNodes: [] });
  } else if (currentFiring.size === 0 && previousFiring.size > 0) {
    notifications.push({ kind: "resolved", newNodes: [], stoppedNodes: [...previousFiring] });
  }

  const newErrorNodes = [...currentErrored].filter((name) => !previousErrored.has(name));
  if (newErrorNodes.length > 0) {
    notifications.push({ kind: "failure", newNodes: newErrorNodes, stoppedNodes: [] });
  } else if (currentErrored.size === 0 && previousErrored.size > 0) {
    notifications.push({ kind: "recovery", newNodes: [], stoppedNodes: [...previousErrored] });
  }

  return notifications;
}

// The status shown for the whole rule. A breach is more important than an error.
export function ruleStatus(currentFiring, currentErrored) {
  if (currentFiring.size > 0) return "firing";
  if (currentErrored.size > 0) return "error";
  return "ok";
}
