// analyzeOutput.test.js - reading the numbers out of EXPLAIN ANALYZE output
// Contributors - Kathirmoorthy, Kathirdhasan, Praveen
// Copyright (C) 2026 Quantrail Data pvt Ltd

import { describe, it, expect } from "vitest";
import {
  parseAnalyzeSummary,
  parseAnalyzeLines,
  parseTimeSplit,
  stripAnalyzeSummary,
  SLOW_SHARE_PERCENT,
} from "../../src/frontend/utils/analyzeOutput.js";

// Real output, from the ClickHouse documentation.
const BALANCED = `Query summary:
  Time:        10.72 ms (planning 6.45 ms · execution 4.26 ms)
  Read:        1.00 million rows, 8.00 MB (234.49 million rows/s., 1.88 GB/s.)
  Peak memory: 28.98 KiB

Output: number MOD 10, count()

Expression ((Project names + Projection))
│  I/O: rows 10 → 10 · 90 B → 90 B
│    time 21.82 us (0.5%) · parallelism 0.98/1
└──Aggregating
   │  I/O: rows 1.00 million → 10 (0.00%) · 1.00 MB → 90 B
   │    Stage (partial aggregation): time 868.45 us (20.4%) · parallelism 3.80/15
   └──ReadFromSystemNumbers
            time 993.94 us (23.3%) · parallelism 7.52/15`;

// The same shape, but with one step that takes most of the time.
const SKEWED = `Query summary:
  Time:        4.20 s (planning 6.45 ms · execution 4.19 s)
  Read:        90.00 million rows, 720.00 MB
  Peak memory: 1.20 GiB

Expression ((Project names + Projection))
│    time 21.82 us (0.1%) · parallelism 0.98/1
└──Aggregating
   │    Stage (partial aggregation): time 3.51 s (83.6%) · parallelism 1.02/15
   └──ReadFromMergeTree
            time 412.94 ms (9.8%) · parallelism 7.52/15`;

describe("the summary at the top", () => {
  it("reads all three numbers", () => {
    const s = parseAnalyzeSummary(BALANCED);
    expect(s.time).toBe("10.72 ms (planning 6.45 ms · execution 4.26 ms)");
    expect(s.read).toContain("1.00 million rows");
    expect(s.peak).toBe("28.98 KiB");
  });

  it("gives null for output that is not EXPLAIN ANALYZE", () => {
    // Every other EXPLAIN type goes through the same code. None of them must
    // get a panel.
    expect(parseAnalyzeSummary("Expression\n└──Aggregating")).toBeNull();
    expect(parseAnalyzeSummary("digraph {\n  a -> b\n}")).toBeNull();
  });

  it("gives null for something that is not text", () => {
    expect(parseAnalyzeSummary(null)).toBeNull();
    expect(parseAnalyzeSummary(42)).toBeNull();
  });

  it("gives null for a header with none of the three lines", () => {
    // Better no panel than an empty one.
    expect(parseAnalyzeSummary("Query summary:\n  Something else: 1")).toBeNull();
  });
});

describe("the planning and execution split", () => {
  it("splits the time into two parts", () => {
    const s = parseTimeSplit("10.72 ms (planning 6.45 ms · execution 4.26 ms)");
    // This query took longer to plan than to run. That is the thing the bar
    // makes visible.
    expect(Math.round(s.planningPct)).toBe(60);
    expect(Math.round(s.executionPct)).toBe(40);
  });

  it("handles a different unit on each side", () => {
    // 6.45 ms against 4.19 s. Comparing the numbers without the units would
    // give the wrong answer by a factor of a thousand.
    const s = parseTimeSplit("4.20 s (planning 6.45 ms · execution 4.19 s)");
    expect(Math.round(s.executionPct)).toBe(100);
  });

  it("gives null when the line has no split", () => {
    expect(parseTimeSplit("28.98 KiB")).toBeNull();
    expect(parseTimeSplit(null)).toBeNull();
  });

  it("is attached to the summary", () => {
    expect(parseAnalyzeSummary(BALANCED).split.planningLabel).toBe("6.45 ms");
  });
});

describe("the share of each step", () => {
  it("is read from every timed line", () => {
    const widths = parseAnalyzeLines(BALANCED)
      .filter((l) => l.share !== null)
      .map((l) => l.barWidth);
    expect(widths).toEqual([0.5, 20.4, 23.3]);
  });

  it("is zero for a line with no time", () => {
    expect(parseAnalyzeLines("└──Aggregating")[0].barWidth).toBe(0);
  });

  it("is capped at 100", () => {
    // Shares can be over 100 percent, because steps run at the same time.
    expect(parseAnalyzeLines("time 1 s (140.0%)")[0].barWidth).toBe(100);
  });
});

