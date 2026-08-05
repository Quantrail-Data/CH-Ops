// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// currentQueries.test.js - pure logic behind the Current Queries page

import { describe, test, expect } from "bun:test";

import {
  fmtBytes,
  fmtDuration,
  fmtRows,
  fmtPercent,
  ratio,
  num,
  truncate,
} from "../../src/frontend/utils/format.js";

import {
  aggregateByUser,
  applyFilters,
  buildFilterOptionsSql,
  buildKillSql,
  buildProcessesSql,
  clampBytes,
  compareValues,
  deriveRow,
  deriveRows,
  diffKilled,
  distinctValues,
  httpMethodName,
  interfaceName,
  isSafeQueryId,
  mergeOptions,
  quoteLiteral,
  runBounded,
  sortRows,
  summarise,
  topByElapsed,
  topNWithOther,
  KILL_CONCURRENCY,
  PROCESS_COLUMNS,
  REFRESH_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_FIELDS,
  totalRunning,
} from "../../src/frontend/components/queries/processesModel.js";

// As ClickHouse delivers it: 64-bit integers arrive as strings, so coerce first.
function chRow(over = {}) {
  return {
    query_id: "q1",
    user: "default",
    query_kind: "Select",
    elapsed: 1.5,
    read_rows: "1000",
    read_bytes: "2048",
    written_rows: "0",
    written_bytes: "0",
    total_rows_approx: "4000",
    memory_usage: "1048576",
    peak_memory_usage: "2097152",
    peak_threads_usage: "4",
    is_cancelled: 0,
    is_initial_query: 1,
    is_internal: 0,
    query_preview: "SELECT 1",
    ...over,
  };
}

describe("format helpers", () => {
  test("labels binary units binarily, matching ClickHouse formatReadableSize", () => {
    // Five older helpers divide by 1024 and print "GB".
    expect(fmtBytes(1024)).toBe("1.00 KiB");
    expect(fmtBytes(1024 ** 3)).toBe("1.00 GiB");
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
  });

  test("coerces the strings ClickHouse sends for 64-bit columns", () => {
    expect(num("1048576")).toBe(1048576);
    expect(num("")).toBe(0);
    expect(num(null, 7)).toBe(7);
    expect(num("not a number", 3)).toBe(3);
    expect(fmtBytes("1073741824")).toBe("1.00 GiB");
  });

  test("changes duration units with magnitude", () => {
    expect(fmtDuration(0.004)).toBe("4ms");
    expect(fmtDuration(2.34)).toBe("2.3s");
    expect(fmtDuration(75)).toBe("1m 15s");
    expect(fmtDuration(3725)).toBe("1h 02m");
  });

  test("abbreviates large row counts but groups small ones", () => {
    expect(fmtRows(999)).toBe("999");
    expect(fmtRows(12345)).toBe("12,345");
    expect(fmtRows(2_500_000)).toBe("2.50M");
  });

  test("returns null rather than zero when a ratio is unknowable", () => {
    // total_rows_approx is 0 until ClickHouse knows how much there is to read.
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(10, null)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(fmtPercent(null)).toBe("-");
    expect(fmtPercent(0.25)).toBe("25%");
  });

  test("clamps a ratio into range when read_rows overshoots the estimate", () => {
    expect(ratio(5000, 4000)).toBe(1);
  });

  test("truncates on a word boundary where one is close enough", () => {
    expect(truncate("hello world", 50)).toBe("hello world");
    expect(truncate("aaaa bbbb cccc dddd", 12).endsWith("...")).toBe(true);
  });
});

