// dashboardParams.test.js - cross-chart filter discovery for dashboards
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect } from "vitest";
import {
  discoverFilters,
  describeConflict,
  resolveValue,
  resolveValues,
  chartsAffectedBy,
  missingRequired,
  waitingMessage,
  labelFor,
  isHidden,
  orderFilters,
} from "../../src/frontend/utils/dashboardParams.js";

const chart = (id, name, sqlQuery) => ({ id, name, sqlQuery });

describe("discoverFilters", () => {
  it("creates a filter from a parameter in one chart", () => {
    const { filters } = discoverFilters([
      chart(1, "A", "SELECT * FROM t WHERE r = {region:String}"),
    ]);
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe("region");
    expect(filters[0].type).toBe("String");
  });

  it("merges the same name across two charts into one control", () => {
    const { filters } = discoverFilters([
      chart(1, "A", "SELECT * FROM a WHERE r = {region:String}"),
      chart(2, "B", "SELECT * FROM b WHERE r = {region:String}"),
    ]);
    expect(filters).toHaveLength(1);
    expect(filters[0].charts).toEqual([1, 2]);
  });

  it("returns no filters for a dashboard with no parameters", () => {
    const { filters, conflicts, errors } = discoverFilters([
      chart(1, "A", "SELECT 1"),
      chart(2, "B", "SELECT count() FROM t"),
    ]);
    expect(filters).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("handles an empty dashboard", () => {
    const { filters } = discoverFilters([]);
    expect(filters).toHaveLength(0);
  });

  it("tracks required per chart, not globally", () => {
    // region is required in A (bare) and optional in B (inside a block).
    const { filters } = discoverFilters([
      chart(1, "A", "SELECT * FROM a WHERE r = {region:String}"),
      chart(2, "B", "SELECT * FROM b WHERE 1 /*[ AND r = {region:String} ]*/"),
    ]);
    expect(filters[0].requiredBy).toEqual([1]);
    expect(filters[0].charts).toEqual([1, 2]);
  });

  it("marks a name required when it appears bare anywhere in one chart", () => {
    const { byChart } = discoverFilters([
      chart(1, "A", "SELECT {region:String} FROM a /*[ WHERE r={region:String} ]*/"),
    ]);
    expect(byChart.get(1)[0].required).toBe(true);
  });
});

describe("type conflicts", () => {
  it("reports a conflict naming both charts", () => {
    const { conflicts } = discoverFilters([
      chart(1, "Orders", "SELECT * FROM o WHERE r = {region:String}"),
      chart(2, "Revenue", "SELECT * FROM v WHERE r = {region:UInt8}"),
    ]);
    expect(conflicts).toHaveLength(1);
    const text = describeConflict(conflicts[0]);
    expect(text).toContain("region");
    expect(text).toContain("Orders");
    expect(text).toContain("Revenue");
    expect(text).toContain("String");
    expect(text).toContain("UInt8");
  });

  it("does not duplicate the same conflicting pair", () => {
    const { conflicts } = discoverFilters([
      chart(1, "A", "SELECT * FROM a WHERE r = {region:String}"),
      chart(2, "B", "SELECT {region:UInt8} AS x, {region:UInt8} AS y FROM b"),
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it("does not treat a matching type as a conflict", () => {
    const { conflicts } = discoverFilters([
      chart(1, "A", "SELECT * FROM a WHERE r = {region:String}"),
      chart(2, "B", "SELECT * FROM b WHERE r = {region:String}"),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("reports a chart whose own SQL is self-contradictory without failing the rest", () => {
    const { filters, errors } = discoverFilters([
      chart(1, "Good", "SELECT * FROM a WHERE r = {region:String}"),
      chart(2, "Broken", "SELECT {a:String} FROM t WHERE b = {a:UInt8}"),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].chartName).toBe("Broken");
    // The healthy chart still produces its filter.
    expect(filters.map((f) => f.name)).toEqual(["region"]);
  });
});

describe("chartsAffectedBy", () => {
  const { byChart } = discoverFilters([
    chart(1, "A", "SELECT * FROM a WHERE r = {region:String}"),
    chart(2, "B", "SELECT * FROM b WHERE e = {env:String}"),
    chart(3, "C", "SELECT * FROM c WHERE r = {region:String} AND e = {env:String}"),
    chart(4, "D", "SELECT * FROM d WHERE created > '2026-01-01'"),
  ]);

  it("returns only the charts naming the changed filter", () => {
    expect(chartsAffectedBy(["region"], byChart).sort()).toEqual([1, 3]);
  });

  it("ignores a chart that does not declare the parameter", () => {
    expect(chartsAffectedBy(["env"], byChart)).not.toContain(4);
  });

  it("handles several changed names at once", () => {
    expect(chartsAffectedBy(["region", "env"], byChart).sort()).toEqual([1, 2, 3]);
  });

  it("returns nothing for an unknown name", () => {
    expect(chartsAffectedBy(["nope"], byChart)).toEqual([]);
  });
});

describe("value precedence", () => {
  const args = {
    selected: { region: "selected" },
    dashboardDefaults: { region: { default: "dashboard" } },
    chartDefaults: { region: "chart" },
  };

  it("user selection wins over everything", () => {
    expect(resolveValue({ name: "region", ...args })).toBe("selected");
  });

  it("dashboard default beats chart default", () => {
    expect(
      resolveValue({ ...args, name: "region", selected: {} }),
    ).toBe("dashboard");
  });

  it("chart default is used when nothing else is set", () => {
    expect(
      resolveValue({
        name: "region",
        selected: {},
        dashboardDefaults: {},
        chartDefaults: { region: "chart" },
      }),
    ).toBe("chart");
  });

  it("falls back to empty", () => {
    expect(
      resolveValue({
        name: "region",
        selected: {},
        dashboardDefaults: {},
        chartDefaults: {},
      }),
    ).toBe("");
  });

  it("clearing a selection returns to the dashboard default, not the chart one", () => {
    expect(
      resolveValue({ ...args, name: "region", selected: { region: "" } }),
    ).toBe("dashboard");
  });

  it("treats 0 as a value rather than as absent", () => {
    expect(
      resolveValue({
        name: "n",
        selected: { n: 0 },
        dashboardDefaults: { n: { default: 5 } },
        chartDefaults: {},
      }),
    ).toBe("0");
  });

  it("resolves a whole filter list in one pass", () => {
    const filters = [{ name: "region" }, { name: "env" }];
    expect(
      resolveValues(filters, {
        selected: { region: "eu" },
        dashboardDefaults: { env: { default: "prod" } },
        chartDefaults: {},
      }),
    ).toEqual({ region: "eu", env: "prod" });
  });
});

describe("missingRequired and waitingMessage", () => {
  const { byChart } = discoverFilters([
    chart(1, "Strict", "SELECT * FROM a WHERE r = {region:String} AND n > {n:UInt8}"),
    chart(2, "Relaxed", "SELECT * FROM b WHERE 1 /*[ AND r = {region:String} ]*/"),
  ]);

  it("lists the unfilled required parameters", () => {
    expect(missingRequired(1, byChart, {}).sort()).toEqual(["n", "region"]);
  });

  it("returns nothing once they are filled", () => {
    expect(missingRequired(1, byChart, { region: "eu", n: 5 })).toEqual([]);
  });

  it("treats an empty string as missing, for every type alike", () => {
    // Deliberate: an empty required String would produce WHERE r = '' and
    // render an empty chart that looks identical to a working one.
    expect(missingRequired(1, byChart, { region: "", n: "" }).sort()).toEqual([
      "n",
      "region",
    ]);
  });

  it("never blocks a chart whose parameters are all optional", () => {
    expect(missingRequired(2, byChart, {})).toEqual([]);
  });

  it("names the filters in the waiting message", () => {
    const msg = waitingMessage(["region"]);
    expect(msg).toContain("'region'");
    expect(msg).toContain("Apply");
  });

  it("reads correctly for several filters", () => {
    expect(waitingMessage(["region", "n"])).toContain("'region' and 'n'");
    expect(waitingMessage(["a", "b", "c"])).toContain("'a', 'b' and 'c'");
  });

  it("is empty when nothing is missing", () => {
    expect(waitingMessage([])).toBe("");
  });
});

describe("presentation", () => {
  it("falls back to the parameter name when no label is configured", () => {
    expect(labelFor("region", {})).toBe("region");
    expect(labelFor("region", { region: { label: "Region" } })).toBe("Region");
    expect(labelFor("region", { region: { label: "   " } })).toBe("region");
  });

  it("reports hidden only when explicitly true", () => {
    expect(isHidden("region", {})).toBe(false);
    expect(isHidden("region", { region: {} })).toBe(false);
    expect(isHidden("region", { region: { hidden: true } })).toBe(true);
  });

  it("orders configured filters first, then alphabetically", () => {
    const filters = [{ name: "zulu" }, { name: "alpha" }, { name: "mike" }];
    expect(
      orderFilters(filters, { mike: { order: 1 }, zulu: { order: 2 } }).map(
        (f) => f.name,
      ),
    ).toEqual(["mike", "zulu", "alpha"]);
  });

  it("is stable with no configuration at all", () => {
    const filters = [{ name: "zulu" }, { name: "alpha" }];
    expect(orderFilters(filters, {}).map((f) => f.name)).toEqual([
      "alpha",
      "zulu",
    ]);
    expect(orderFilters(filters, undefined).map((f) => f.name)).toEqual([
      "alpha",
      "zulu",
    ]);
  });
});
