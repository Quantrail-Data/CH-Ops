// alert-rules-refresh.test.jsx - The Alert Rules page loads the rules again while it is visible,
// keeps the form that the user edits, and uses the cron check of the server.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import AlertRules from "../../src/frontend/components/alerting/AlertRules.jsx";

const mockApiFetch = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  runQuery: vi.fn(async () => ({ rows: [] })),
}));

// One fixed object. A new clusters list on each render makes the page render again and again.
const CONNECTION = {
  clusters: [{ id: "cluster_a", name: "cluster a", nodes: [{ host: "node-a1" }] }],
};

vi.mock("../../src/frontend/App.jsx", () => ({
  useAuth: () => ({ auth: { role: "admin" } }),
  useConnection: () => CONNECTION,
}));

vi.mock("../../src/frontend/components/editor/SqlEditor.jsx", () => ({
  default: ({ value, onChange }) => (
    <textarea aria-label="SQL" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const RULE = {
  id: 1,
  name: "My own rule",
  description: "",
  sql: "SELECT 1",
  threshold: 0,
  operator: "gt",
  severity: "warning",
  schedule: "*/5 * * * *",
  enabled: true,
  channels: [],
  nodes: null,
  cluster_id: "cluster_a",
  templateId: null,
};

const RULES_REFRESH_MS = 15000;

let visibility = "visible";
let originalVisibilityDescriptor;

function setVisibility(state) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

function ruleListLoads() {
  return mockApiFetch.mock.calls.filter(([url, options]) => url === "/api/alerts/rules" && !options)
    .length;
}

async function waitOneInterval() {
  await act(async () => {
    vi.advanceTimersByTime(RULES_REFRESH_MS);
  });
}

async function renderPage() {
  const view = render(<AlertRules />);
  await act(async () => {});
  expect(screen.getByText("My own rule")).toBeInTheDocument();
  return view;
}

describe("Alert Rules: refresh", () => {
  beforeEach(() => {
    // Only the interval timer is fake. React needs its real timers to render.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    visibility = "visible";
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url) => {
      if (url === "/api/alerts/rules") return [RULE];
      return [];
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
    } else {
      delete document.visibilityState;
    }
  });

  it("loads the rules every 15 seconds while the tab is visible", async () => {
    await renderPage();
    const loadsAtStart = ruleListLoads();

    await act(async () => {
      vi.advanceTimersByTime(RULES_REFRESH_MS - 1);
    });
    expect(ruleListLoads()).toBe(loadsAtStart);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(ruleListLoads()).toBe(loadsAtStart + 1);

    await waitOneInterval();
    expect(ruleListLoads()).toBe(loadsAtStart + 2);
  });

  it("stops while the tab is hidden, and loads at once when it shows again", async () => {
    await renderPage();
    const loadsAtStart = ruleListLoads();
    await act(async () => setVisibility("hidden"));
    await waitOneInterval();
    await waitOneInterval();
    expect(ruleListLoads()).toBe(loadsAtStart);

    await act(async () => setVisibility("visible"));
    expect(ruleListLoads()).toBe(loadsAtStart + 1);
    await waitOneInterval();
    expect(ruleListLoads()).toBe(loadsAtStart + 2);
  });

  it("keeps the form that the user edits", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /New Rule/ }));
    const scheduleInput = screen.getByDisplayValue("*/5 * * * *");
    const nameInput = scheduleInput
      .closest(".card")
      .querySelector(".form-group input.form-input");
    fireEvent.change(nameInput, { target: { value: "Rule in progress" } });

    const loadsBefore = ruleListLoads();
    await waitOneInterval();
    expect(ruleListLoads()).toBe(loadsBefore + 1);
    expect(screen.getByDisplayValue("Rule in progress")).toBeInTheDocument();
  });

  it("shows updated rules after a refresh", async () => {
    await renderPage();
    mockApiFetch.mockImplementation(async (url) => {
      if (url === "/api/alerts/rules") return [{ ...RULE, name: "Updated rule" }];
      return [];
    });

    await waitOneInterval();

    expect(screen.getByText("Updated rule")).toBeInTheDocument();
    expect(screen.queryByText("My own rule")).toBeNull();
  });

  it("stops refreshing and removes the visibility listener after unmount", async () => {
    const { unmount } = await renderPage();
    const loadsBeforeUnmount = ruleListLoads();

    unmount();
    await waitOneInterval();
    await act(async () => setVisibility("visible"));

    expect(ruleListLoads()).toBe(loadsBeforeUnmount);
  });

  it("loads rules when the refresh button is clicked", async () => {
    await renderPage();
    const loadsBefore = ruleListLoads();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Refresh"));
    });

    expect(ruleListLoads()).toBe(loadsBefore + 1);
  });
});

describe("Alert Rules: cron check", () => {
  beforeEach(() => {
    visibility = "visible";
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url) => (url === "/api/alerts/rules" ? [RULE] : []));
  });

  afterEach(() => cleanup());

  it("normalizes a schedule with 4 fields on blur", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    fireEvent.click(screen.getByRole("button", { name: /New Rule/ }));
    const scheduleInput = screen.getByDisplayValue("*/5 * * * *");

    fireEvent.change(scheduleInput, { target: { value: "0 * * *" } });
    fireEvent.blur(scheduleInput);

    expect(scheduleInput).toHaveValue("0 0 * * *");
    expect(screen.queryByText("Cron must have 4 or 5 fields")).toBeNull();
  });

  it("rejects a schedule with fewer than 4 fields", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    fireEvent.click(screen.getByRole("button", { name: /New Rule/ }));
    const scheduleInput = screen.getByDisplayValue("*/5 * * * *");

    fireEvent.change(scheduleInput, { target: { value: "0 * *" } });
    fireEvent.blur(scheduleInput);

    expect(screen.getByText("Cron must have 4 or 5 fields")).toBeInTheDocument();
    expect(scheduleInput).toHaveValue("0 * *");
  });
});