describe("SQL construction", () => {
  test("excludes the heavy columns and its own query from the poll", () => {
    const { sql } = buildProcessesSql({});
    for (const col of ["ProfileEvents", "Settings", "thread_ids"]) {
      expect(sql).toContain(col);
      expect(sql).toContain("EXCEPT");
    }
    // Otherwise the poll sees itself every tick.
    expect(sql).toContain("query_id != queryID()");
    expect(sql).toContain("substring(query, 1, 200) AS query_preview");
  });

  test("rejects a query id that is not plainly safe", () => {
    // Clients can set their own query_id, so it is untrusted input.
    expect(isSafeQueryId("3f2b1c8a-0000-4a1b-9c2d-000000000001")).toBe(true);
    expect(isSafeQueryId("my-app:job/42")).toBe(true);
    expect(isSafeQueryId("x' OR 1=1 --")).toBe(false);
    expect(isSafeQueryId("a\\'b")).toBe(false);
    expect(isSafeQueryId("")).toBe(false);
    expect(isSafeQueryId(null)).toBe(false);
  });

  test("refuses to build a kill statement for an unsafe id", () => {
    expect(() => buildKillSql("x' OR 1=1 --")).toThrow(/unexpected characters/i);
  });

  test("builds an async single-id kill by default and sync on request", () => {
    expect(buildKillSql("abc-123")).toBe("KILL QUERY WHERE query_id = 'abc-123' ASYNC");
    expect(buildKillSql("abc-123", { sync: true })).toBe("KILL QUERY WHERE query_id = 'abc-123' SYNC");
  });

  test("sends different SQL for the sync and async buttons", () => {
    // Both buttons share one dialog and one code path, so pin the difference.
    const ids = ["q-a", "q-b"];
    const asyncSql = ids.map((id) => buildKillSql(id, { sync: false }));
    const syncSql = ids.map((id) => buildKillSql(id, { sync: true }));
    expect(asyncSql.every((q) => q.endsWith("ASYNC"))).toBe(true);
    expect(syncSql.every((q) => q.endsWith(" SYNC"))).toBe(true);
    expect(asyncSql).not.toEqual(syncSql);
  });

  test("never emits a predicate that could match beyond the given id", () => {
    const sql = buildKillSql("abc-123");
    expect(sql).not.toMatch(/WHERE\s+user\s*=/i);
    expect(sql).toMatch(/WHERE query_id = '[^']*'/);
  });

  test("escapes quotes if the safe charset is ever widened", () => {
    expect(quoteLiteral("a'b")).toBe("'a\\'b'");
    expect(quoteLiteral("a\\b")).toBe("'a\\\\b'");
  });
});

describe("filter options", () => {
  test("reads from query_log, bounded and partition-pruned", () => {
    const sql = buildFilterOptionsSql(7);
    // Without query_log the dropdowns are empty when nothing is running.
    expect(sql).toContain("system.query_log");
    expect(sql).toContain("event_date >= today() - 7");
    // Capped, so a busy log cannot return an unbounded list.
    expect(sql).toContain("groupUniqArray(200)(user)");
    expect(sql).toContain("groupUniqArray(50)(query_kind)");
  });

  test("clamps the day window instead of interpolating whatever it is given", () => {
    expect(buildFilterOptionsSql(0)).toContain("today() - 1");
    expect(buildFilterOptionsSql(9999)).toContain("today() - 90");
    expect(buildFilterOptionsSql(2.7)).toContain("today() - 2");
  });

  test("merges log history with the live snapshot, deduped and sorted", () => {
    expect(mergeOptions(["bi", "etl"], ["etl", "adhoc"])).toEqual(["adhoc", "bi", "etl"]);
  });

  test("survives a missing or empty query_log result", () => {
    expect(mergeOptions(null, ["etl"])).toEqual(["etl"]);
    expect(mergeOptions(undefined, undefined)).toEqual([]);
    expect(mergeOptions(["", null, "etl"], [])).toEqual(["etl"]);
  });
});

