// Copyright (C) 2026 Quantrail™ Data Private Limited
// useQueryTabs.js - the SQL Editor's tab collection.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const TABS_KEY = "chops_query_tabs";
export const PARAM_SEED_KEY = "chops_param_values";
export const EXPLAIN_SEED_KEY = "chops_explain_options";

export const MAX_TABS = 10;
export const DEFAULT_SQL = "SELECT version()";

// Writing every tab's SQL on every keystroke is a synchronous localStorage
// write per character.
const PERSIST_DELAY = 400;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota, private mode, or a disabled store. The editor keeps working from
    // memory; the same thing the existing history helper does.
  }
}

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `t${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/* The lowest unused "Query N". */
export function nextTabName(tabs) {
  const used = new Set();
  for (const t of tabs) {
    const m = /^Query (\d+)$/.exec(t.name || "");
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `Query ${n}`;
}

export function makeTab({ name, sql = "", params = {}, explainTicked = {} } = {}) {
  return {
    id: newId(),
    name: name || "Query 1",
    sql,
    params: { ...params },
    explainType: "GENERAL RUN",
    explainTicked: { ...explainTicked },
  };
}

export function blankRuntime() {
  return {
    running: false,
    result: null,
    resultCols: [],
    totalRows: 0,
    truncated: false,
    rowCap: 0,
    error: null,
    successMsg: null,
    queryStats: null,
    memoryUsage: null,
    lastQueryId: null,
    featureQueryId: null,
    estimateResult: null,
    estimating: false,
    graphData: null,
    graphTitle: "",
  };
}

/* A stored value is only usable if it has the shape we expect. */
function loadTabs(paramSeed, explainSeed) {
  const stored = readJson(TABS_KEY, null);
  const list = Array.isArray(stored?.tabs) ? stored.tabs : null;

  if (!list || list.length === 0) {
    // First run, or a corrupt value.
    const first = makeTab({
      name: "Query 1",
      sql: DEFAULT_SQL,
      params: paramSeed,
      explainTicked: explainSeed,
    });
    return { tabs: [first], activeId: first.id };
  }

  const clean = list
    .filter((t) => t && typeof t.id === "string" && typeof t.sql === "string")
    .slice(0, MAX_TABS)
    .map((t) => ({
      id: t.id,
      name: typeof t.name === "string" && t.name ? t.name : "Query",
      sql: t.sql,
      params: t.params && typeof t.params === "object" ? t.params : {},
      explainType: typeof t.explainType === "string" ? t.explainType : "GENERAL RUN",
      explainTicked:
        t.explainTicked && typeof t.explainTicked === "object" ? t.explainTicked : {},
    }));

  if (clean.length === 0) {
    const first = makeTab({ sql: DEFAULT_SQL, params: paramSeed, explainTicked: explainSeed });
    return { tabs: [first], activeId: first.id };
  }

  const activeId = clean.some((t) => t.id === stored.activeId)
    ? stored.activeId
    : clean[0].id;
  return { tabs: clean, activeId };
}

export function useQueryTabs() {
  const initial = useRef(null);
  if (initial.current === null) {
    initial.current = loadTabs(
      readJson(PARAM_SEED_KEY, {}),
      readJson(EXPLAIN_SEED_KEY, {}),
    );
  }

  const [tabs, setTabs] = useState(initial.current.tabs);
  const [activeId, setActiveId] = useState(initial.current.activeId);
  const [runtime, setRuntimeAll] = useState(() =>
    Object.fromEntries(initial.current.tabs.map((t) => [t.id, blankRuntime()])),
  );

  // The seeds. Held in a ref rather than state: nothing renders from them, and
  // they change on every parameter keystroke.
  const paramSeed = useRef(readJson(PARAM_SEED_KEY, {}));
  const explainSeed = useRef(readJson(EXPLAIN_SEED_KEY, {}));

  // persistence

  const persistTimer = useRef(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      writeJson(TABS_KEY, { tabs, activeId });
    }, PERSIST_DELAY);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [tabs, activeId]);

  // Write once more on unmount, or a reload within the debounce window loses
  // the last few hundred milliseconds of typing.
  useEffect(() => {
    const flush = () => writeJson(TABS_KEY, { tabs, activeId });
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [tabs, activeId]);

  // selectors

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) || tabs[0],
    [tabs, activeId],
  );

  const activeRuntime = runtime[activeId] || blankRuntime();

  const runningTabs = useMemo(
    () => tabs.filter((t) => runtime[t.id]?.running),
    [tabs, runtime],
  );

  // operations

  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /* Set one parameter on one tab, and update the seed. */
  const setParam = useCallback((id, name, value) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, params: { ...t.params, [name]: value } } : t)),
    );
    paramSeed.current = { ...paramSeed.current, [name]: value };
    writeJson(PARAM_SEED_KEY, paramSeed.current);
  }, []);

  /** Same shape for the EXPLAIN checkboxes: per tab, and the seed follows. */
  const toggleExplainOption = useCallback((id, key) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t.explainTicked, [key]: !t.explainTicked[key] };
        explainSeed.current = { ...explainSeed.current, ...next };
        writeJson(EXPLAIN_SEED_KEY, explainSeed.current);
        return { ...t, explainTicked: next };
      }),
    );
  }, []);

  const addTab = useCallback((init = {}) => {
    let created = null;
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      created = makeTab({
        name: init.name || nextTabName(prev),
        sql: init.sql || "",
        // A new tab starts from the seed, so a tenant typed once still
        // prefills, and then diverges from here.
        params: init.params || paramSeed.current,
        explainTicked: init.explainTicked || explainSeed.current,
      });
      return [...prev, created];
    });
    if (created) {
      setRuntimeAll((r) => ({ ...r, [created.id]: blankRuntime() }));
      setActiveId(created.id);
    }
    return created;
  }, []);

  const closeTab = useCallback((id) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== id);

      // Closing the last tab leaves one empty tab, not an empty screen.
      if (next.length === 0) {
        const fresh = makeTab({
          name: "Query 1",
          params: paramSeed.current,
          explainTicked: explainSeed.current,
        });
        setActiveId(fresh.id);
        setRuntimeAll({ [fresh.id]: blankRuntime() });
        return [fresh];
      }

      setActiveId((cur) => {
        if (cur !== id) return cur;
        // The tab that took its place, or the one before it if it was last.
        return (next[idx] || next[idx - 1] || next[0]).id;
      });
      setRuntimeAll((r) => {
        const { [id]: _gone, ...rest } = r;
        return rest;
      });
      return next;
    });
  }, []);

  const renameTab = useCallback(
    (id, name) => {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      updateTab(id, { name: trimmed.slice(0, 40) });
    },
    [updateTab],
  );

  /* Patch one tab's runtime. */
  const setRuntime = useCallback((id, patch) => {
    setRuntimeAll((prev) => {
      const cur = prev[id] || blankRuntime();
      const next = typeof patch === "function" ? patch(cur) : patch;
      return { ...prev, [id]: { ...cur, ...next } };
    });
  }, []);

  const resetRuntime = useCallback(
    (id) => setRuntimeAll((prev) => ({ ...prev, [id]: blankRuntime() })),
    [],
  );

  return {
    tabs,
    activeId,
    activeTab,
    runtime,
    activeRuntime,
    runningTabs,
    canAddTab: tabs.length < MAX_TABS,

    selectTab: setActiveId,
    addTab,
    closeTab,
    renameTab,
    updateTab,
    setParam,
    toggleExplainOption,
    setRuntime,
    resetRuntime,
  };
}
