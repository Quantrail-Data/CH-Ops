// Tests for the global page search.
//
// The ranking block exercises the REAL Fuse.js token search over the real
// catalog (the whole reason the feature exists), then drift guards keep the
// catalog and the routes in sync, and source checks confirm the wiring.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import fs from "fs";
import Fuse from "fuse.js";
import {
  SEARCH_CATALOG,
  SEARCH_ENTRIES,
  SECTION_ICONS,
} from "../../src/frontend/utils/searchCatalog.js";
import { BREADCRUMB_MAP } from "../../src/frontend/utils/routeMeta.js";
import { PAGE_HEADERS, PAGE_TEXT } from "../../src/frontend/utils/pageHeaders.generated.js";

const read = (f) => fs.readFileSync(f, "utf8");

// Same configuration the component builds, over the same merged entries
// (curated keywords + breadcrumb labels + scraped headers + static page text).
const fuse = new Fuse(SEARCH_ENTRIES, {
  useTokenSearch: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
  keys: [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "section", weight: 1 },
    { name: "description", weight: 1 },
    { name: "text", weight: 0.5 },
  ],
});
const topIds = (q, n = 5) => fuse.search(q, { limit: n }).map((r) => r.item.id);

describe("Global search: multi-token ranking", () => {
  it('"DDL queue block" surfaces DDL & Readonly', () => {
    expect(topIds("DDL queue block")).toContain("overview/ddl");
  });
  it('"compare queries cost" surfaces the SQL Editor', () => {
    expect(topIds("compare queries cost")).toContain("editor/query");
  });
  it('"slack notification" surfaces alert Channels', () => {
    expect(topIds("slack notification")).toContain("alerting/channels");
  });
  it('"create table mergetree" surfaces Schema Studio', () => {
    expect(topIds("create table mergetree")).toContain("tools/schema-studio");
  });
  it('"flame graph" surfaces the Query Profiler', () => {
    expect(topIds("flame graph")).toContain("tools/profiler");
  });
  it("word order does not change what surfaces", () => {
    expect(topIds("blocked ddl queue", 3)).toContain("overview/ddl");
    expect(topIds("queue ddl blocked", 3)).toContain("overview/ddl");
  });
  it("returns several ranked pages, not just one", () => {
    expect(fuse.search("dashboard", { limit: 20 }).length).toBeGreaterThan(1);
  });
  it("folded-in breadcrumb terms are searchable", () => {
    expect(topIds("access control").some((id) => id.startsWith("rbac/"))).toBe(
      true,
    );
    expect(topIds("query analytics")).toContain("overview/queries");
  });
  it("folded-in scraped headers are searchable", () => {
    expect(topIds("throughput")).toContain("overview/queues");
  });
});

describe("Global search: breadcrumb + header merge", () => {
  const byId = new Map(SEARCH_ENTRIES.map((e) => [e.id, e]));
  // The catalog page a breadcrumb key belongs to = its longest id prefix.
  const pageFor = (key) => {
    if (byId.has(key)) return byId.get(key);
    const ids = [...byId.keys()]
      .filter((id) => key === id || key.startsWith(id + "/"))
      .sort((a, b) => b.length - a.length);
    return ids.length ? byId.get(ids[0]) : null;
  };

  it("every breadcrumb label reaches its page's search terms", () => {
    for (const [key, crumbs] of Object.entries(BREADCRUMB_MAP)) {
      const entry = pageFor(key);
      if (!entry) continue;
      for (const label of crumbs) {
        expect(entry.keywords).toContain(label.toLowerCase());
      }
    }
  });

  it("scraped headers exist and are folded into their page", () => {
    expect(Object.keys(PAGE_HEADERS).length).toBeGreaterThan(0);
    for (const [id, hs] of Object.entries(PAGE_HEADERS)) {
      const entry = byId.get(id);
      if (!entry) continue;
      for (const h of hs) {
        expect(entry.keywords).toContain(h.toLowerCase());
      }
    }
  });

  it("scraped page text is folded into its page's text field", () => {
    expect(Object.keys(PAGE_TEXT).length).toBeGreaterThan(0);
    for (const [id, terms] of Object.entries(PAGE_TEXT)) {
      const entry = byId.get(id);
      if (!entry) continue;
      for (const t of terms) expect(entry.text).toContain(t);
    }
  });

  it("a static body-text phrase resolves to the right page", () => {
    // "Drop a file here" is upload text scraped from Schema Studio.
    expect(topIds("drop a file here")).toContain("tools/schema-studio");
  });

  it("merged entries keep the curated keywords too", () => {
    // curated terms survive the merge (synonyms/misspellings neither source has)
    const ddl = byId.get("overview/ddl");
    expect(ddl.keywords).toContain("stuck ddl");
    expect(ddl.keywords).toContain("ddl queue block");
  });
});

