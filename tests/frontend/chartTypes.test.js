// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> kathir Moorthy
// Suite validating chart registries, column types, SQL string/graph transformations, and auto-layout algorithms.

import { describe, it, expect } from "vitest";
import {
  CHART_TYPES,
  buildChartOption,
  validateColumnType,
  getAxisDefaults,
  needsLegend,
} from "../../src/frontend/components/dashboards/chartTypes.js";

describe("Chart Type Registry", () => {
  it("has 15 top-level chart types", () => {
    expect(CHART_TYPES.length).toBe(15);
  });
  it("every type has at least one subtype", () => {
    CHART_TYPES.forEach((t) =>
      expect(t.subtypes.length).toBeGreaterThanOrEqual(1),
    );
  });
  it("every subtype has a unique key except one value ", () => {
    const k = CHART_TYPES.flatMap((t) => t.subtypes.map((s) => s.subtype));
    expect(new Set(k).size).toBe(k.length - 1);
  });
  it("total subtypes is 26", () => {
    expect(CHART_TYPES.reduce((s, t) => s + t.subtypes.length, 0)).toBe(26);
  });
  it("every field has expect type", () => {
    CHART_TYPES.flatMap((t) => t.subtypes.flatMap((s) => s.fields)).forEach(
      (f) => expect(["any", "numeric", "string", "date"]).toContain(f.expect),
    );
  });
  it("contains sunburst chart type with both subtypes", () => {
    const sunburst = CHART_TYPES.find((t) => t.type === "sunburst");
    expect(sunburst).toBeDefined();
    expect(sunburst.subtypes.map((s) => s.subtype)).toEqual(
      expect.arrayContaining(["simple_sunburst", "sunburst_visualmap"]),
    );
  });
});

describe("validateColumnType", () => {
  it("returns null for numeric columns mapped to numeric", () => {
    expect(
      validateColumnType([{ v: 10 }, { v: 20 }], "v", "numeric"),
    ).toBeNull();
  });
  it("returns error for string columns mapped to numeric", () => {
    const err = validateColumnType(
      [{ v: "abc" }, { v: "def" }],
      "v",
      "numeric",
    );
    expect(err).toContain("non-numeric");
  });
  it("returns null for any type", () => {
    expect(validateColumnType([{ v: "abc" }], "v", "any")).toBeNull();
  });
  it("returns null for empty data", () => {
    expect(validateColumnType([], "v", "numeric")).toBeNull();
  });
  it("returns null for missing column name", () => {
    expect(validateColumnType([{ v: 1 }], "", "numeric")).toBeNull();
  });
  it("returns null for string expectation with string sample", () => {
    expect(validateColumnType([{ v: "abc" }], "v", "string")).toBeNull();
  });
});

describe("getAxisDefaults", () => {
  it("returns Category/Value for bar", () => {
    expect(getAxisDefaults("bar", "simple_bar")).toEqual({
      xLabel: "Category",
      yLabel: "Value",
    });
  });
  it("returns Value/Category for horizontal bar", () => {
    expect(getAxisDefaults("bar", "horizontal_bar")).toEqual({
      xLabel: "Value",
      yLabel: "Category",
    });
  });
  it("returns Time/Value for line", () => {
    expect(getAxisDefaults("line", "simple_line")).toEqual({
      xLabel: "Time",
      yLabel: "Value",
    });
  });
  it("returns empty for pie", () => {
    expect(getAxisDefaults("pie", "pie")).toEqual({ xLabel: "", yLabel: "" });
  });
  it("returns empty for sunburst", () => {
    expect(getAxisDefaults("sunburst", "simple_sunburst")).toEqual({
      xLabel: "",
      yLabel: "",
    });
  });
});

describe("needsLegend", () => {
  it("true for grouped bar", () => {
    expect(needsLegend("bar", "grouped_bar")).toBe(true);
  });
  it("false for simple bar", () => {
    expect(needsLegend("bar", "simple_bar")).toBe(false);
  });
  it("true for pie (type-level)", () => {
    expect(needsLegend("pie", "pie")).toBe(true);
  });
  it("true for multi line", () => {
    expect(needsLegend("line", "multi_line")).toBe(true);
  });
  it("false for unknown type", () => {
    expect(needsLegend("unknown", "missing")).toBe(false);
  });
});

