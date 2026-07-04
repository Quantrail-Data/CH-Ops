// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Test suite validating navbar responsive layouts, font auto-scaling, interaction behaviors, and connection reload contexts.

import { describe, it, expect } from "vitest";
import fs from "fs";
function read(f) {
  return fs.readFileSync(f, "utf8");
}

describe("Navbar: Layout", () => {
  const code = read("src/frontend/components/layout/Navbar.jsx");
  it("three zones: brand, connection, actions", () => {
    expect(code).toContain("navbar-brand");
    expect(code).toContain("navbar-connection");
    expect(code).toContain("navbar-actions");
  });
  it("user dropdown is rightmost in actions zone", () => {
    expect(code.lastIndexOf("userMenuOpen")).toBeGreaterThan(
      code.indexOf("navbar-actions"),
    );
  });
  it("80% opaque navbar background", () => {
    const css = read("src/frontend/styles/global.css");
    const r = css.match(/\.navbar\s*\{[^}]+\}/)?.[0] || "";
    expect(r).toContain("background: var(--navbar-bg);");
    expect(r).toContain("backdrop-filter");
  });
});

describe("Navbar: Font Scaling", () => {
  const code = read("src/frontend/components/layout/Navbar.jsx");
  it("slider 75-200 step 5", () => {
    expect(code).toContain("min={75}");
    expect(code).toContain("max={200}");
    expect(code).toContain("step={5}");
  });
  it("Reset to 100% button", () => {
    expect(code).toContain("Reset to 100%");
  });
  it("ti-text-resize icon", () => {
    expect(code).toContain("ti-text-resize");
  });
});

describe("Navbar: Actions", () => {
  const code = read("src/frontend/components/layout/Navbar.jsx");
  it("labels on buttons: Refresh, Docs, Light/Dark", () => {
    expect(code).toContain("navbar-btn-label");
    expect(code).toContain(">Refresh<");
    expect(code).toContain(">Docs<");
  });
  it("theme toggle", () => {
    expect(code).toContain("toggleTheme");
  });
  it("docs icon is ti-book (not filled)", () => {
    expect(code).toContain("ti ti-book");
  });
  it("reloadConfig on refresh", () => {
    expect(code).toContain("reloadConfig");
  });
  it("glassy dropdown style with strong blur", () => {
    expect(code).toContain("dropdownStyle");
    expect(code).toContain("glass-dropdown");
    expect(code).toContain("blur(40px)");
  });
  it("Sign Out in user dropdown", () => {
    expect(code).toContain("Sign Out");
  });
  it("version info in dropdown (app version + ClickHouse® version)", () => {
    expect(code).toContain("__APP_VERSION__");
    expect(code).toContain("__CH_VERSION__");
    expect(code).toContain("App version");
    expect(code).toContain("ClickHouse®");
  });
  it("role badge colors for 4 roles", () => {
    expect(code).toContain("badge-amber");
    expect(code).toContain("badge-purple");
    expect(code).toContain("badge-blue");
    expect(code).toContain("badge-gray");
  });
});

describe("Connection Context: reloadConfig", () => {
  const code = read("src/frontend/App.jsx");
  it("exposes reloadConfig in ConnectionContext", () => {
    expect(code).toContain("reloadConfig: () => loadConfig()");
  });
  it("preserves current node if still exists", () => {
    expect(code).toContain("const currentHost = prev.selectedNode");
    expect(code).toContain(
      "const stillExists = nodes.find((n) => n.host === currentHost)",
    );
    expect(code).toContain("...(stillExists");
  });
  it("ClusterManagement calls reloadConfig after save", () => {
    expect(
      read("src/frontend/components/admin/ClusterManagement.jsx"),
    ).toContain("reloadConfig");
  });
});
