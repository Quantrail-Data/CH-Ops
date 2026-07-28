// dashboard-filters-wiring.test.js - structural contracts for DashboardView.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect } from "vitest";
import fs from "fs";

const view = fs.readFileSync(
  "src/frontend/components/dashboards/DashboardView.jsx",
  "utf8",
);
const bar = fs.readFileSync(
  "src/frontend/components/dashboards/DashboardFilters.jsx",
  "utf8",
);
const settings = fs.readFileSync(
  "src/frontend/components/dashboards/DashboardSettings.jsx",
  "utf8",
);
const allCharts = fs.readFileSync(
  "src/frontend/components/dashboards/AllCharts.jsx",
  "utf8",
);

describe("selective re-run", () => {
  it("has a single-chart runner rather than only a whole-dashboard load", () => {
    expect(view).toContain("const runChart");
    expect(view).toContain("rerunAffected");
  });

  it("asks dashboardParams which charts a change affects", () => {
    expect(view).toContain("chartsAffectedBy");
  });

  it("patches individual tiles instead of replacing the list", () => {
    // Unaffected charts must keep the results they already have.
    expect(view).toContain("byId.get(c.id) || c");
  });

  it("loads and saves in parallel", () => {
    // Both were sequential for-await loops: one round trip per chart.
    expect(view).toContain("c.map((chart) => runChart(");
    expect(view).toContain("charts.map((c) =>");
    expect(view).toContain("await Promise.all");
    // Non-greedy and bounded: a greedy [\s\S]* here matches any later await
    // in the file and reports a loop that is not there.
    expect(view).not.toMatch(/for \(const chart of c\)\s*\{[\s\S]{0,400}?await runQuery/);
    expect(view).not.toMatch(/for \(const c of charts\)\s*\{[\s\S]{0,400}?await apiFetch/);
  });
});

describe("regressions found in review", () => {
  it("does not fetch the chart list twice on load", () => {
    // The load effect fetches charts to discover filters, then hands them to
    // loadCharts. Without the prefetched argument that was two identical
    // requests on every dashboard selection.
    expect(view).toContain("async function loadCharts(dashId, values, params, prefetched)");
    expect(view).toContain("prefetched || await apiFetch");
    expect(view).toContain("loadCharts(d.id, values, discovered, fetched)");
  });

  it("does not reload the dashboard when the dashboards array changes identity", () => {
    // saveSettings replaces the array, so without this guard renaming a filter
    // label reloaded the dashboard and re-ran every chart on it.
    expect(view).toContain("loadedDashRef");
    expect(view).toContain("if (loadedDashRef.current === d.id) return;");
  });

  it("clears the rerunning flag explicitly", () => {
    // runChart spreads the previous chart object, so a leftover flag would
    // survive two overlapping reruns and dim the tile permanently.
    expect(view).toContain("_rerunning: false");
  });

  it("guards config parsing everywhere it happens", () => {
    // A malformed config must not throw before the tile's real error shows.
    expect(view).not.toMatch(/const cfg = typeof chart\.config === 'string' \? JSON\.parse\(chart\.config\)/);
  });

  it("clears the dashboard id from the URL on delete", () => {
    expect(view).toMatch(/deleteDash[\s\S]{0,600}setSearchParams\(new URLSearchParams\(\)/);
  });

  it("runs a saved chart's parameters on the All Charts page too", () => {
    // This page was missed entirely: it ran chart SQL with no params, so the
    // gallery broke for any chart carrying a placeholder.
    expect(allCharts).toContain("paramDefaults");
    expect(allCharts).toContain("findParameters");
    expect(allCharts).toMatch(/runQuery\(chart\.sqlQuery,/);
  });
});

describe("values travel as parameters", () => {
  it("passes params to runQuery rather than building SQL", () => {
    expect(view).toContain("{ params: mine }");
    // No string splicing of values into the statement anywhere.
    expect(view).not.toMatch(/sqlQuery\.replace\(/);
  });

  it("sends only the parameters a chart declares", () => {
    expect(view).toContain("params.byChart.get(chart.id)");
  });
});

describe("required parameters", () => {
  it("checks before sending rather than letting ClickHouse reject it", () => {
    expect(view).toContain("missingRequired");
    expect(view).toContain("waitingMessage");
    expect(view).toContain("_waiting");
  });

  it("renders waiting as a warning, not an error", () => {
    // Red here would train people to ignore red on a dashboard.
    expect(view).toMatch(/_waiting[\s\S]{0,400}alert-banner warning/);
  });

  it("keeps the error state distinct from the waiting state", () => {
    expect(view).toContain("alert-banner danger");
    expect(view).toContain("opt?._error");
  });
});

describe("URL state", () => {
  it("keeps the dashboard id in the URL, not just local state", () => {
    expect(view).toContain("useSearchParams");
    expect(view).toContain("DASH_KEY");
    expect(view).toContain("next.set(DASH_KEY");
  });

  it("namespaces filter values so a parameter cannot collide with it", () => {
    // A parameter may legitimately be named `d`.
    expect(view).toContain("FILTER_PREFIX");
    expect(view).toContain("'f.'");
  });

  it("writes filter values only on Apply", () => {
    expect(view).toMatch(/async function applyFilters[\s\S]{0,900}setSearchParams/);
  });

  it("does not reload the dashboard when only filters change", () => {
    expect(view).toContain("searchParams is intentionally not a dependency");
  });
});

describe("role gating matches the API", () => {
  it("lets editors create", () => {
    expect(view).toContain("disabled={!canEdit}");
    expect(view).toContain("{showCreate && canEdit &&");
  });

  it("lets editors save a layout", () => {
    expect(view).toContain("{hasUnsaved && canEdit &&");
  });

  it("restricts deleting a dashboard to admin", () => {
    expect(view).toContain("{del && isAdmin &&");
    expect(view).toContain("disabled={!isAdmin}");
  });

  it("restricts deleting a chart to admin, matching requireAdmin on the route", () => {
    expect(view).toMatch(/\{isAdmin && \(\s*<button[^>]*onClick=\{onDelete\}/);
  });
});

describe("filter bar contract", () => {
  it("does not re-run on change", () => {
    // Changing a control only edits the draft. The behavioural proof is in
    // DashboardFilters.test.jsx; what is checked here is that no debounce or
    // auto-apply crept back in, which is how a live bar would be rebuilt by
    // accident.
    expect(bar).toContain("onChange(f.name, v)");
    expect(bar).not.toContain("setTimeout");
    expect(bar).not.toContain("useEffect");
  });

  it("disables Apply until something changes", () => {
    expect(bar).toContain("disabled={!dirty}");
  });

  it("compares the draft against what was applied, not against defaults", () => {
    expect(bar).toContain("(draft[f.name] ?? \"\") !== (applied[f.name] ?? \"\")");
  });

  it("applies on Enter", () => {
    expect(bar).toContain('e.key === "Enter"');
  });

  it("offers Reset alongside Apply", () => {
    expect(bar).toContain("onReset");
  });

  it("marks required-and-empty controls without blocking Apply", () => {
    expect(bar).toContain("invalid={needed}");
    expect(bar).not.toContain("disabled={needed}");
  });
});

describe("filter bar layout and chrome", () => {
  it("is labelled and collapsible", () => {
    expect(bar).toContain("Chart filters");
    expect(bar).toContain("aria-expanded={open}");
    expect(bar).toContain("ti-chevron-");
  });

  it("lays the controls out on a fixed grid, not a wrapping flex row", () => {
    // Filter names come from SQL and are not length-controlled, so a flex row
    // reflowed into a ragged line and long labels overlapped their inputs.
    expect(bar).toContain('display: "grid"');
    expect(bar).toContain("repeat(auto-fill, minmax(220px, 1fr))");
    expect(bar).not.toContain('flexWrap: "wrap"');
  });

  it("wraps long labels inside their cell", () => {
    expect(bar).toContain('overflowWrap: "anywhere"');
    expect(bar).toContain('wordBreak: "break-word"');
  });

  it("lets the grid cell size the control", () => {
    expect(bar).toContain("fullWidth");
  });

  it("puts the settings entry point top right, gated on edit rights", () => {
    expect(bar).toContain("Filter settings");
    expect(bar).toContain("onOpenSettings");
    expect(bar).toMatch(/canEdit &&[\s\S]{0,400}marginLeft: "auto"/);
  });
});

describe("settings panel", () => {
  it("renders as an app modal, not a browser dialog", () => {
    // Same overlay/box pair as ConfirmModal, so it carries the app theme.
    expect(settings).toContain('className="modal-overlay"');
    expect(settings).toContain('className="modal-box"');
    expect(settings).toContain('role="dialog"');
    expect(settings).not.toContain("window.alert");
    expect(settings).not.toContain("window.confirm");
  });

  it("closes on Escape and on a backdrop click", () => {
    expect(settings).toContain('e.key === "Escape"');
    expect(settings).toContain("e.stopPropagation()");
  });

  it("uses a fixed grid with wrapped parameter names", () => {
    expect(settings).toContain('display: "grid"');
    expect(settings).toContain("gridTemplateColumns");
    expect(settings).toContain('overflowWrap: "anywhere"');
  });
});

describe("dashboard full screen", () => {
  it("is a CSS overlay, like the rest of the app", () => {
    expect(view).toContain("pageFs");
    expect(view).toContain("ti-arrows-maximize");
    expect(view).not.toContain("requestFullscreen");
  });

  it("uses the theme background rather than a hardcoded colour", () => {
    expect(view).toContain("var(--bg-page)");
  });

  it("leaves on Escape and re-measures the charts", () => {
    expect(view).toMatch(/pageFs[\s\S]{0,300}Escape/);
    expect(view).toMatch(/new Event\('resize'\)/);
  });

  it("layers below a tile full screen and below the modal", () => {
    // tile overlay is 9999, modal overlay is 10000
    expect(view).toContain("zIndex: 9000");
  });
});

describe("settings panel content", () => {
  it("covers label, order, default and hidden", () => {
    expect(settings).toContain('"label"');
    expect(settings).toContain('"order"');
    expect(settings).toContain('"default"');
    expect(settings).toContain('"hidden"');
  });

  it("stores only what was set, so unconfigured stays unconfigured", () => {
    expect(settings).toContain("if (Object.keys(entry).length) out[name] = entry");
  });

  it("warns about a hidden required filter with no default", () => {
    expect(settings).toContain("its charts will not run");
  });

  it("types the default input like the filter itself", () => {
    expect(settings).toContain("ParamInput");
  });
});