describe("buildChartOption - bar", () => {
  const data = [
    { cat: "A", val: 10 },
    { cat: "B", val: 20 },
  ];
  it("simple bar", () => {
    const o = buildChartOption("bar", "simple_bar", data, {
      category: "cat",
      value: "val",
    });
    expect(o.series[0].type).toBe("bar");
    expect(o.series[0].data).toEqual([10, 20]);
  });
  it("horizontal bar", () => {
    const o = buildChartOption("bar", "horizontal_bar", data, {
      category: "cat",
      value: "val",
    });
    expect(o.yAxis.type).toBe("category");
  });
  it("includes toolbox", () => {
    const o = buildChartOption("bar", "simple_bar", data, {
      category: "cat",
      value: "val",
    });
    expect(o.toolbox).toBeDefined();
    expect(o.toolbox.feature.saveAsImage).toBeDefined();
  });
  it("includes inside dataZoom for zoomable charts", () => {
    const o = buildChartOption("bar", "simple_bar", data, {
      category: "cat",
      value: "val",
    });
    expect(Array.isArray(o.dataZoom)).toBe(true);
    expect(o.dataZoom.some((z) => z.type === "inside")).toBe(true);
  });
});

describe("buildChartOption - line", () => {
  it("area line has areaStyle", () => {
    const o = buildChartOption("line", "area_line", [{ t: "1", v: 5 }], {
      time: "t",
      value: "v",
    });
    expect(o.series[0].areaStyle).toBeDefined();
  });
  it("passes axis labels", () => {
    const o = buildChartOption(
      "line",
      "simple_line",
      [{ t: "1", v: 5 }],
      { time: "t", value: "v" },
      "",
      { xLabel: "Time", yLabel: "QPS" },
    );
    expect(o.xAxis.name).toBe("Time");
    expect(o.yAxis.name).toBe("QPS");
  });
  it("multi line builds one series per group", () => {
    const o = buildChartOption(
      "line",
      "multi_line",
      [
        { t: "1", s: "A", v: 5 },
        { t: "1", s: "B", v: 7 },
        { t: "2", s: "A", v: 6 },
      ],
      { time: "t", series: "s", value: "v" },
    );
    expect(o.series.length).toBe(2);
    expect(o.legend.show).toBe(true);
  });
});

describe("buildChartOption - pie", () => {
  it("donut inner radius", () => {
    const o = buildChartOption("pie", "donut", [{ c: "X", v: 30 }], {
      category: "c",
      value: "v",
    });
    expect(o.series[0].radius).toEqual(["40%", "70%"]);
  });
  it("legend can be disabled", () => {
    const o = buildChartOption(
      "pie",
      "pie",
      [{ c: "X", v: 30 }],
      { category: "c", value: "v" },
      "",
      { showLegend: false },
    );
    expect(o.legend.show).toBe(false);
  });
  it("rose chart enables roseType area", () => {
    const o = buildChartOption("pie", "rose", [{ c: "X", v: 30 }], {
      category: "c",
      value: "v",
    });
    expect(o.series[0].roseType).toBe("area");
  });
});

describe("buildChartOption - scatter", () => {
  it("basic scatter builds scatter series", () => {
    const o = buildChartOption(
      "scatter",
      "basic_scatter",
      [{ x1: 2, y1: 3 }],
      { x: "x1", y: "y1" },
    );
    expect(o.series[0].type).toBe("scatter");
    expect(o.series[0].data[0]).toEqual([2, 3]);
  });

  it("bubble scatter groups by category", () => {
    const o = buildChartOption(
      "scatter",
      "bubble",
      [
        { x1: 2, y1: 3, size1: 10, cat: "A" },
        { x1: 4, y1: 5, size1: 20, cat: "B" },
      ],
      { x: "x1", y: "y1", size: "size1", category: "cat" },
    );
    expect(o.series.length).toBe(2);
    expect(o.legend.show).toBe(true);
  });
});

