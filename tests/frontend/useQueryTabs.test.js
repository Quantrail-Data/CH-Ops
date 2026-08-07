// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useQueryTabs,
  nextTabName,
  makeTab,
  blankRuntime,
  MAX_TABS,
  TABS_KEY,
  PARAM_SEED_KEY,
  EXPLAIN_SEED_KEY,
  DEFAULT_SQL,
} from "../../src/frontend/components/editor/useQueryTabs.js";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

const setup = () => renderHook(() => useQueryTabs());

describe("nextTabName", () => {
  it("starts at one", () => {
    expect(nextTabName([])).toBe("Query 1");
  });
  it("takes the lowest unused number, not the next one up", () => {
    // Close Query 2 and the next new tab should be Query 2 again, not Query 4.
    const tabs = [{ name: "Query 1" }, { name: "Query 3" }];
    expect(nextTabName(tabs)).toBe("Query 2");
  });
  it("ignores renamed tabs, so their number is free again", () => {
    expect(nextTabName([{ name: "errors by hour" }])).toBe("Query 1");
  });
});

describe("first run", () => {
  it("opens one tab with the default SQL", () => {
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].sql).toBe(DEFAULT_SQL);
    expect(result.current.activeId).toBe(result.current.tabs[0].id);
  });

  it("seeds that tab from the existing shared preferences", () => {
    // An upgrading user keeps the parameter values and EXPLAIN options they
    // already had, rather than finding them silently gone.
    localStorage.setItem(PARAM_SEED_KEY, JSON.stringify({ tenant: "acme" }));
    localStorage.setItem(EXPLAIN_SEED_KEY, JSON.stringify({ indexes: true }));
    const { result } = setup();
    expect(result.current.tabs[0].params).toEqual({ tenant: "acme" });
    expect(result.current.tabs[0].explainTicked).toEqual({ indexes: true });
  });

  it("gives every tab a runtime record", () => {
    const { result } = setup();
    expect(result.current.activeRuntime).toEqual(blankRuntime());
  });
});

describe("restoring", () => {
  const stored = (tabs, activeId) =>
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, activeId }));

  it("restores tabs and the active one", () => {
    const a = makeTab({ name: "A", sql: "SELECT 1" });
    const b = makeTab({ name: "B", sql: "SELECT 2" });
    stored([a, b], b.id);
    const { result } = setup();
    expect(result.current.tabs.map((t) => t.name)).toEqual(["A", "B"]);
    expect(result.current.activeTab.name).toBe("B");
  });

  it("falls back to the first tab when the stored active id is gone", () => {
    const a = makeTab({ name: "A" });
    stored([a], "an-id-that-no-longer-exists");
    const { result } = setup();
    expect(result.current.activeId).toBe(a.id);
  });

  it("resets to one empty tab on a corrupt value rather than breaking", () => {
    localStorage.setItem(TABS_KEY, "{not json");
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].sql).toBe(DEFAULT_SQL);
  });

  it("resets when the stored value is the wrong shape", () => {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: "not an array" }));
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
  });

  it("drops entries that are not tabs, and keeps the rest", () => {
    const good = makeTab({ name: "Good", sql: "SELECT 1" });
    stored([good, { id: 42 }, null, { name: "no id or sql" }], good.id);
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].name).toBe("Good");
  });

  it("truncates a stored list longer than the cap", () => {
    stored(
      Array.from({ length: 25 }, (_, i) => makeTab({ name: `Q${i}`, sql: "x" })),
      null,
    );
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(MAX_TABS);
  });

  it("survives localStorage throwing on read", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
    spy.mockRestore();
  });
});

describe("adding and closing", () => {
  it("adds a tab and makes it active", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeId).toBe(result.current.tabs[1].id);
  });

  it("names a new tab Query 2", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    expect(result.current.tabs[1].name).toBe("Query 2");
  });

  it("stops at the cap", () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < MAX_TABS + 5; i += 1) result.current.addTab();
    });
    expect(result.current.tabs).toHaveLength(MAX_TABS);
    expect(result.current.canAddTab).toBe(false);
  });

  it("closes a tab", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const id = result.current.tabs[0].id;
    act(() => { result.current.closeTab(id); });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs.some((t) => t.id === id)).toBe(false);
  });

  it("moves the selection when the active tab closes", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    act(() => { result.current.addTab(); });
    const [, middle] = result.current.tabs;
    act(() => { result.current.selectTab(middle.id); });
    act(() => { result.current.closeTab(middle.id); });
    expect(result.current.activeId).not.toBe(middle.id);
    expect(result.current.tabs.some((t) => t.id === result.current.activeId)).toBe(true);
  });

  it("leaves the selection alone when another tab closes", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const active = result.current.activeId;
    act(() => { result.current.closeTab(result.current.tabs[0].id); });
    expect(result.current.activeId).toBe(active);
  });

  it("closing the last tab leaves one empty tab, not an empty screen", () => {
    const { result } = setup();
    act(() => { result.current.closeTab(result.current.tabs[0].id); });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].sql).toBe("");
  });

  it("ignores a close for an id that is not there", () => {
    const { result } = setup();
    act(() => { result.current.closeTab("nope"); });
    expect(result.current.tabs).toHaveLength(1);
  });

  it("drops the closed tab's runtime", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const id = result.current.tabs[1].id;
    act(() => { result.current.setRuntime(id, { result: [1, 2, 3] }); });
    act(() => { result.current.closeTab(id); });
    expect(result.current.runtime[id]).toBeUndefined();
  });
});

