// Copyright (C) 2026 Quantrail™ Data Private Limited
// Arithmetic behind the Cluster Overview live section.
//
// The point of most of these is not that the sums are right, it is that a
// division with nothing to divide by produces a dash rather than NaN, Infinity
// or a plausible-looking zero. A monitoring page that cannot tell "nothing
// happened" from "no reading" is lying about one of them.

import { describe, it, expect } from "vitest";
import {
  NO_VALUE,
  ratio,
  difference,
  sumOf,
  toValues,
  toDescriptions,
  toCategoryRows,
  delta,
  detectRestart,
  elapsedSeconds,
  rate,
  rateOfSum,
  pairRatio,
  pairRatioOfSums,
  threadEquivalents,
  stamp,
} from "../../src/frontend/components/overview/overviewMath.js";

describe("ratio", () => {
  it("divides", () => {
    expect(ratio(1, 4)).toBe(0.25);
  });
  it("returns null rather than Infinity when the denominator is zero", () => {
    expect(ratio(5, 0)).toBe(NO_VALUE);
  });
  it("returns null rather than NaN when both are zero", () => {
    expect(ratio(0, 0)).toBe(NO_VALUE);
  });
  it("returns a genuine zero when the numerator is zero", () => {
    // Distinct from the case above. Zero queries is an answer; no denominator
    // is not, and the UI has to render them differently.
    expect(ratio(0, 10)).toBe(0);
  });
  it("returns null for undefined or missing inputs", () => {
    expect(ratio(undefined, 10)).toBe(NO_VALUE);
    expect(ratio(10, undefined)).toBe(NO_VALUE);
    expect(ratio(NaN, 10)).toBe(NO_VALUE);
  });
});

describe("difference and sumOf", () => {
  it("subtracts", () => {
    expect(difference(10, 4)).toBe(6);
  });
  it("returns null if either side is missing", () => {
    expect(difference(10, undefined)).toBe(NO_VALUE);
  });
  it("sums the requested keys", () => {
    expect(sumOf({ a: 1, b: 2, c: 3 }, ["a", "c"])).toBe(4);
  });
  it("returns null if any key is missing, rather than a partial sum", () => {
    expect(sumOf({ a: 1 }, ["a", "b"])).toBe(NO_VALUE);
  });
});

describe("toValues", () => {
  const rows = [
    { metric: "Query", value: "3" },
    { metric: "Merge", value: "0" },
    { metric: "Ignored", value: "99" },
  ];
  it("keeps only the curated keys", () => {
    expect(toValues(rows, "metric", ["Query", "Merge"])).toEqual({ Query: 3, Merge: 0 });
  });
  it("accepts a Set as well as an array", () => {
    expect(toValues(rows, "metric", new Set(["Query"]))).toEqual({ Query: 3 });
  });
  it("coerces strings to numbers and drops unparseable ones", () => {
    const bad = [{ metric: "Query", value: "not a number" }];
    expect(toValues(bad, "metric", ["Query"])).toEqual({});
  });
  it("survives a null rows array", () => {
    expect(toValues(null, "metric", ["Query"])).toEqual({});
  });
});

describe("toDescriptions and toCategoryRows", () => {
  it("indexes descriptions by name", () => {
    const rows = [{ metric: "Query", description: "executing queries" }];
    expect(toDescriptions(rows, "metric")).toEqual({ Query: "executing queries" });
  });
  it("builds chart rows, defaulting a missing metric to zero", () => {
    expect(toCategoryRows({ A: 5 }, [["Alpha", "A"], ["Beta", "B"]])).toEqual([
      { k: "Alpha", v: 5 },
      { k: "Beta", v: 0 },
    ]);
  });
});

describe("delta", () => {
  it("subtracts two counter readings", () => {
    expect(delta(100, 140)).toBe(40);
  });
  it("returns null when a counter went backwards, meaning a restart", () => {
    // The alternative is drawing a large negative spike, which looks like a
    // measurement rather than a restart.
    expect(delta(140, 5)).toBe(NO_VALUE);
  });
  it("returns null for missing readings", () => {
    expect(delta(undefined, 10)).toBe(NO_VALUE);
  });
});