describe("removing the header from the tree", () => {
  it("removes the four header lines", () => {
    // Four lines, and the blank line after them.
    const before = BALANCED.split("\n").length;
    const after = stripAnalyzeSummary(BALANCED).split("\n").length;
    expect(before - after).toBe(5);
  });

  it("keeps the line that names the output columns", () => {
    // "Output: ..." is not in the cards, so it must stay.
    const out = stripAnalyzeSummary(BALANCED);
    expect(out.startsWith("Output: number MOD 10, count()")).toBe(true);
  });

  it("keeps the plan tree", () => {
    const out = stripAnalyzeSummary(BALANCED);
    expect(out).toContain("Expression ((Project names + Projection))");
    expect(out).toContain("└──Aggregating");
  });

  it("leaves other EXPLAIN output alone", () => {
    // Every EXPLAIN type goes through this. Only ANALYZE has a header.
    const plan = "Expression ((Project names))\n└──ReadFromMergeTree";
    expect(stripAnalyzeSummary(plan)).toBe(plan);
    const dot = "digraph {\n  a -> b\n}";
    expect(stripAnalyzeSummary(dot)).toBe(dot);
  });

  it("leaves something that is not text alone", () => {
    expect(stripAnalyzeSummary(null)).toBeNull();
    expect(stripAnalyzeSummary(42)).toBe(42);
  });

  it("keeps a header that has no blank line after it", () => {
    // Better to show the header than to show nothing at all.
    const only = "Query summary:\n  Time: 1 ms";
    expect(stripAnalyzeSummary(only)).toBe(only);
  });

  it("does not change what the summary reads", () => {
    // The component gives the full text to parseAnalyzeSummary and the
    // stripped text to parseAnalyzeLines. This is the first half.
    const s = parseAnalyzeSummary(BALANCED);
    expect(s.peak).toBe("28.98 KiB");
    expect(s.split.planningLabel).toBe("6.45 ms");
  });

  it("gives no summary once the header is removed", () => {
    // The mistake to catch: giving the stripped text to both. The bar and the
    // cards would disappear, and the reason would not be obvious.
    expect(parseAnalyzeSummary(stripAnalyzeSummary(BALANCED))).toBeNull();
  });

  it("still finds every timed line in the stripped text", () => {
    // The header carries no time, so removing it must not change this count.
    const full = parseAnalyzeLines(BALANCED).filter((l) => l.share !== null);
    const stripped = parseAnalyzeLines(stripAnalyzeSummary(BALANCED))
      .filter((l) => l.share !== null);
    expect(stripped.length).toBe(full.length);
    expect(stripped.map((l) => l.share)).toEqual([0.5, 20.4, 23.3]);
  });
});

describe("finding the slow steps", () => {
  it("marks nothing when the work is spread evenly", () => {
    const slow = parseAnalyzeLines(BALANCED).filter((l) => l.slow);
    // The largest share here is 23.3 percent. Marking a step in a query with no
    // slow step would send the reader to the wrong place.
    expect(slow.length).toBe(0);
  });

  it("marks the step that takes most of the time", () => {
    const slow = parseAnalyzeLines(SKEWED).filter((l) => l.slow);
    expect(slow.length).toBe(1);
    expect(slow[0].share).toBe(83.6);
    expect(slow[0].line).toContain("partial aggregation");
  });

  it("reads the share from every timed line", () => {
    const shares = parseAnalyzeLines(BALANCED)
      .filter((l) => l.share !== null)
      .map((l) => l.share);
    expect(shares).toEqual([0.5, 20.4, 23.3]);
  });

  it("does not read the selectivity percentage as a time", () => {
    // "rows 1.00 million -> 10 (0.00%)" says how much the step filtered. It is
    // not a time, and a step that removes most of the rows is working well.
    const line = "   │  I/O: rows 1.00 million → 10 (0.00%) · 1.00 MB → 90 B";
    expect(parseAnalyzeLines(line)[0].share).toBeNull();
  });

  it("keeps every line, including the ones with no time", () => {
    // The tree is drawn line by line, so a lost line breaks the drawing.
    const lines = parseAnalyzeLines(BALANCED);
    expect(lines.length).toBe(BALANCED.split("\n").length);
  });

  it("uses the level given, when one is given", () => {
    const slow = parseAnalyzeLines(BALANCED, 20).filter((l) => l.slow);
    expect(slow.length).toBe(2);
  });

  it("has a level that is a number", () => {
    expect(typeof SLOW_SHARE_PERCENT).toBe("number");
  });
});