describe("buildChartOption - special", () => {
  it("gauge", () => {
    const o = buildChartOption("gauge", "single", [{ v: 75 }], {
      value: "v",
      min_val: "0",
      max_val: "100",
    });
    expect(o.series[0].data[0].value).toBe(75);
  });
  it("funnel", () => {
    const o = buildChartOption("funnel", "standard", [{ s: "A", v: 100 }], {
      stage: "s",
      value: "v",
    });
    expect(o.series[0].type).toBe("funnel");
  });
  it("KPI", () => {
    const o = buildChartOption("kpi", "single_kpi", [{ l: "QPS", v: "1234" }], {
      label: "l",
      value: "v",
    });
    expect(o._kpi).toBe(true);
  });
  it("table", () => {
    const o = buildChartOption("table", "data_table", [{ a: 1 }], {});
    expect(o._table).toBe(true);
  });
  it("sankey nodes", () => {
    const o = buildChartOption("sankey", "flow", [{ s: "A", t: "B", v: 10 }], {
      source: "s",
      target: "t",
      value: "v",
    });
    expect(o.series[0].data.length).toBe(2);
  });
  it("boxplot simple", () => {
    const o = buildChartOption(
      "boxplot",
      "simple_box",
      [
        { c: "A", v: 10 },
        { c: "A", v: 20 },
        { c: "A", v: 30 },
        { c: "B", v: 5 },
        { c: "B", v: 15 },
        { c: "B", v: 25 },
      ],
      { category: "c", value: "v" },
    );
    expect(o.series[0].type).toBe("boxplot");
    expect(o.series[0].data.length).toBe(2);
  });
  it("boxplot multi", () => {
    const o = buildChartOption(
      "boxplot",
      "multi_box",
      [
        { c: "A", g: "G1", v: 10 },
        { c: "A", g: "G1", v: 20 },
        { c: "A", g: "G2", v: 30 },
        { c: "B", g: "G1", v: 5 },
        { c: "B", g: "G2", v: 15 },
      ],
      { category: "c", group: "g", value: "v" },
    );
    expect(o.series.length).toBeGreaterThanOrEqual(1);
    expect(o.series[0].type).toBe("boxplot");
  });
  it("sunburst simple", () => {
    const o = buildChartOption(
      "sunburst",
      "simple_sunburst",
      [
        { name: "rootA", parent: "", value: 100 },
        { name: "childA1", parent: "rootA", value: 60 },
      ],
      { name: "name", parent: "parent", value: "value" },
    );
    expect(o).toBeDefined();
    expect(o._error).not.toBe(true);
    expect(o.series[0].type).toBe("sunburst");
    expect(Array.isArray(o.series[0].data)).toBe(true);
  });
  it("sunburst visualmap", () => {
    const o = buildChartOption(
      "sunburst",
      "sunburst_visualmap",
      [
        { name: "rootA", parent: "", value: 100 },
        { name: "childA1", parent: "rootA", value: 60 },
      ],
      { name: "name", parent: "parent", value: "value" },
    );
    expect(o).toBeDefined();
    expect(o._error).not.toBe(true);
    expect(o.series[0].type).toBe("sunburst");
    expect(o.visualMap).toBeDefined();
  });
  it("sunburst visualmap computes min/max range", () => {
    const o = buildChartOption(
      "sunburst",
      "sunburst_visualmap",
      [
        { name: "rootA", parent: "", value: 100 },
        { name: "childA1", parent: "rootA", value: 60 },
        { name: "childA2", parent: "rootA", value: 20 },
      ],
      { name: "name", parent: "parent", value: "value" },
    );
    expect(o.visualMap.min).toBeLessThanOrEqual(o.visualMap.max);
  });
  it("treemap builds treemap series", () => {
    const o = buildChartOption(
      "treemap",
      "hierarchical",
      [
        { name: "rootA", parent: "", value: 100 },
        { name: "childA1", parent: "rootA", value: 60 },
      ],
      { name: "name", parent: "parent", value: "value" },
    );
    expect(o.series[0].type).toBe("treemap");
  });
  it("heatmap includes visualMap", () => {
    const o = buildChartOption(
      "heatmap",
      "matrix",
      [
        { x: "A", y: "P1", value: 5 },
        { x: "B", y: "P1", value: 8 },
      ],
      { x: "x", y: "y", value: "value" },
    );
    expect(o.visualMap).toBeDefined();
    expect(o.series[0].type).toBe("heatmap");
  });
  it("candlestick builds OHLC series", () => {
    const o = buildChartOption(
      "candlestick",
      "financial",
      [{ d: "2026-01-01", o: 10, c: 12, l: 8, h: 15 }],
      { date: "d", open: "o", close: "c", low: "l", high: "h" },
    );
    expect(o.series[0].type).toBe("candlestick");
    expect(o.series[0].data[0]).toEqual([10, 12, 8, 15]);
  });
  it("null data", () => {
    expect(buildChartOption("bar", "simple_bar", null, {})).toBeNull();
  });
  it("empty data", () => {
    expect(buildChartOption("bar", "simple_bar", [], {})).toBeNull();
  });
});