describe("detectRestart", () => {
  it("is false when every counter moved forward", () => {
    expect(detectRestart({ a: 1, b: 2 }, { a: 2, b: 9 }, ["a", "b"])).toBe(false);
  });
  it("is true when any single counter went backwards", () => {
    expect(detectRestart({ a: 9, b: 2 }, { a: 1, b: 9 }, ["a", "b"])).toBe(true);
  });
  it("ignores keys absent from either sample", () => {
    expect(detectRestart({ a: 1 }, { a: 2 }, ["a", "missing"])).toBe(false);
  });
});

describe("rates over one interval", () => {
  const prev = { t: 1_000_000, values: { Query: 100, Bytes: 0 } };
  const curr = { t: 1_005_000, values: { Query: 150, Bytes: 500 } }; // five seconds later

  it("reports elapsed seconds", () => {
    expect(elapsedSeconds(prev, curr)).toBe(5);
  });
  it("returns null when the two samples share a timestamp", () => {
    expect(elapsedSeconds(prev, { ...curr, t: prev.t })).toBe(NO_VALUE);
  });
  it("computes a per-second rate", () => {
    expect(rate(prev, curr, "Query")).toBe(10);
  });
  it("treats a key absent from the previous sample as zero", () => {
    // system.events only lists non-zero events, so a key appearing mid-session
    // is a real first occurrence rather than a gap in the reading.
    expect(rate({ t: prev.t, values: {} }, curr, "Bytes")).toBe(100);
  });
  it("sums several counters into one rate", () => {
    expect(rateOfSum(prev, curr, ["Query", "Bytes"])).toBe(110);
  });
  it("returns null across a restart rather than a negative rate", () => {
    expect(rate(curr, prev, "Query")).toBe(NO_VALUE);
  });
});

describe("pair ratios", () => {
  const prev = { t: 0, values: { Rows: 100, Scanned: 1000, A: 1, B: 1 } };
  const curr = { t: 5000, values: { Rows: 110, Scanned: 1660, A: 3, B: 5 } };

  it("divides two counter deltas", () => {
    // 660 scanned for 10 returned
    expect(pairRatio(prev, curr, "Scanned", "Rows")).toBe(66);
  });
  it("returns null when the denominator did not move in this interval", () => {
    const flat = { t: 5000, values: { ...prev.values, Scanned: 1660 } };
    expect(pairRatio(prev, flat, "Scanned", "Rows")).toBe(NO_VALUE);
  });
  it("divides sums of counters", () => {
    // (3-1) + (5-1) = 6 over (3-1) = 2
    expect(pairRatioOfSums(prev, curr, ["A", "B"], ["A"])).toBe(3);
  });
  it("returns null when either sample is missing", () => {
    expect(pairRatio(null, curr, "Scanned", "Rows")).toBe(NO_VALUE);
  });
});

describe("threadEquivalents", () => {
  const prev = { t: 0, values: { Micros: 0, Millis: 0, Nanos: 0 } };
  const curr = {
    t: 1000, // one second
    values: { Micros: 2_000_000, Millis: 2_000, Nanos: 2_000_000_000 },
  };

  it("turns microseconds of thread time into a thread count", () => {
    // Two seconds of thread time in one second of wall clock is two threads.
    expect(threadEquivalents(prev, curr, ["Micros"])).toBe(2);
  });
  it("scales milliseconds correctly", () => {
    // MergeExecuteMilliseconds is in milliseconds, and getting this wrong makes
    // the answer a thousand times too small.
    expect(threadEquivalents(prev, curr, ["Millis"], 1000)).toBe(2);
  });
  it("scales nanoseconds correctly", () => {
    // LoggerElapsedNanoseconds is out the other way.
    expect(threadEquivalents(prev, curr, ["Nanos"], 0.001)).toBe(2);
  });
  it("sums several counters", () => {
    expect(threadEquivalents(prev, curr, ["Micros", "Micros"])).toBe(4);
  });
  it("returns null across a restart", () => {
    expect(threadEquivalents(curr, prev, ["Micros"])).toBe(NO_VALUE);
  });
});

describe("stamp", () => {
  it("attaches a timestamp so the counter helpers can measure an interval", () => {
    const s = stamp({ a: 1 });
    expect(s.values).toEqual({ a: 1 });
    expect(typeof s.t).toBe("number");
  });
});
