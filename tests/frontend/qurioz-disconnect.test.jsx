// qurioz-disconnect.test.jsx - Qurioz asks for the databases only while a ClickHouse connection exists.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuriozChatComponent from "../../src/frontend/components/qurioz/QuriozChatComponent.jsx";

const mockApiFetch = vi.fn();
const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };

vi.mock("../../src/frontend/utils/api.js", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
  runQuery: vi.fn(),
}));

vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
  useToast: () => mockToast,
}));

vi.mock("../../src/frontend/App.jsx", () => ({
  useConnection: () => ({
    clusters: [],
    clusterName: "local-pair",
    selectedClusterId: "local-pair",
    user: "",
    password: "",
    port: 8123,
    connected: true,
    selectedNode: "ch-node-1",
    nodeName: "ch-node-1",
  }),
  useTheme: () => ({ theme: "light" }),
}));

let connectedAtStart;

function answerFor(path, options = {}) {
  const method = options.method || "GET";
  if (path === "/api/ai/connect" && method === "GET") {
    return connectedAtStart ? { connected: true, chUser: "chops" } : { connected: false };
  }
  if (path === "/api/ai/connect" && method === "DELETE") return { connected: false };
  if (path === "/api/ai/databases") return { databases: ["default", "system"] };
  if (path === "/api/qurioz/api-keys/active") return { apiKey: null };
  if (path === "/api/qurioz/api-keys") return { apiKeys: [] };
  return {};
}

function databaseRequestCount() {
  return mockApiFetch.mock.calls.filter(([path]) => path === "/api/ai/databases").length;
}

function renderQurioz() {
  render(
    <MemoryRouter>
      <QuriozChatComponent ScrollBottomAuto={() => {}} sidebar={false} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path, options) => answerFor(path, options));
});

afterEach(() => cleanup());

describe("Qurioz connection", () => {
  it("does not ask for the databases when no connection exists", async () => {
    connectedAtStart = false;
    renderQurioz();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/api/ai/connect", { method: "GET" }),
    );
    expect(databaseRequestCount()).toBe(0);
  });

  it("stops asking for the databases after a disconnect", async () => {
    connectedAtStart = true;
    renderQurioz();
    const disconnectButton = await screen.findByTitle("Disconnect and clear credentials");
    await waitFor(() => expect(databaseRequestCount()).toBe(1));

    fireEvent.click(disconnectButton);
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/api/ai/connect", { method: "DELETE" }),
    );
    await waitFor(() =>
      expect(screen.queryByTitle("Disconnect and clear credentials")).toBeNull(),
    );
    expect(databaseRequestCount()).toBe(1);
  });
});