describe("deriveRow", () => {
  test("turns the string columns into numbers", () => {
    const r = deriveRow(chRow());
    expect(r.read_rows).toBe(1000);
    expect(r.memory_usage).toBe(1048576);
    expect(typeof r.read_bytes).toBe("number");
  });

  test("computes progress, and leaves it null when there is no estimate", () => {
    expect(deriveRow(chRow()).progress).toBe(0.25);
    expect(deriveRow(chRow({ total_rows_approx: "0" })).progress).toBeNull();
  });

  test("clamps the negative memory Int64 accounting can report", () => {
    expect(clampBytes(-4096)).toBe(0);
    expect(deriveRow(chRow({ memory_usage: "-4096" })).memory_usage).toBe(0);
  });

  test("normalises the integer flags to booleans", () => {
    const r = deriveRow(chRow({ is_cancelled: 1, is_internal: 1, is_initial_query: 0 }));
    expect(r.is_cancelled).toBe(true);
    expect(r.is_internal).toBe(true);
    expect(r.is_initial_query).toBe(false);
  });
});

describe("sorting", () => {
  test("sorts numerically, not lexically", () => {
    // The old page pre-formatted read_bytes, so a string sort put "9 B" on top.
    const rows = deriveRows([
      chRow({ query_id: "a", read_bytes: "9" }),
      chRow({ query_id: "b", read_bytes: "1610612736" }),
      chRow({ query_id: "c", read_bytes: "1024" }),
    ]);
    expect(sortRows(rows, "read_bytes", "desc").map((r) => r.query_id)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "read_bytes", "asc").map((r) => r.query_id)).toEqual(["a", "c", "b"]);
  });

  test("keeps unknown progress last in both directions", () => {
    const rows = deriveRows([
      chRow({ query_id: "a", read_rows: "1", total_rows_approx: "100" }),
      chRow({ query_id: "b", total_rows_approx: "0" }),
      chRow({ query_id: "c", read_rows: "90", total_rows_approx: "100" }),
    ]);
    expect(sortRows(rows, "progress", "desc").at(-1).query_id).toBe("b");
    expect(sortRows(rows, "progress", "asc").at(-1).query_id).toBe("b");
  });

  test("does not mutate the array it is given", () => {
    const rows = deriveRows([chRow({ query_id: "a", elapsed: 1 }), chRow({ query_id: "b", elapsed: 9 })]);
    const before = rows.map((r) => r.query_id);
    sortRows(rows, "elapsed", "desc");
    expect(rows.map((r) => r.query_id)).toEqual(before);
  });

  test("compares strings naturally so node10 follows node9", () => {
    expect(compareValues("node9", "node10")).toBeLessThan(0);
  });

  test("declares every numeric column sortable", () => {
    const required = [
      "query_id", "user", "elapsed", "read_rows", "read_bytes", "memory_usage",
      "peak_memory_usage", "written_rows", "written_bytes", "query_kind",
    ];
    for (const key of required) {
      const col = PROCESS_COLUMNS.find((c) => c.key === key);
      expect(col, `missing column ${key}`).toBeTruthy();
      expect(col.sortable, `${key} should be sortable`).toBe(true);
    }
  });
});