describe("Auto-grid position calculation", () => {
  function nextPosition(existing, cols) {
    const occupied = new Set(existing.map((c) => `${c.gridRow}-${c.gridCol}`));
    let row = 0,
      col = 0;
    while (occupied.has(`${row}-${col}`)) {
      col++;
      if (col >= cols) {
        col = 0;
        row++;
      }
    }
    return { row, col };
  }

  it("places first chart at 0,0", () => {
    expect(nextPosition([], 2)).toEqual({ row: 0, col: 0 });
  });

  it("places second chart at 0,1 in 2-col grid", () => {
    expect(nextPosition([{ gridRow: 0, gridCol: 0 }], 2)).toEqual({
      row: 0,
      col: 1,
    });
  });

  it("wraps to next row", () => {
    expect(
      nextPosition(
        [
          { gridRow: 0, gridCol: 0 },
          { gridRow: 0, gridCol: 1 },
        ],
        2,
      ),
    ).toEqual({ row: 1, col: 0 });
  });

  it("fills gaps", () => {
    expect(
      nextPosition(
        [
          { gridRow: 0, gridCol: 0 },
          { gridRow: 1, gridCol: 0 },
        ],
        2,
      ),
    ).toEqual({ row: 0, col: 1 });
  });

  it("works with 3-col grid", () => {
    const existing = [
      { gridRow: 0, gridCol: 0 },
      { gridRow: 0, gridCol: 1 },
      { gridRow: 0, gridCol: 2 },
    ];
    expect(nextPosition(existing, 3)).toEqual({ row: 1, col: 0 });
  });

  it("skips multiple filled rows", () => {
    const existing = [
      { gridRow: 0, gridCol: 0 },
      { gridRow: 0, gridCol: 1 },
      { gridRow: 1, gridCol: 0 },
      { gridRow: 1, gridCol: 1 },
    ];
    expect(nextPosition(existing, 2)).toEqual({ row: 2, col: 0 });
  });
});