describe("Global search: catalog / route drift", () => {
  const mainLayout = read("src/frontend/components/layout/MainLayout.jsx");
  const sidebar = read("src/frontend/components/layout/Sidebar.jsx");

  // Base route ids from MainLayout (strip optional params like /:tab?).
  const routeIds = new Set();
  for (const m of mainLayout.matchAll(/\[\s*"([^"]+)"\s*,/g)) {
    routeIds.add(m[1].replace(/\/:.*$/, ""));
  }
  for (const m of mainLayout.matchAll(/path="([^"]+)"/g)) {
    routeIds.add(m[1].replace(/\/:.*$/, ""));
  }

  // Sidebar leaf page ids (ids containing "/"), from non-comment lines only.
  const sidebarLeaves = new Set();
  sidebar
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .replace(/id:\s*"([^"]*\/[^"]*)"/g, (_, id) => sidebarLeaves.add(id));

  it("every catalog entry points at a real route", () => {
    const orphans = SEARCH_CATALOG.map((e) => e.id).filter(
      (id) => !routeIds.has(id),
    );
    expect(orphans).toEqual([]);
  });

  it("every sidebar page has a catalog entry (no page is unsearchable)", () => {
    const catalogIds = new Set(SEARCH_CATALOG.map((e) => e.id));
    const missing = [...sidebarLeaves].filter((id) => !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it("every catalog section has an icon", () => {
    for (const e of SEARCH_CATALOG) {
      expect(SECTION_ICONS[e.section]).toBeTruthy();
    }
  });

  it("entries carry keywords so natural queries can match", () => {
    for (const e of SEARCH_CATALOG) {
      expect(Array.isArray(e.keywords)).toBe(true);
      expect(e.keywords.length).toBeGreaterThan(2);
    }
  });
});

describe("Global search: wiring", () => {
  const gs = read("src/frontend/components/layout/GlobalSearch.jsx");
  const nav = read("src/frontend/components/layout/Navbar.jsx");
  const layout = read("src/frontend/components/layout/MainLayout.jsx");

  it("uses Fuse token search with precision-leaning options", () => {
    expect(gs).toContain("new Fuse(");
    expect(gs).toContain("SEARCH_ENTRIES"); // the merged index, not raw catalog
    expect(gs).toContain("useTokenSearch: true");
    expect(gs).toContain("ignoreLocation: true");
    expect(gs).toMatch(/threshold:\s*0\.4/);
  });

  it("renders a floating bubble and an overlay panel", () => {
    expect(gs).toContain("global-search-fab");
    expect(gs).toContain("global-search-overlay");
    expect(gs).toContain("global-search-results");
  });

  it("closes on Escape, backdrop click, and the close button", () => {
    expect(gs).toContain('e.key === "Escape"'); // keyboard
    expect(gs).toContain("global-search-close"); // close button element
    // backdrop overlay + close button both call onClose directly
    expect(gs.match(/onClick=\{onClose\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("opens via Ctrl/Cmd+K", () => {
    expect(gs).toContain("metaKey");
    expect(gs).toContain("ctrlKey");
  });

  it("navbar has a Search button wired to onOpenSearch", () => {
    expect(nav).toContain("onOpenSearch");
    expect(nav).toMatch(/onClick=\{onOpenSearch\}/);
    expect(nav).toContain("ti-search");
  });

  it("MainLayout mounts GlobalSearch and owns the open state", () => {
    expect(layout).toContain("import GlobalSearch");
    expect(layout).toContain("searchOpen");
    expect(layout).toContain("<GlobalSearch");
    expect(layout).toContain("onNavigate={handleNavigate}");
  });
});