describe("search in SQL", () => {
  test("omits the predicate and params when there is no term", () => {
    const built = buildProcessesSql({});
    expect(built.params).toBeUndefined();
    expect(built.sql).not.toContain("positionCaseInsensitive");
  });

  test("binds the term instead of interpolating it", () => {
    // A term is user input and reaches the server as a parameter, never as SQL.
    const built = buildProcessesSql({ search: "x' OR 1=1--" });
    expect(built.params).toEqual({ q: "x' OR 1=1--" });
    expect(built.sql).not.toContain("OR 1=1");
    expect(built.sql).toContain("{q:String}");
  });

  test("searches the whole statement, not the preview column", () => {
    // query_preview is a 200 char substring, so the predicate must name `query`.
    const sql = buildProcessesSql({ search: "join", searchField: "query_preview" }).sql;
    expect(sql).toContain("positionCaseInsensitive(query, {q:String})");
    expect(sql).not.toContain("positionCaseInsensitive(query_preview");
  });

  test("scopes to one column when a field is chosen", () => {
    expect(buildProcessesSql({ search: "etl", searchField: "user" }).sql).toContain(
      "positionCaseInsensitive(user, {q:String}) > 0",
    );
    expect(buildProcessesSql({ search: "abc", searchField: "query_id" }).sql).toContain(
      "positionCaseInsensitive(query_id, {q:String}) > 0",
    );
  });

  test("ORs every column when no field is chosen", () => {
    const sql = buildProcessesSql({ search: "etl" }).sql;
    expect((sql.match(/positionCaseInsensitive/g) || []).length).toBe(3);
    expect(sql).toContain(" OR ");
  });

  test("ignores an unknown field rather than building a bad column name", () => {
    const sql = buildProcessesSql({ search: "etl", searchField: "nonsense; DROP" }).sql;
    expect(sql).not.toContain("nonsense");
    expect((sql.match(/positionCaseInsensitive/g) || []).length).toBe(3);
  });

  test("carries the unfiltered count so the footer can still show a total", () => {
    expect(buildProcessesSql({ search: "etl" }).sql).toContain("AS total_running");
    expect(totalRunning([{ total_running: "1847" }])).toBe(1847);
  });

  test("reports an unknown total when nothing matched", () => {
    // The count rides on the rows, so no rows means no count. Better than stale.
    expect(totalRunning([])).toBeNull();
    expect(totalRunning(undefined)).toBeNull();
  });

  test("debounces at the fastest refresh, so typing cannot outpace the poll", () => {
    const rates = REFRESH_OPTIONS.map((o) => o.value).filter(Boolean);
    expect(SEARCH_DEBOUNCE_MS).toBe(Math.min(...rates));
    expect(SEARCH_DEBOUNCE_MS).toBe(2000);
    // Off is 0 and is not a rate, so it must not win the minimum.
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  test("offers a field for every column the unscoped search covers", () => {
    expect(SEARCH_FIELDS.map((f) => f.value)).toEqual(["", "query_preview", "user", "query_id"]);
  });
});

describe("filtering", () => {
  const rows = deriveRows([
    chRow({ query_id: "a", user: "etl", query_kind: "Insert", query_preview: "INSERT INTO events" }),
    chRow({ query_id: "b", user: "bi", query_kind: "Select", query_preview: "SELECT count() FROM events" }),
    chRow({ query_id: "c", user: "bi", query_kind: "Select", is_internal: 1 }),
    chRow({ query_id: "d", user: "bi", query_kind: "Select", is_initial_query: 0 }),
    chRow({ query_id: "e", user: "bi", query_kind: "Select", query_preview: "SELECT * FROM etl_runs" }),
  ]);

  test("filters by user and kind", () => {
    expect(applyFilters(rows, { users: ["bi"] })).toHaveLength(4);
    expect(applyFilters(rows, { kinds: ["Insert"] })).toHaveLength(1);
  });

  test("hides internal and secondary distributed queries on request", () => {
    expect(applyFilters(rows, { hideInternal: true }).map((r) => r.query_id)).not.toContain("c");
    expect(applyFilters(rows, { initialOnly: true }).map((r) => r.query_id)).not.toContain("d");
  });

  test("lists distinct users in sorted order", () => {
    expect(distinctValues(rows, "user")).toEqual(["bi", "etl"]);
  });
});

describe("aggregation", () => {
  const rows = deriveRows([
    chRow({ query_id: "a", user: "etl", memory_usage: "300", read_bytes: "10", elapsed: 5, query_kind: "Insert" }),
    chRow({ query_id: "b", user: "etl", memory_usage: "200", read_bytes: "20", elapsed: 9, query_kind: "Select" }),
    chRow({ query_id: "c", user: "bi", memory_usage: "100", read_bytes: "70", elapsed: 1, query_kind: "Select" }),
  ]);

  test("sums per user and keeps the longest elapsed", () => {
    const etl = aggregateByUser(rows).find((e) => e.user === "etl");
    expect(etl.count).toBe(2);
    expect(etl.memory).toBe(500);
    expect(etl.elapsedMax).toBe(9);
    expect(etl.kinds).toEqual({ Insert: 1, Select: 1 });
  });

  test("summarises the whole set", () => {
    const s = summarise(rows);
    expect(s.running).toBe(3);
    expect(s.users).toBe(2);
    expect(s.memory).toBe(600);
    expect(s.longest).toBe(9);
  });

  test("folds everything past the top N into one honest Other slice", () => {
    const many = deriveRows(
      Array.from({ length: 20 }, (_, i) =>
        chRow({ query_id: `q${i}`, user: `u${i}`, memory_usage: String((20 - i) * 10) }),
      ),
    );
    const slices = topNWithOther(aggregateByUser(many), "memory", 6);
    expect(slices).toHaveLength(7);
    expect(slices.at(-1).name).toBe("Other (14 users)");
    // The fold must not lose bytes.
    const total = slices.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(summarise(many).memory);
  });

  test("does not add an Other slice when everyone fits", () => {
    expect(topNWithOther(aggregateByUser(rows), "memory", 6)).toHaveLength(2);
  });

  test("ranks the longest running first", () => {
    expect(topByElapsed(rows, 2).map((r) => r.query_id)).toEqual(["b", "a"]);
  });
});

describe("bounded concurrency", () => {
  test("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);
    await runBounded(
      items,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      },
      { limit: 8 },
    );
    expect(peak).toBeLessThanOrEqual(8);
  });

  test("uses 8 as the page default", () => {
    expect(KILL_CONCURRENCY).toBe(8);
  });

  test("reports failures per item instead of rejecting the batch", async () => {
    // Killing 800 queries, you want the tally and not the first failure.
    const results = await runBounded(
      ["ok", "bad", "ok"],
      async (v) => {
        if (v === "bad") throw new Error("nope");
        return v;
      },
      { limit: 2 },
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => !r.ok).error).toBe("nope");
  });

  test("processes every item exactly once", async () => {
    const seen = [];
    const items = Array.from({ length: 33 }, (_, i) => i);
    await runBounded(items, async (i) => seen.push(i), { limit: 8 });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  test("reports monotonic progress ending at the total", async () => {
    const seq = [];
    await runBounded([1, 2, 3, 4, 5], async () => {}, {
      limit: 2,
      onProgress: (done, total) => seq.push([done, total]),
    });
    expect(seq.at(-1)).toEqual([5, 5]);
    expect(seq.map((s) => s[0])).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles an empty target list without hanging", async () => {
    expect(await runBounded([], async () => {}, { limit: 8 })).toEqual([]);
  });
});

describe("kill verification", () => {
  test("classifies by what is gone from a fresh snapshot", () => {
    // KILL's own result is unusable, the backend returns no rows for it.
    const { gone, stillRunning } = diffKilled(
      ["a", "b", "c"],
      [{ query_id: "b" }, { query_id: "z" }],
    );
    expect(gone).toEqual(["a", "c"]);
    expect(stillRunning).toEqual(["b"]);
  });

  test("reports everything gone when the process list emptied", () => {
    expect(diffKilled(["a", "b"], []).gone).toEqual(["a", "b"]);
  });

  test("ignores queries that were never targeted", () => {
    expect(diffKilled(["a"], [{ query_id: "x" }, { query_id: "y" }]).stillRunning).toEqual([]);
  });
});

describe("enum decoding", () => {
  test("names the interface rather than showing its code", () => {
    expect(interfaceName(1)).toBe("TCP");
    expect(interfaceName(2)).toBe("HTTP");
    expect(interfaceName("2")).toBe("HTTP");
    expect(interfaceName(99)).toBe("Unknown");
  });

  test("names the http method", () => {
    expect(httpMethodName(1)).toBe("GET");
    expect(httpMethodName(2)).toBe("POST");
    expect(httpMethodName(0)).toBe("-");
  });
});