describe("CREATE USER clause ordering", () => {
  function buildCreateUser(f) {
    const p = ["CREATE USER IF NOT EXISTS", f.name];
    if (f.password) p.push(`IDENTIFIED WITH sha256_password BY '***'`);
    if (f.validUntil) p.push(`VALID UNTIL '${f.validUntil}'`);
    if (f.defaultDb) p.push(`DEFAULT DATABASE ${f.defaultDb}`);
    if (f.defaultRole) p.push(`DEFAULT ROLE ${f.defaultRole}`);
    return p.join(" ");
  }

  it("VALID UNTIL comes before DEFAULT DATABASE", () => {
    const sql = buildCreateUser({
      name: "bob",
      password: "x",
      validUntil: "2026-12-31 23:59:00",
      defaultDb: "test",
    });
    expect(sql.indexOf("VALID UNTIL")).toBeLessThan(
      sql.indexOf("DEFAULT DATABASE"),
    );
  });

  it("VALID UNTIL comes before DEFAULT ROLE", () => {
    const sql = buildCreateUser({
      name: "bob",
      password: "x",
      validUntil: "2026-12-31 23:59:00",
      defaultRole: "admin",
    });
    expect(sql.indexOf("VALID UNTIL")).toBeLessThan(
      sql.indexOf("DEFAULT ROLE"),
    );
  });

  it("works without VALID UNTIL", () => {
    const sql = buildCreateUser({
      name: "bob",
      password: "x",
      defaultDb: "test",
    });
    expect(sql).toContain("DEFAULT DATABASE test");
    expect(sql).not.toContain("VALID UNTIL");
  });

  it("includes default role when provided", () => {
    const sql = buildCreateUser({
      name: "bob",
      password: "x",
      defaultRole: "admin",
    });
    expect(sql).toContain("DEFAULT ROLE admin");
  });
});

describe("Projection DISTINCT stripping", () => {
  function stripDistinct(expr) {
    if (expr.toUpperCase().startsWith("DISTINCT "))
      return expr.substring(9).trim();
    return expr;
  }

  it("strips DISTINCT from start", () => {
    expect(stripDistinct("DISTINCT price")).toBe("price");
  });
  it("strips DISTINCT case-insensitive", () => {
    expect(stripDistinct("distinct col1, col2")).toBe("col1, col2");
  });
  it("does not strip DISTINCT in middle", () => {
    expect(stripDistinct("count(DISTINCT x)")).toBe("count(DISTINCT x)");
  });
  it("leaves non-DISTINCT expr alone", () => {
    expect(stripDistinct("col1, sum(col2)")).toBe("col1, sum(col2)");
  });
  it("trims after stripping", () => {
    expect(stripDistinct("DISTINCT    price   ")).toBe("price");
  });
});

describe("DOT graph parser", () => {
  function parseDotGraph(dotText) {
    const nodes = new Map();
    const links = [];
    for (const line of dotText.split("\n")) {
      const nm = line.match(/^\s*"?(\w+)"?\s*\[.*?label\s*=\s*"([^"]*)".*?\]/);
      if (nm) {
        nodes.set(nm[1], { id: nm[1], name: nm[2] });
        continue;
      }
      const em = line.match(/^\s*"?(\w+)"?\s*->\s*"?(\w+)"?/);
      if (em) {
        if (!nodes.has(em[1])) nodes.set(em[1], { id: em[1], name: em[1] });
        if (!nodes.has(em[2])) nodes.set(em[2], { id: em[2], name: em[2] });
        links.push({ source: em[1], target: em[2] });
      }
    }
    return { nodes: [...nodes.values()], links };
  }

  it("parses nodes with labels", () => {
    const g = parseDotGraph('digraph {\n  n1 [label = "ReadFromMergeTree"]\n}');
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].name).toBe("ReadFromMergeTree");
  });

  it("parses edges", () => {
    const g = parseDotGraph("digraph {\n  n1 -> n2\n}");
    expect(g.links).toHaveLength(1);
    expect(g.links[0].source).toBe("n1");
  });

  it("auto-creates nodes from edges", () => {
    const g = parseDotGraph("n1 -> n2\nn2 -> n3");
    expect(g.nodes).toHaveLength(3);
  });

  it("handles quoted identifiers", () => {
    const g = parseDotGraph('"n1" [label = "Filter"]\n"n1" -> "n2"');
    expect(g.nodes[0].name).toBe("Filter");
    expect(g.links).toHaveLength(1);
  });

  it("returns empty for non-DOT text", () => {
    const g = parseDotGraph("just some random text");
    expect(g.nodes).toHaveLength(0);
    expect(g.links).toHaveLength(0);
  });

  it("keeps explicit node labels when edges also exist", () => {
    const g = parseDotGraph('n1 [label = "Scan"]\nn1 -> n2');
    expect(g.nodes.find((n) => n.id === "n1").name).toBe("Scan");
  });
});