describe("renaming", () => {
  it("renames", () => {
    const { result } = setup();
    act(() => { result.current.renameTab(result.current.activeId, "errors by hour"); });
    expect(result.current.activeTab.name).toBe("errors by hour");
  });
  it("ignores an empty name rather than leaving a blank tab", () => {
    const { result } = setup();
    act(() => { result.current.renameTab(result.current.activeId, "   "); });
    expect(result.current.activeTab.name).toBe("Query 1");
  });
  it("caps the length, so one tab cannot take the whole strip", () => {
    const { result } = setup();
    act(() => { result.current.renameTab(result.current.activeId, "x".repeat(200)); });
    expect(result.current.activeTab.name.length).toBeLessThanOrEqual(40);
  });
});

describe("parameter values: per tab, seeded", () => {
  it("writes only to the tab it was given", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [first] = result.current.tabs;
    act(() => { result.current.setParam(first.id, "tenant", "acme"); });
    expect(result.current.tabs[0].params.tenant).toBe("acme");
    expect(result.current.tabs[1].params.tenant).toBeUndefined();
  });

  it("lets two tabs hold different values for the same name", () => {
    // The reason for the whole per-tab decision.
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [a, b] = result.current.tabs;
    act(() => { result.current.setParam(a.id, "tenant", "acme"); });
    act(() => { result.current.setParam(b.id, "tenant", "globex"); });
    expect(result.current.tabs[0].params.tenant).toBe("acme");
    expect(result.current.tabs[1].params.tenant).toBe("globex");
  });

  it("updates the seed, so the NEXT new tab prefills", () => {
    const { result } = setup();
    act(() => { result.current.setParam(result.current.activeId, "tenant", "acme"); });
    act(() => { result.current.addTab(); });
    expect(result.current.tabs[1].params.tenant).toBe("acme");
  });

  it("does NOT change tabs that already exist", () => {
    // The rule that makes side-by-side comparison work.
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [_, b] = result.current.tabs;
    act(() => { result.current.setParam(b.id, "tenant", "globex"); });
    expect(result.current.tabs[0].params.tenant).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(PARAM_SEED_KEY)).tenant).toBe("globex");
  });
});

describe("EXPLAIN options: per tab, seeded the same way", () => {
  it("ticks on one tab only", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [a,] = result.current.tabs;
    act(() => { result.current.toggleExplainOption(a.id, "indexes"); });
    expect(result.current.tabs[0].explainTicked.indexes).toBe(true);
    expect(result.current.tabs[1].explainTicked.indexes).toBeFalsy();
  });

  it("toggles back off", () => {
    const { result } = setup();
    const id = result.current.activeId;
    act(() => { result.current.toggleExplainOption(id, "indexes"); });
    act(() => { result.current.toggleExplainOption(id, "indexes"); });
    expect(result.current.activeTab.explainTicked.indexes).toBe(false);
  });

  it("seeds the next new tab", () => {
    const { result } = setup();
    act(() => { result.current.toggleExplainOption(result.current.activeId, "indexes"); });
    act(() => { result.current.addTab(); });
    expect(result.current.tabs[1].explainTicked.indexes).toBe(true);
  });
});

describe("runtime", () => {
  it("patches one tab without touching another", () => {
    // A query finishing writes through this while the user may be looking at a
    // different tab, so it must never read the active one.
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [a, b] = result.current.tabs;
    act(() => { result.current.setRuntime(a.id, { running: true }); });
    expect(result.current.runtime[a.id].running).toBe(true);
    expect(result.current.runtime[b.id].running).toBe(false);
  });

  it("accepts a functional patch, for updates that race", () => {
    const { result } = setup();
    const id = result.current.activeId;
    act(() => { result.current.setRuntime(id, { totalRows: 5 }); });
    act(() => { result.current.setRuntime(id, (cur) => ({ totalRows: cur.totalRows + 1 })); });
    expect(result.current.runtime[id].totalRows).toBe(6);
  });

  it("lists the running tabs, for the strip and the confirmation", () => {
    const { result } = setup();
    act(() => { result.current.addTab(); });
    const [a] = result.current.tabs;
    expect(result.current.runningTabs).toHaveLength(0);
    act(() => { result.current.setRuntime(a.id, { running: true }); });
    expect(result.current.runningTabs.map((t) => t.id)).toEqual([a.id]);
  });

  it("resets one tab's runtime", () => {
    const { result } = setup();
    const id = result.current.activeId;
    act(() => { result.current.setRuntime(id, { error: "boom", running: true }); });
    act(() => { result.current.resetRuntime(id); });
    expect(result.current.runtime[id]).toEqual(blankRuntime());
  });
});

describe("persistence", () => {
  it("writes tabs after the debounce", async () => {
    const { result } = setup();
    act(() => { result.current.updateTab(result.current.activeId, { sql: "SELECT 42" }); });
    await new Promise((r) => setTimeout(r, 600));
    const stored = JSON.parse(localStorage.getItem(TABS_KEY));
    expect(stored.tabs[0].sql).toBe("SELECT 42");
  });

  it("does NOT persist results", async () => {
    // Query output is large, cheap to recreate, and does not belong in
    // plaintext storage shared with the whole origin.
    const { result } = setup();
    act(() => {
      result.current.setRuntime(result.current.activeId, {
        result: [{ secret: "value" }],
      });
    });
    await new Promise((r) => setTimeout(r, 600));
    expect(localStorage.getItem(TABS_KEY)).not.toContain("secret");
  });

  it("survives localStorage throwing on write", async () => {
    const { result } = setup();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    act(() => { result.current.updateTab(result.current.activeId, { sql: "x" }); });
    await new Promise((r) => setTimeout(r, 600));
    expect(result.current.activeTab.sql).toBe("x");
    spy.mockRestore();
  });
});
