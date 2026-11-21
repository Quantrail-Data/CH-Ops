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
  it("style guide shell: breadcrumb left, actions right; brand moved to the sidebar", () => {
    expect(code).toContain("<Breadcrumb route={route} />");
    expect(code).toContain("navbar-actions");
    expect(code).not.toContain("navbar-brand");
    const sidebar = read("src/frontend/components/layout/Sidebar.jsx");
    expect(sidebar).toContain("<SidebarBrand");
  });
  it("user dropdown is rightmost in actions zone", () => {
    expect(code.lastIndexOf("userMenuOpen")).toBeGreaterThan(
      code.indexOf("navbar-actions"),
    );
  });
  it("solid navbar background (Midnight: no glass blur)", () => {
    const css = read("src/frontend/styles/global.css");
    const r = css.match(/\.navbar\s*\{[^}]+\}/)?.[0] || "";
    expect(r).toContain("background: var(--navbar-bg);");
    expect(r).not.toContain("backdrop-filter");
  });
});

describe("Navbar: Font Scaling", () => {
  const code = read("src/frontend/components/layout/Navbar.jsx");
  it("slider 75-200 step 5", () => {
    expect(code).toContain("min={75}");
    expect(code).toContain("max={200}");
    expect(code).toContain("step={5}");
  });
  it("Use Auto button brings back the screen-fit text size", () => {
    expect(code).toContain("Use Auto (fits the screen)");
    expect(code).toContain('removeProperty("font-size")');
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
  it("solid raised dropdown (Midnight: no glass blur), on the shadcn DropdownMenu", () => {
    expect(code).toContain("<DropdownMenuContent");
    expect(code).toContain("tw:bg-[var(--bg-raised)]");
    expect(code).not.toContain("blur(40px)");
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
  it("role badge tone comes from the shared role map", () => {
    expect(code).toContain("<Badge tone={roleTone(auth.role)}");
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

describe("roleTone: one role-to-badge map for the whole app", () => {
  it("maps the four roles to the style guide tones", async () => {
    const { roleTone } = await import("../../src/frontend/utils/roles.js");
    expect(roleTone("superadmin")).toBe("accent");
    expect(roleTone("admin")).toBe("warning");
    expect(roleTone("editor")).toBe("info");
    expect(roleTone("readonly")).toBe("neutral");
    expect(roleTone("something-else")).toBe("neutral");
  });
  it("UserManagement uses the same map", () => {
    const um = read("src/frontend/components/admin/UserManagement.jsx");
    expect(um).toContain("roleTone(u.role)");
    expect(um).not.toContain("ROLE_BADGE");
  });
});
