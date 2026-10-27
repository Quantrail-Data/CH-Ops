// alert-rules-templates.test.jsx - The template features of the Alert Rules page.
// Checks the hidden template rules, the picker, the rule test table and Reset to template.
// author -> Sanjeev Kumar G
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import AlertRules from "../../src/frontend/components/alerting/AlertRules.jsx";

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  runQuery: vi.fn(async () => ({ rows: [] })),
}));


const CONNECTION = {
  clusters: [
    { id: "cluster_a", name: "cluster a", nodes: [{ host: "node-a1" }] },
  ],
};

vi.mock("../../src/frontend/App.jsx", () => ({
  useAuth: () => mockUseAuth(),
  useConnection: () => CONNECTION,
}));


vi.mock("../../src/frontend/components/editor/SqlEditor.jsx", () => ({
  default: ({ value, onChange }) => (
    <textarea
      aria-label="SQL"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const CPU_TEMPLATE = {
  id: "cpu-busy",
  category: "Resources",
  name: "CPU busy",
  description: "CPU time spent in user and kernel code.",
  tuning: "Lower to 80 for latency-sensitive clusters.",
  operator: "gt",
  threshold: 90,
  unit: "%",
  severity: "warning",
  schedule: "*/5 * * * *",
  sql: "SELECT 1 AS cpu_busy_percent",
};

const DISK_TEMPLATE = {
  id: "disk-space-low",
  category: "Resources",
  name: "Disk space low (data path)",
  description: "Free space on the volume that holds the data path.",
  operator: "lt",
  threshold: 15,
  unit: "%",
  severity: "warning",
  schedule: "*/5 * * * *",
  sql: "SELECT 50 AS disk_free_percent",
};

function rule(fields) {
  return {
    description: "",
    sql: "SELECT 1",
    threshold: 0,
    operator: "gt",
    severity: "warning",
    schedule: "*/5 * * * *",
    enabled: false,
    channels: [],
    nodes: null,
    cluster_id: "cluster_a",
    notifyIntervalMinutes: 0,
    breachRunsRequired: 1,
    noRowsMeansBreach: false,
    templateId: null,
    templateEdited: false,
    ...fields,
  };
}

const RULES = [
  rule({
    id: 1,
    name: "CPU busy",
    sql: CPU_TEMPLATE.sql,
    threshold: 90,
    schedule: "* * * * *",
    enabled: true,
    templateId: "cpu-busy",
    templateEdited: true,
  }),
  rule({ id: 2, name: "Disk space low (data path)", templateId: "disk-space-low" }),
  rule({ id: 3, name: "My own rule" }),
];

function answerApi(url, options) {
  if (url === "/api/alerts/rules" && options?.method === "POST") return { id: 9 };
  if (url === "/api/alerts/rules") return RULES;
  if (url === "/api/alerts/channels") return [];
  if (url === "/api/alerts/templates") return [CPU_TEMPLATE, DISK_TEMPLATE];
  if (url === "/api/alerts/rules/test") {
    return {
      results: [{ node: "node-a1", value: 95.5, wouldFire: true, error: null }],
    };
  }
  return {};
}

function switchForTemplateRulesThatAreOff() {
  const label = screen.getByText(/Show the template rules that are off/);
  return label.closest(".form-label").querySelector('input[type="checkbox"]');
}

describe("Alert Rules: templates", () => {
  beforeEach(() => {
    cleanup();
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url, options) => answerApi(url, options));
    mockUseAuth.mockReturnValue({ auth: { role: "admin" } });
  });

  it("hides the template rules that are off, and shows them with the switch", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    expect(screen.getByText("CPU busy")).toBeInTheDocument();
    expect(screen.queryByText("Disk space low (data path)")).toBeNull();
    expect(
      screen.getByText("Show the template rules that are off (1)"),
    ).toBeInTheDocument();

    fireEvent.click(switchForTemplateRulesThatAreOff());

    expect(
      await screen.findByText("Disk space low (data path)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("template").length).toBe(2);
  });

  it("fills the rule form from the template that the admin picks", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");

    fireEvent.click(screen.getByRole("button", { name: /New from template/ }));
    fireEvent.change(screen.getByPlaceholderText("Search templates"), {
      target: { value: "disk" },
    });
    expect(screen.queryByRole("button", { name: /^CPU busy/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /Disk space low \(data path\)/ }),
    );

    expect(screen.getByDisplayValue("Disk space low (data path)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("15")).toBeInTheDocument();
    expect(screen.getByLabelText("SQL")).toHaveValue(DISK_TEMPLATE.sql);
  });

  it("runs the rule test and shows one row for each node", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    fireEvent.click(screen.getByRole("button", { name: /New from template/ }));
    fireEvent.click(screen.getByRole("button", { name: /^CPU busy/ }));

    fireEvent.click(screen.getByRole("button", { name: /Test/ }));

    expect(await screen.findByText("Would fire")).toBeInTheDocument();
    const resultsTable = screen.getByRole("table");
    expect(within(resultsTable).getByText("node-a1")).toBeInTheDocument();
    expect(within(resultsTable).getByText("95.5%")).toBeInTheDocument();
    const testCall = mockApiFetch.mock.calls.find(
      ([url]) => url === "/api/alerts/rules/test",
    );
    const sentBody = JSON.parse(testCall[1].body);
    expect(testCall[1].method).toBe("POST");
    expect(sentBody.sql).toBe(CPU_TEMPLATE.sql);
    expect(sentBody.threshold).toBe(90);
  });

  it("shows the unit of a template rule on its card and in the threshold label", async () => {
    render(<AlertRules />);
    const cpuCard = (await screen.findByText("CPU busy")).closest(".card");
    await waitFor(() =>
      expect(within(cpuCard).getByText(/greater than\s+90%/)).toBeInTheDocument(),
    );
    fireEvent.click(cpuCard.querySelector(".btn-secondary.btn-sm"));
    expect(screen.getByText("Threshold (%)")).toBeInTheDocument();
  });

  it("saves a rule from the picker with its template id, and offers Reset", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    fireEvent.click(screen.getByRole("button", { name: /New from template/ }));
    fireEvent.click(screen.getByRole("button", { name: /^CPU busy/ }));
    expect(screen.getByRole("button", { name: /Reset to template/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create/ }));

    await waitFor(() => {
      const createCall = mockApiFetch.mock.calls.find(
        ([url, options]) => url === "/api/alerts/rules" && options?.method === "POST",
      );
      expect(JSON.parse(createCall[1].body).templateId).toBe("cpu-busy");
    });
  });

  it("puts the template values back with Reset to template", async () => {
    render(<AlertRules />);
    await screen.findByText("My own rule");
    const cpuCard = screen.getByText("CPU busy").closest(".card");
    fireEvent.click(cpuCard.querySelector(".btn-secondary.btn-sm"));
    expect(screen.getByDisplayValue("* * * * *")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset to template/ }));

    expect(screen.getByDisplayValue("*/5 * * * *")).toBeInTheDocument();
  });

  it("does not show Reset to template for a rule written by hand", async () => {
    render(<AlertRules />);
    const ownCard = (await screen.findByText("My own rule")).closest(".card");
    fireEvent.click(ownCard.querySelector(".btn-secondary.btn-sm"));
    expect(screen.queryByRole("button", { name: /Reset to template/ })).toBeNull();
  });

  it("does not ask for the templates when the user is not an admin", async () => {
    mockUseAuth.mockReturnValue({ auth: { role: "readonly" } });
    render(<AlertRules />);
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/api/alerts/rules"),
    );
    const templateCalls = mockApiFetch.mock.calls.filter(
      ([url]) => url === "/api/alerts/templates",
    );
    expect(templateCalls).toEqual([]);
    expect(screen.getByRole("button", { name: /New from template/ })).toBeDisabled();
  });
});
