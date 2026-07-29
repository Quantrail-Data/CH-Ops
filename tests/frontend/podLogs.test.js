// podLogs.test.js - splitting, filtering and clamping for the pod log viewer
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathirdhasan, Praveen kumar

import { describe, it, expect } from "vitest";
import {
  splitLines,
  filterLines,
  sinceSecondsFrom,
  clampLines,
  LOG_LINES_MIN,
  LOG_LINES_MAX,
  LOG_LINES_DEFAULT,
} from "../../src/frontend/utils/podLogs.js";

// Two entries with a stack trace under the second. Every line carries the
// container runtime's timestamp, including trace continuations, which is why
// splitting happens on that and not on ClickHouse's own format.
const RAW = [
  "2026-07-29T10:15:30.100Z 2026.07.29 10:15:30 [ 1 ] {} <Debug> Application: ready",
  "2026-07-29T10:15:31.100Z 2026.07.29 10:15:31 [ 2 ] {} <Error> executeQuery: Code: 62",
  "2026-07-29T10:15:31.200Z 0. DB::Exception::Exception",
  "2026-07-29T10:15:31.300Z 1. DB::parseQueryAndMovePosition",
  "2026-07-29T10:15:40.100Z 2026.07.29 10:15:40 [ 3 ] {} <Debug> Application: done",
  "",
].join("\n");

describe("splitLines", () => {
  it("separates the runtime timestamp from the text", () => {
    const lines = splitLines(RAW);

    expect(lines).toHaveLength(5);
    expect(lines[0].ts).toBe("2026-07-29T10:15:30.100Z");
    expect(lines[0].text).toContain("Application: ready");
    expect(lines[0].text).not.toContain("2026-07-29T10:15:30.100Z");
  });

  it("gives every line an index for context lookups", () => {
    expect(splitLines(RAW).map((l) => l.i)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps a line that carries no timestamp", () => {
    const lines = splitLines("no timestamp here\n");

    expect(lines).toHaveLength(1);
    expect(lines[0].ts).toBeNull();
    expect(lines[0].text).toBe("no timestamp here");
  });

  // limitBytes truncates mid-stream. Half a line shown as though it were whole
  // is worse than losing it.
  it("drops a trailing partial line", () => {
    const lines = splitLines("2026-07-29T10:00:00Z complete\n2026-07-29T10:00:01Z half");

    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("complete");
  });

  it("keeps a single line that has no trailing newline", () => {
    expect(splitLines("2026-07-29T10:00:00Z only line")).toHaveLength(1);
  });

  it("returns nothing for an empty body", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines(null)).toEqual([]);
  });

  it("skips blank lines", () => {
    expect(splitLines("2026-07-29T10:00:00Z a\n\n2026-07-29T10:00:01Z b\n")).toHaveLength(2);
  });
});

describe("filterLines", () => {
  const lines = splitLines(RAW);

  it("returns everything when the query is empty", () => {
    const r = filterLines(lines, "");

    expect(r.lines).toHaveLength(5);
    expect(r.matched).toBe(5);
    expect(r.total).toBe(5);
  });

  // ClickHouse writes <Error>, so a case-sensitive search for "error" would
  // match nothing and undermine the whole point of the filter.
  it("matches case-insensitively", () => {
    expect(filterLines(lines, "ERROR").matched).toBe(1);
    expect(filterLines(lines, "error").matched).toBe(1);
    expect(filterLines(lines, "eRrOr").matched).toBe(1);
  });

  it("reports matched against total so the count cannot mislead", () => {
    const r = filterLines(lines, "Debug");

    expect(r.matched).toBe(2);
    expect(r.total).toBe(5);
  });

  it("returns no lines when nothing matches", () => {
    const r = filterLines(lines, "nothing-like-this");

    expect(r.lines).toEqual([]);
    expect(r.matched).toBe(0);
    expect(r.total).toBe(5);
  });

  it("shows only the matching line with no context", () => {
    const r = filterLines(lines, "Code: 62", 0);

    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].hit).toBe(true);
  });

  // The reason context exists: an exception header matches, the trace under it
  // does not, and the trace is the part you needed.
  it("keeps the stack trace under a matched error", () => {
    const r = filterLines(lines, "Code: 62", 2);
    const text = r.lines.filter((l) => !l.gap).map((l) => l.text);

    expect(text.some((t) => t.includes("DB::Exception::Exception"))).toBe(true);
    expect(text.some((t) => t.includes("DB::parseQueryAndMovePosition"))).toBe(true);
  });

  it("marks which lines matched and which are context", () => {
    const r = filterLines(lines, "Code: 62", 1);
    const hits = r.lines.filter((l) => l.hit);

    expect(hits).toHaveLength(1);
    expect(r.lines.filter((l) => !l.gap && !l.hit).length).toBeGreaterThan(0);
  });

  it("separates non-adjacent context blocks with a gap marker", () => {
    // Two Debug lines at indexes 0 and 4, so one context line each leaves a
    // hole in the middle.
    const r = filterLines(lines, "Debug", 1);

    expect(r.lines.some((l) => l.gap)).toBe(true);
  });

  it("does not insert a gap when the blocks touch", () => {
    const r = filterLines(lines, "Debug", 3);

    expect(r.lines.some((l) => l.gap)).toBe(false);
  });

  it("does not run off either end of the log", () => {
    const r = filterLines(lines, "ready", 10);

    expect(r.lines.filter((l) => !l.gap)).toHaveLength(5);
  });
});

describe("sinceSecondsFrom", () => {
  it("converts an absolute time into a duration", () => {
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString().slice(0, 16);
    const seconds = sinceSecondsFrom(tenMinutesAgo);

    expect(seconds).toBeGreaterThan(590);
    expect(seconds).toBeLessThan(660);
  });

  it("returns undefined for an empty value", () => {
    expect(sinceSecondsFrom("")).toBeUndefined();
    expect(sinceSecondsFrom(null)).toBeUndefined();
  });

  it("returns undefined for an unparseable value", () => {
    expect(sinceSecondsFrom("not a date")).toBeUndefined();
  });

  // A future time would otherwise produce a negative window, which the API
  // rejects.
  it("returns undefined for a time in the future", () => {
    const later = new Date(Date.now() + 600_000).toISOString().slice(0, 16);

    expect(sinceSecondsFrom(later)).toBeUndefined();
  });
});

describe("clampLines", () => {
  it("holds the value between the bounds", () => {
    expect(clampLines(50)).toBe(LOG_LINES_MIN);
    expect(clampLines(999999)).toBe(LOG_LINES_MAX);
    expect(clampLines(2000)).toBe(2000);
  });

  it("falls back to the default for nonsense", () => {
    expect(clampLines("abc")).toBe(LOG_LINES_DEFAULT);
    expect(clampLines(null)).toBe(LOG_LINES_DEFAULT);
    expect(clampLines(undefined)).toBe(LOG_LINES_DEFAULT);
  });

  // Clearing the field should return to where the user started, not drop to
  // the minimum, which is what Number("") being 0 would otherwise do.
  it("falls back to the default for an empty field", () => {
    expect(clampLines("")).toBe(LOG_LINES_DEFAULT);
    expect(clampLines("  ")).toBe(LOG_LINES_DEFAULT);
  });

  it("rounds a fractional value", () => {
    expect(clampLines(1500.7)).toBe(1501);
  });
});
