// kubernetes-events.test.jsx - The Events tab of Kubernetes Insights.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventsTab } from "../../src/frontend/components/kubernetes/KubernetesInsight.jsx";

const EVENTS = {
  events: [
    {
      lastSeen: "2026-10-27 10:00:00",
      type: "Warning",
      object: "chi-demo-main-0-0-0",
      reason: "BackOff",
      message: "Back-off restarting failed container",
      count: 3,
    },
    {
      lastSeen: "2026-10-27 09:00:00",
      type: "Normal",
      object: "some-other-pod",
      reason: "Pulled",
      message: "Container image pulled",
      count: 1,
    },
  ],
};

afterEach(cleanup);

function renderEvents(onOpenPodLogs = vi.fn()) {
  render(
    <EventsTab
      data={EVENTS}
      onReload={() => {}}
      onOpenPodLogs={onOpenPodLogs}
      podNames={["chi-demo-main-0-0-0"]}
    />,
  );
  return onOpenPodLogs;
}

describe("Events tab", () => {
  it("opens the logs of a known pod from its event", () => {
    const onOpenPodLogs = renderEvents();
    fireEvent.click(screen.getByRole("button", { name: "chi-demo-main-0-0-0" }));
    expect(onOpenPodLogs).toHaveBeenCalledWith("chi-demo-main-0-0-0");
  });

  it("shows an object that is not a known pod as plain text", () => {
    renderEvents();
    expect(screen.queryByRole("button", { name: "some-other-pod" })).toBeNull();
    expect(screen.getByText("some-other-pod")).toBeInTheDocument();
  });

  it("shows warnings in bold and the repeat count", () => {
    renderEvents();
    expect(screen.getByText("BackOff").tagName).toBe("STRONG");
    expect(screen.getByText("Pulled").tagName).not.toBe("STRONG");
    expect(screen.getByText("(3 times)")).toBeInTheDocument();
  });
});
