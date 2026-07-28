// dashboardParams.js - discovering a dashboard's filters from its charts.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { findParameters, hasValue, isNumeric, isTemporal }
  from "../../shared/sqlParams.js";

// Discover parameters for every chart, then merge by name.
//
// charts: [{ id, name, sqlQuery }]
// returns {
//   filters: [{ name, type, requiredBy: [chartId], charts: [chartId] }],
//   byChart: Map<chartId, [{ name, type, required }]>,
//   conflicts: [{ name, a: {chartId, chartName, type}, b: {...} }],
//   errors:    [{ chartId, chartName, message }],
// }
export function discoverFilters(charts = []) {
  const byName = new Map();
  const byChart = new Map();
  const conflicts = [];
  const errors = [];

  for (const chart of charts) {
    let params;
    try {
      params = findParameters(chart.sqlQuery || "");
    } catch (e) {
      // A chart whose own SQL is contradictory is reported and skipped. It
      // must not take the whole bar down with it.
      errors.push({
        chartId: chart.id,
        chartName: chart.name,
        message: e.message,
      });
      continue;
    }

    byChart.set(chart.id, params);

    for (const p of params) {
      const seen = byName.get(p.name);

      if (!seen) {
        byName.set(p.name, {
          name: p.name,
          type: p.type,
          declaredBy: { chartId: chart.id, chartName: chart.name },
          charts: [chart.id],
          requiredBy: p.required ? [chart.id] : [],
        });
        continue;
      }

      if (seen.type !== p.type) {
        // Named on both sides, which is the whole point of doing this here.
        // Recorded once per offending pair rather than thrown, so the caller
        // can report every conflict on the dashboard at once.
        const already = conflicts.some(
          (c) =>
            c.name === p.name &&
            c.b.chartId === chart.id &&
            c.a.chartId === seen.declaredBy.chartId,
        );
        if (!already) {
          conflicts.push({
            name: p.name,
            a: {
              chartId: seen.declaredBy.chartId,
              chartName: seen.declaredBy.chartName,
              type: seen.type,
            },
            b: {
              chartId: chart.id,
              chartName: chart.name,
              type: p.type,
            },
          });
        }
        continue;
      }

      if (!seen.charts.includes(chart.id)) seen.charts.push(chart.id);
      if (p.required && !seen.requiredBy.includes(chart.id)) {
        seen.requiredBy.push(chart.id);
      }
    }
  }

  return {
    filters: [...byName.values()],
    byChart,
    conflicts,
    errors,
  };
}

// A readable sentence for one conflict. Both charts are named, because the
// dashboard cannot show one control for a name meaning two different things
// and the author needs to know where to look.
export function describeConflict(c) {
  return (
    `Filter '${c.name}' is declared as ${c.a.type} in "${c.a.chartName}" ` +
    `and as ${c.b.type} in "${c.b.chartName}". One name must have one type.`
  );
}

// Resolve the value for one filter. Precedence, highest first:
//   what the user has selected now, the dashboard default, the chart default,
//   then empty.
//
// chartDefaults is the merge of config.paramDefaults across the charts that use
// the name; the caller decides how to build it (first declaring chart wins).
export function resolveValue({ name, selected, dashboardDefaults, chartDefaults }) {
  if (hasValue(selected?.[name])) return String(selected[name]);
  const dash = dashboardDefaults?.[name]?.default;
  if (hasValue(dash)) return String(dash);
  if (hasValue(chartDefaults?.[name])) return String(chartDefaults[name]);
  return "";
}

// Build the full value map for a dashboard in one pass.
export function resolveValues(filters, { selected, dashboardDefaults, chartDefaults }) {
  const out = {};
  for (const f of filters) {
    out[f.name] = resolveValue({
      name: f.name,
      selected,
      dashboardDefaults,
      chartDefaults,
    });
  }
  return out;
}

// Which charts should re-run for a given set of changed filter names.
// A chart responds to a filter if and only if its SQL names that parameter, so
// changing `region` leaves a chart with hardcoded values completely alone.
export function chartsAffectedBy(changedNames, byChart) {
  const changed = new Set(changedNames);
  const out = [];
  for (const [chartId, params] of byChart) {
    if (params.some((p) => changed.has(p.name))) out.push(chartId);
  }
  return out;
}

// The parameters one chart needs that have no value.
//
// Every type is treated the same way. An empty required String could in
// principle be sent as '' and would produce `WHERE region = ''`, which matches
// nothing: the chart would render as empty and look identical to a working
// chart with no data. Numeric and temporal types cannot even do that - the
// value is omitted from the request and ClickHouse rejects the statement with
// "Substitution 'x' is not set". Treating all types alike means the chart
// always explains itself instead of sometimes lying.
export function missingRequired(chartId, byChart, values) {
  const params = byChart.get(chartId) || [];
  return params
    .filter((p) => p.required && !hasValue(values?.[p.name]))
    .map((p) => p.name);
}

// The message shown in place of a chart that cannot run yet. Names the filters
// rather than surfacing ClickHouse's substitution error, which arrives after a
// pointless round trip and does not say which control to touch.
export function waitingMessage(names) {
  if (!names.length) return "";
  const list =
    names.length === 1
      ? `'${names[0]}'`
      : names.map((n) => `'${n}'`).slice(0, -1).join(", ") +
        ` and '${names[names.length - 1]}'`;
  const verb = names.length === 1 ? "needs a value" : "need values";
  const tail = names.length === 1 ? "Fill it in" : "Fill them in";
  return `This chart is waiting: ${list} ${verb}. ${tail} and press Apply.`;
}

// Presentation helpers over dashboard.filters.

export function labelFor(name, dashboardFilters) {
  const label = dashboardFilters?.[name]?.label;
  return typeof label === "string" && label.trim() ? label : name;
}

export function isHidden(name, dashboardFilters) {
  return dashboardFilters?.[name]?.hidden === true;
}

// Configured order first, then alphabetical for anything unconfigured, so a
// dashboard with no settings still gets a stable bar rather than whichever
// order the charts happened to load in.
export function orderFilters(filters, dashboardFilters) {
  return [...filters].sort((a, b) => {
    const ao = dashboardFilters?.[a.name]?.order;
    const bo = dashboardFilters?.[b.name]?.order;
    const aHas = Number.isFinite(ao);
    const bHas = Number.isFinite(bo);
    if (aHas && bHas) return ao - bo;
    if (aHas) return -1;
    if (bHas) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Re-exported so callers that only need the type predicates do not have to
// import from two places.
export { isNumeric, isTemporal, hasValue };
