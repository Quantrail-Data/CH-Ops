// kubernetes-insight-status.test.jsx - Read time, load errors and the Rollout tab of Kubernetes Insights.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
  apiFetch: (...args) => apiFetch(...args),
  apiFetchText: vi.fn(),
}));

import KubernetesInsight, {
  RolloutTab,
} from "../../src/frontend/components/kubernetes/KubernetesInsight.jsx";

const HEALTH = {
  passing: 1,
  total: 1,
  unknown: 0,
  checks: [{ name: "Operator reachable", ok: true, detail: "The operator answers." }],
};

const RECONCILE = {
  status: "Completed",
  taskID: "task-1",
  hosts: { total: 2, completed: 2 },
  operator: { reachable: true },
};

// Answers for the calls that every render makes.
function answerCommonCalls(url) {
  if (url.endsWith("/permissions")) return Promise.resolve({ degraded: [] });
  if (url.endsWith("/health-alerts")) return Promise.resolve({ enabled: false, channels: [] });
  if (url === "/api/alerts/channels") return Promise.resolve([]);
  return null;
}

beforeEach(() => {
  apiFetch.mockReset();
});

afterEach(cleanup);

describe("Kubernetes Insights tab status", () => {
  it("shows an error with a Retry button after a failed load, and reads again on Retry", async () => {
    let healthCalls = 0;
    apiFetch.mockImplementation((url) => {
      const common = answerCommonCalls(url);
      if (common) return common;
      if (url.endsWith("/health")) {
        healthCalls += 1;
        if (healthCalls === 1) return Promise.reject(new Error("The token has expired."));
        return Promise.resolve(HEALTH);
      }
      return Promise.reject(new Error("unexpected call " + url));
    });

    render(<KubernetesInsight cluster={{ id: "c1", name: "demo" }} />);

    expect(await screen.findByText("Could not read this tab.")).toBeInTheDocument();
    expect(screen.getByText(/The token has expired\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));

    expect(await screen.findByText("Operator reachable")).toBeInTheDocument();
    expect(screen.queryByText("Could not read this tab.")).toBeNull();
    expect(screen.getByText(/^read at /)).toBeInTheDocument();
  });

  it("shows the read time on a tab other than Health", async () => {
    apiFetch.mockImplementation((url) => {
      const common = answerCommonCalls(url);
      if (common) return common;
      if (url.endsWith("/health")) return Promise.resolve(HEALTH);
      if (url.endsWith("/reconcile")) return Promise.resolve(RECONCILE);
      return Promise.reject(new Error("unexpected call " + url));
    });

    render(<KubernetesInsight cluster={{ id: "c1", name: "demo" }} />);
    await screen.findByText("Operator reachable");

    fireEvent.click(screen.getByRole("button", { name: "Reconcile" }));

    expect(await screen.findByText("task-1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/^read at /)).toBeInTheDocument());
  });

  it("reads the Rollout tab from the rollout endpoint", async () => {
    apiFetch.mockImplementation((url) => {
      const common = answerCommonCalls(url);
      if (common) return common;
      if (url.endsWith("/health")) return Promise.resolve(HEALTH);
      if (url.endsWith("/rollout")) return Promise.resolve({ statefulSets: [] });
      return Promise.reject(new Error("unexpected call " + url));
    });

    render(<KubernetesInsight cluster={{ id: "c1", name: "demo" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Rollout" }));

    expect(await screen.findByText("No StatefulSets were found for this installation.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/k8s/insight/c1/rollout");
  });
});

describe("Rollout tab", () => {
  const ROLLOUT = {
    statefulSets: [
      {
        name: "chi-demo-main-0-0",
        desired: 1,
        current: 1,
        ready: 1,
        updated: 1,
        currentRevision: "rev-2",
        updateRevision: "rev-2",
        status: "complete",
        stuckReason: null,
      },
      {
        name: "chi-demo-main-1-0",
        desired: 1,
        current: 1,
        ready: 0,
        updated: 1,
        currentRevision: "rev-1",
        updateRevision: "rev-2",
        status: "stuck",
        stuckReason: "chi-demo-main-1-0-0 is waiting: ImagePullBackOff",
      },
    ],
  };

  it("shows the replica counts, the revision and the status of each StatefulSet", () => {
    render(<RolloutTab data={ROLLOUT} />);
    expect(screen.getByText("chi-demo-main-0-0")).toBeInTheDocument();
    expect(screen.getByText("rev-2")).toBeInTheDocument();
    expect(screen.getByText("rev-1 to rev-2")).toBeInTheDocument();
    expect(screen.getByText("complete")).toBeInTheDocument();
    expect(screen.getByText("stuck").tagName).toBe("STRONG");
  });

  it("explains why a rollout is stuck", () => {
    render(<RolloutTab data={ROLLOUT} />);
    expect(screen.getByText("A rollout is stuck.")).toBeInTheDocument();
    expect(screen.getByText(/ImagePullBackOff/)).toBeInTheDocument();
  });
});
