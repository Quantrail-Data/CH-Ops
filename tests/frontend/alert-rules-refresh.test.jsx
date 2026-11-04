// alert-rules-refresh.test.jsx - The Alert Rules page loads the rules again while it is visible,
// keeps the form that the user edits, and uses the cron check of the server.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import AlertRules, {
  RULES_REFRESH_MS,
} from "../../src/frontend/components/alerting/AlertRules.jsx";

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

let visibility = "visible";

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
  render(<AlertRules />);
  await act(async () => {});
  expect(screen.getByText("My own rule")).toBeInTheDocument();
}

describe("Alert Rules: refresh", () => {
  beforeEach(() => {
    // Only the interval timer is fake. React needs its real timers to render.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    visibility = "visible";
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
  });

  it("loads the rules every 30 seconds while the tab is visible", async () => {
    await renderPage();
    const loadsAtStart = ruleListLoads();
    await waitOneInterval();
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
});

describe("Alert Rules: cron check", () => {
  beforeEach(() => {
    visibility = "visible";
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url) => (url === "/api/alerts/rules" ? [RULE] : []));
  });

  afterEach(() => cleanup());

  it("refuses a schedule with 4 fields, like the server", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    fireEvent.click(screen.getByRole("button", { name: /New Rule/ }));
    const scheduleInput = screen.getByDisplayValue("*/5 * * * *");

    fireEvent.change(scheduleInput, { target: { value: "0 * * *" } });
    fireEvent.blur(scheduleInput);

    expect(screen.getByText("Cron must have 5 fields")).toBeInTheDocument();
    expect(scheduleInput).toHaveValue("0 * * *");
  });
});
