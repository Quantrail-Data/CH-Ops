// rbac-settings-view.test.jsx - The Settings tab of View Grants shows the effective settings.
// Copyright (C) 2026 Quantrail Data Private Limited

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SettingsView, { loadSettingsData } from "../../src/frontend/components/rbac/SettingsView.jsx";

const mockRunQuery = vi.fn();
const mockApiFetch = vi.fn();

vi.mock("../../src/frontend/utils/api.js", () => ({
  runQuery: (...args) => mockRunQuery(...args),
  apiFetch: (...args) => mockApiFetch(...args),
}));

const ROWS_BY_TABLE = {
  "system.users": [{ name: "alice" }],
  "system.roles": [{ name: "reporting", id: "1" }],
  "system.role_grants": [
    { user_name: "alice", role_name: null, granted_role_name: "reporting", granted_role_is_default: 0, with_admin_option: 0 },
  ],
  "system.settings_profiles": [
    { name: "default", apply_to_all: 0, apply_to_list: [], apply_to_except: [] },
    { name: "night", apply_to_all: 0, apply_to_list: '["alice"]', apply_to_except: "[]" },
  ],
  "system.settings_profile_elements": [
    { profile_name: "night", user_name: null, role_name: null, index: 0, setting_name: "max_threads", value: "2", min: null, max: null, writability: null, inherit_profile: null },
    { profile_name: null, user_name: null, role_name: "reporting", index: 0, setting_name: "max_threads", value: "6", min: null, max: "8", writability: "WRITABLE", inherit_profile: null },
  ],
  "system.settings": [{ name: "max_threads", alias_for: "", description: "Threads for one query.", default: "0" }],
};

function answerQuery(sql) {
  const table = Object.keys(ROWS_BY_TABLE).find((name) => sql.includes(`FROM ${name}`) && !sql.includes(`FROM ${name}_`));
  return Promise.resolve({ rows: ROWS_BY_TABLE[table] });
}

beforeEach(() => {
  mockRunQuery.mockReset();
  mockApiFetch.mockReset();
  mockRunQuery.mockImplementation(answerQuery);
  mockApiFetch.mockResolvedValue({ defaultProfileName: "default", settingsConstraintsReplacePrevious: true });
});

afterEach(() => cleanup());

describe("Settings tab", () => {
  it("runs every query read-only and turns array text into arrays", async () => {
    const { data, errors } = await loadSettingsData((sql, options) => {
      expect(options).toEqual({ readOnly: true });
      return answerQuery(sql);
    });
    expect(errors).toEqual([]);
    expect(data.profiles.find((profile) => profile.name === "night").apply_to_list).toEqual(["alice"]);
  });

  it("shows the value of a role over a TO profile, with the role as source", async () => {
    render(<SettingsView />);
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(1));

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "alice" } });

    expect(await screen.findByText('role "reporting"')).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText('Profile "night" (TO clause)')).toBeTruthy();
  });

  it("names the table that could not be read", async () => {
    mockRunQuery.mockImplementation((sql) =>
      sql.includes("system.settings_profiles") ? Promise.reject(new Error("Not enough privileges.")) : answerQuery(sql),
    );
    render(<SettingsView />);
    expect(await screen.findByText(/system\.settings_profiles: Not enough privileges\./)).toBeTruthy();
  });
});
