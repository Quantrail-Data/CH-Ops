// Copyright (C) 2026 Quantrail™ Data Private Limited
// @Kathir -> Kathir Moorthy
// CHOps v6: Registry defining 13 chart types, 22 subtypes, column validation, and auto-legends.

export const CHART_TYPES = [
  {
    type: "bar",
    label: "Bar Chart",
    hasXLabel: true,
    hasYLabel: true,
    hasLegend: false,
    subtypes: [
      {
        subtype: "simple_bar",
        label: "Simple Bar",
        fields: [
          {
            key: "category",
            label: "Category (X)",
            required: true,
            expect: "string",
          },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "grouped_bar",
        label: "Grouped Bar",
        hasLegend: true,
        fields: [
          {
            key: "category",
            label: "Category (X)",
            required: true,
            expect: "string",
          },
          { key: "series", label: "Series", required: true, expect: "string" },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "stacked_bar",
        label: "Stacked Bar",
        hasLegend: true,
        fields: [
          {
            key: "category",
            label: "Category (X)",
            required: true,
            expect: "string",
          },
          { key: "stack", label: "Stack By", required: true, expect: "string" },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "horizontal_bar",
        label: "Horizontal Bar",
        fields: [
          {
            key: "category",
            label: "Category (Y)",
            required: true,
            expect: "string",
          },
          {
            key: "value",
            label: "Value (X)",
            required: true,
            expect: "numeric",
          },
        ],
      },
    ],
  },
  {
    type: "line",
    label: "Line Chart",
    hasXLabel: true,
    hasYLabel: true,
    hasLegend: false,
    subtypes: [
      {
        subtype: "simple_line",
        label: "Simple Line",
        fields: [
          {
            key: "time",
            label: "Time / X Axis",
            required: true,
            expect: "any",
          },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "multi_line",
        label: "Multi Line",
        hasLegend: true,
        fields: [
          {
            key: "time",
            label: "Time / X Axis",
            required: true,
            expect: "any",
          },
          { key: "series", label: "Series", required: true, expect: "string" },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "area_line",
        label: "Area Line",
        fields: [
          {
            key: "time",
            label: "Time / X Axis",
            required: true,
            expect: "any",
          },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
      {
        subtype: "stacked_area",
        label: "Stacked Area",
        hasLegend: true,
        fields: [
          {
            key: "time",
            label: "Time / X Axis",
            required: true,
            expect: "any",
          },
          { key: "series", label: "Series", required: true, expect: "string" },
          {
            key: "value",
            label: "Value (Y)",
            required: true,
            expect: "numeric",
          },
        ],
      },
    ],
  },
  {
    type: "pie",
    label: "Pie Chart",
    hasLegend: true,
    subtypes: [
      {
        subtype: "pie",
        label: "Pie",
        fields: [
          {
            key: "category",
            label: "Category",
            required: true,
            expect: "string",
          },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
      {
        subtype: "donut",
        label: "Donut",
        fields: [
          {
            key: "category",
            label: "Category",
            required: true,
            expect: "string",
          },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
      {
        subtype: "rose",
        label: "Rose / Nightingale",
        fields: [
          {
            key: "category",
            label: "Category",
            required: true,
            expect: "string",
          },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "scatter",
    label: "Scatter Chart",
    hasXLabel: true,
    hasYLabel: true,
    subtypes: [
      {
        subtype: "basic_scatter",
        label: "Basic Scatter",
        fields: [
          { key: "x", label: "X Measure", required: true, expect: "numeric" },
          { key: "y", label: "Y Measure", required: true, expect: "numeric" },
        ],
      },
      {
        subtype: "bubble",
        label: "Bubble Chart",
        hasLegend: true,
        fields: [
          { key: "x", label: "X Measure", required: true, expect: "numeric" },
          { key: "y", label: "Y Measure", required: true, expect: "numeric" },
          { key: "size", label: "Size", required: true, expect: "numeric" },
          {
            key: "category",
            label: "Category",
            required: false,
            expect: "string",
          },
        ],
      },
    ],
  },
  {
    type: "boxplot",
    label: "Box Plot",
    hasXLabel: true,
    hasYLabel: true,
    subtypes: [
      {
        subtype: "simple_box",
        label: "Simple Aggregate",
        fields: [
          { key: "category", label: "Category (X)", required: true, expect: "string" },
          { key: "value", label: "Value (Y)", required: true, expect: "numeric" },
        ],
      },
      {
        subtype: "multi_box",
        label: "Multi-Category",
        hasLegend: true,
        fields: [
          { key: "category", label: "Category (X)", required: true, expect: "string" },
          { key: "group", label: "Group (Series)", required: true, expect: "string" },
          { key: "value", label: "Value (Y)", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "heatmap",
    label: "Heatmap",
    hasXLabel: true,
    hasYLabel: true,
    subtypes: [
      {
        subtype: "matrix",
        label: "Matrix Heatmap",
        fields: [
          { key: "x", label: "X Dimension", required: true, expect: "string" },
          { key: "y", label: "Y Dimension", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "funnel",
    label: "Funnel",
    subtypes: [
      {
        subtype: "standard",
        label: "Standard Funnel",
        fields: [
          { key: "stage", label: "Stage", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "gauge",
    label: "Gauge",
    subtypes: [
      {
        subtype: "single",
        label: "Single Gauge",
        fields: [
          { key: "value", label: "Value", required: true, expect: "numeric" },
          { key: "min", label: "Min", required: false, expect: "numeric" },
          { key: "max", label: "Max", required: false, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "radar",
    label: "Radar",
    hasLegend: true,
    subtypes: [
      {
        subtype: "multi_metric",
        label: "Multi Metric",
        fields: [
          { key: "metric", label: "Metric", required: true, expect: "string" },
          { key: "entity", label: "Entity", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "candlestick",
    label: "Candlestick",
    hasXLabel: true,
    hasYLabel: true,
    subtypes: [
      {
        subtype: "financial",
        label: "Financial",
        fields: [
          { key: "date", label: "Date", required: true, expect: "any" },
          { key: "open", label: "Open", required: true, expect: "numeric" },
          { key: "close", label: "Close", required: true, expect: "numeric" },
          { key: "low", label: "Low", required: true, expect: "numeric" },
          { key: "high", label: "High", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "sankey",
    label: "Sankey",
    subtypes: [
      {
        subtype: "flow",
        label: "Flow",
        fields: [
          { key: "source", label: "Source", required: true, expect: "string" },
          { key: "target", label: "Target", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
        ],
      },
    ],
  },
  {
    type: "treemap",
    label: "Treemap",
    subtypes: [
      {
        subtype: "hierarchical",
        label: "Hierarchical",
        fields: [
          { key: "name", label: "Name", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
          { key: "parent", label: "Parent", required: false, expect: "string" },
        ],
      },
    ],
  },
  {
    type: "sunburst",
    label: "Sunburst",
    subtypes: [
      {
        subtype: "simple_sunburst",
        label: "Simple",
        fields: [
          { key: "name", label: "Name", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
          { key: "parent", label: "Parent", required: false, expect: "string" },
        ],
      },
      {
        subtype: "sunburst_visualmap",
        label: "Visual Map",
        fields: [
          { key: "name", label: "Name", required: true, expect: "string" },
          { key: "value", label: "Value", required: true, expect: "numeric" },
          { key: "parent", label: "Parent", required: false, expect: "string" },
        ],
      },
    ],
  },
  {
    type: "kpi",
    label: "KPI Card",
    subtypes: [
      {
        subtype: "single",
        label: "Single KPI",
        fields: [
          { key: "label", label: "Metric Name", required: true, expect: "any" },
          { key: "value", label: "Value", required: true, expect: "any" },
        ],
      },
    ],
  },
  {
    type: "table",
    label: "Table",
    subtypes: [{ subtype: "data_table", label: "Data Table", fields: [] }],
  },
];

/** Validate column type against expected type */
export function validateColumnType(data, colName, expect) {
  if (!data?.length || !colName || expect === "any") return null;
  const sample = data
    .slice(0, 5)
    .map((r) => r[colName])
    .filter((v) => v != null);
  if (!sample.length) return null;
  if (expect === "numeric") {
    const allNumeric = sample.every((v) => !isNaN(parseFloat(v)));
    if (!allNumeric)
      return `Column "${colName}" should be numeric but contains non-numeric values`;
  }
  if (expect === "string") {
    const allString = sample.every(
      (v) => typeof v === "string" || isNaN(parseFloat(v)),
    );
  }
  return null;
}

/** Get axis label defaults based on chart type */
export function getAxisDefaults(chartType, chartSubtype) {
  if (chartType === "bar" && chartSubtype === "horizontal_bar")
    return { xLabel: "Value", yLabel: "Category" };
  if (chartType === "bar") return { xLabel: "Category", yLabel: "Value" };
  if (chartType === "line") return { xLabel: "Time", yLabel: "Value" };
  if (chartType === "scatter") return { xLabel: "X", yLabel: "Y" };
  if (chartType === "candlestick") return { xLabel: "Date", yLabel: "Price" };
  if (chartType === "heatmap") return { xLabel: "X", yLabel: "Y" };
  if (chartType === "boxplot") return { xLabel: "Category", yLabel: "Value" };
  if (chartType === "sunburst") return { xLabel: "", yLabel: "" };
  return { xLabel: "", yLabel: "" };
}

/** Does this chart type/subtype need a legend? */
export function needsLegend(chartType, chartSubtype) {
  const typeInfo = CHART_TYPES.find((t) => t.type === chartType);
  const subtypeInfo = typeInfo?.subtypes.find(
    (s) => s.subtype === chartSubtype,
  );
  return subtypeInfo?.hasLegend || typeInfo?.hasLegend || false;
}

function computeQuartiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [0, 0, 0, 0, 0];

  const q = (p) => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const min = sorted.find((v) => v >= lowerFence) ?? sorted[0];
  const max = sorted.findLast((v) => v <= upperFence) ?? sorted[n - 1];

  return [min, q1, q(0.5), q3, max];
}

function computeOutliers(values, categoryIndex) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 4) return [];

  const q = (p) => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };

  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  return sorted
    .filter((v) => v < lowerFence || v > upperFence)
    .map((v) => [categoryIndex, v]);
}

function buildTree(data, mapping) {
  const nameKey = mapping.name;
  const valueKey = mapping.value;
  const parentKey = mapping.parent;
  const nodeMap = new Map();

  if (!parentKey || !data.some((r) => r[parentKey])) {
    return data.map((r) => ({
      name: String(r[nameKey] ?? ""),
      value: parseFloat(r[valueKey]) || 0,
    }));
  }

  for (const row of data) {
    const name = String(row[nameKey] ?? "");
    const value = parseFloat(row[valueKey]) || 0;
    const parent = row[parentKey] != null ? String(row[parentKey]) : null;

    if (!nodeMap.has(name)) {
      nodeMap.set(name, { name, value: 0, children: [] });
    }
    nodeMap.get(name).value += value;

    if (parent && parent !== name && !nodeMap.has(parent)) {
      nodeMap.set(parent, { name: parent, value: 0, children: [] });
    }
  }

  const hasParent = new Set();
  for (const row of data) {
    const name = String(row[nameKey] ?? "");
    const parent = row[parentKey] != null ? String(row[parentKey]) : null;

    if (parent && parent !== name && nodeMap.has(parent)) {
      const parentNode = nodeMap.get(parent);
      if (!parentNode.children.some((c) => c.name === name)) {
        parentNode.children.push(nodeMap.get(name));
        hasParent.add(name);
      }
    }
  }

  const roots = [];
  for (const [name, node] of nodeMap) {
    if (!hasParent.has(name)) roots.push(node);
  }

  function clean(node, depth = 0) {
    if (depth > 10 || node.children.length === 0) {
      if (node.children?.length === 0) delete node.children;
      return;
    }
    node.children.forEach((c) => clean(c, depth + 1));
    delete node.value;
  }
  roots.forEach(clean);

  return roots;
}

function getToolboxConfig(chartTitle) {
  return {
    show: true,
    right: 10,
    top: 0,
    feature: {
      saveAsImage: {
        title: "Save as Image",
        name: chartTitle || "chart",
      },
    },
    iconStyle: {
      borderColor: "var(--text-muted)",
    },
    emphasis: {
      iconStyle: {
        borderColor: "var(--accent)",
      },
    },
  };
}

function getDataZoomConfig() {
  return [
    {
      type: "slider",
      xAxisIndex: 0,
      start: 0,
      end: 100,
      bottom: 10,
      height: 20,
      handleSize: 20,
      show: false,
    },
    {
      type: "inside",
      xAxisIndex: 0,
      start: 0,
      end: 100,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: true,
    },
  ];
}

function parseTimeValue(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const normalized = value.includes(" ") && !value.includes("T")
      ? value.replace(" ", "T")
      : value;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isTimeSeriesAxis(values) {
  if (!values?.length) return false;
  const sample = values.slice(0, Math.min(values.length, 10));
  const valid = sample.filter((v) => parseTimeValue(v));
  return valid.length >= Math.max(2, Math.ceil(sample.length * 0.6));
}

function formatTimeAxisLabel(date, rangeMs) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");

  if (rangeMs <= 24 * 60 * 60 * 1000) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (rangeMs <= 31 * 24 * 60 * 60 * 1000) {
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (rangeMs <= 366 * 24 * 60 * 60 * 1000) {
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  }
  return `${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function getTimeAxisLabelConfig(values) {
  if (!isTimeSeriesAxis(values)) return {};
  const parsed = values.map((v) => parseTimeValue(v)).filter(Boolean);
  if (!parsed.length) return {};
  const minTime = Math.min(...parsed.map((d) => d.getTime()));
  const maxTime = Math.max(...parsed.map((d) => d.getTime()));
  const rangeMs = Math.max(maxTime - minTime, 0);
  const targetLabels = values.length <= 4 ? values.length : rangeMs > 0 ? 4 : Math.min(values.length, 4);
  const step = Math.max(1, Math.ceil(values.length / Math.max(targetLabels, 1)));

  return {
    axisLabel: {
      formatter: (value) => {
        const date = parseTimeValue(value);
        return date ? formatTimeAxisLabel(date, rangeMs) : String(value ?? "");
      },
      hideOverlap: true,
      interval: (index) => {
        if (values.length <= 4) return false;
        const lastIndex = values.length - 1;
        return index !== 0 && index !== lastIndex && index % step !== 0;
      },
    },
    minInterval: rangeMs > 0 ? undefined : 1,
  };
}

/** Build ECharts option - wrapped in try/catch */
export function buildChartOption(
  chartType,
  chartSubtype,
  data,
  mapping,
  chartTitle,
  opts = {},
) {
  if (!data?.length) return null;

  const { xLabel, yLabel, showLegend } = opts;
  const tooltip = { trigger: "axis", confine: true };

  const hasZoom = ![
    "pie",
    "gauge",
    "funnel",
    "sankey",
    "radar",
    "treemap",
    "kpi",
    "table",
    "sunburst",
  ].includes(chartType);
  const grid = {
    top: 40,
    right: 20,
    bottom: hasZoom ? 60 : 50,
    left: 60,
    containLabel: true,
  };

  const toolbox = getToolboxConfig(chartTitle);
  const dataZoom = hasZoom ? getDataZoomConfig() : [];
  const legend =
    showLegend !== false
      ? { show: true, top: 0, type: "scroll" }
      : { show: false };

  try {
    if (chartType === "bar") {
      if (chartSubtype === "horizontal_bar") {
        return {
          tooltip,
          toolbox,
          dataZoom,
          grid,
          yAxis: {
            type: "category",
            data: data.map((r) => r[mapping.category]),
            name: yLabel || "",
          },
          xAxis: { type: "value", name: xLabel || "" },
          series: [
            {
              type: "bar",
              data: data.map((r) => parseFloat(r[mapping.value]) || 0),
              label: { show: true, position: "right", overflow: "truncate" },
              labelLayout: { hideOverlap: true, moveOverlap: true },
              emphasis: { focus: "series" },
            },
          ],
        };
      }
      if (chartSubtype === "grouped_bar" || chartSubtype === "stacked_bar") {
        const cats = [...new Set(data.map((r) => r[mapping.category]))];
        const svs = [
          ...new Set(data.map((r) => r[mapping.series || mapping.stack])),
        ];
        const timeAxisConfig = getTimeAxisLabelConfig(cats);
        return {
          tooltip,
          toolbox,
          dataZoom,
          grid,
          legend,
          xAxis: {
            type: "category",
            data: cats,
            name: xLabel || "",
            ...timeAxisConfig,
            axisLabel: {
              ...timeAxisConfig.axisLabel,
            },
          },
          yAxis: { type: "value", name: yLabel || "" },
          series: svs.map((sv) => ({
            name: String(sv),
            type: "bar",
            stack: chartSubtype === "stacked_bar" ? "total" : undefined,
            data: cats.map((c) => {
              const row = data.find(
                (r) =>
                  r[mapping.category] === c &&
                  r[mapping.series || mapping.stack] === sv,
              );
              return row ? parseFloat(row[mapping.value]) || 0 : 0;
            }),
            label: {
              show: chartSubtype === "stacked_bar",
              position: chartSubtype === "stacked_bar" ? "inside" : "top",
              overflow: "truncate",
            },
            labelLayout: { hideOverlap: true, moveOverlap: true },
            emphasis: { focus: "series" },
          })),
        };
      }
      const simpleBarCategories = data.map((r) => r[mapping.category]);
      const simpleBarTimeAxisConfig = getTimeAxisLabelConfig(simpleBarCategories);
      return {
        tooltip,
        toolbox,
        dataZoom,
        grid,
        xAxis: {
          type: "category",
          data: simpleBarCategories,
          name: xLabel || "",
          ...simpleBarTimeAxisConfig,
          axisLabel: {
            ...simpleBarTimeAxisConfig.axisLabel,
          },
        },
        yAxis: { type: "value", name: yLabel || "" },
        series: [
          {
            type: "bar",
            data: data.map((r) => parseFloat(r[mapping.value]) || 0),
            label: { show: true, position: "top", overflow: "truncate" },
            labelLayout: { hideOverlap: true, moveOverlap: true },
            emphasis: { focus: "series" },
          },
        ],
      };
    }

    if (chartType === "line") {
      const isArea =
        chartSubtype === "area_line" || chartSubtype === "stacked_area";
      if (chartSubtype === "multi_line" || chartSubtype === "stacked_area") {
        const times = [...new Set(data.map((r) => r[mapping.time]))];
        const svs = [...new Set(data.map((r) => r[mapping.series]))];
        const timeAxisConfig = getTimeAxisLabelConfig(times);
        return {
          tooltip,
          toolbox,
          dataZoom,
          grid,
          legend,
          xAxis: {
            type: "category",
            data: times,
            name: xLabel || "",
            ...timeAxisConfig,
            axisLabel: {
              ...timeAxisConfig.axisLabel,
            },
          },
          yAxis: { type: "value", name: yLabel || "" },
          series: svs.map((sv) => ({
            name: String(sv),
            type: "line",
            smooth: true,
            stack: chartSubtype === "stacked_area" ? "total" : undefined,
            areaStyle: isArea ? { opacity: 0.15 } : undefined,
            data: times.map((t) => {
              const row = data.find(
                (r) => r[mapping.time] === t && r[mapping.series] === sv,
              );
              return row ? parseFloat(row[mapping.value]) || 0 : 0;
            }),
            label: { show: false },
            labelLayout: { hideOverlap: true, moveOverlap: true },
            emphasis: { focus: "series" },
          })),
        };
      }
      const times = data.map((r) => r[mapping.time]);
      const timeAxisConfig = getTimeAxisLabelConfig(times);
      return {
        tooltip,
        toolbox,
        dataZoom,
        grid,
        xAxis: {
          type: "category",
          data: times,
          name: xLabel || "",
          ...timeAxisConfig,
          axisLabel: {
            ...timeAxisConfig.axisLabel,
          },
        },
        yAxis: { type: "value", name: yLabel || "" },
        series: [
          {
            type: "line",
            smooth: true,
            data: data.map((r) => parseFloat(r[mapping.value]) || 0),
            areaStyle: isArea ? { opacity: 0.15 } : undefined,
            symbol: "circle",
            label: { show: false },
            labelLayout: { hideOverlap: true, moveOverlap: true },
            emphasis: { focus: "series" },
          },
        ],
      };
    }

    if (chartType === "pie") {
      const radius =
        chartSubtype === "donut"
          ? ["40%", "70%"]
          : chartSubtype === "rose"
            ? ["20%", "70%"]
            : "70%";
      return {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        toolbox,
        legend:
          showLegend !== false
            ? {
                show: true,
                orient: "vertical",
                left: "left",
                top: "middle",
                type: "scroll",
              }
            : { show: false },
        series: [
          {
            type: "pie",
            radius,
            roseType: chartSubtype === "rose" ? "area" : undefined,
            data: data.map((r) => ({
              name: String(r[mapping.category]),
              value: parseFloat(r[mapping.value]) || 0,
            })),
            label: {
              formatter: "{b}\n{d}%",
              overflow: "truncate",
              show: true,
              align: "center",
            },
            labelLine: { smooth: true, length: 18, length2: 8 },
            avoidLabelOverlap: true,
            labelLayout: { hideOverlap: true, moveOverlap: true },
            emphasis: { focus: "self" },
            minAngle: 4,
          },
        ],
      };
    }

    if (chartType === "scatter") {
      if (chartSubtype === "bubble" && mapping.category) {
        const groups = [...new Set(data.map((r) => r[mapping.category]))];
        const maxSize = Math.max(...data.map((r) => parseFloat(r[mapping.size]) || 0), 1);

        return {
          tooltip: {
            trigger: "item",
            formatter: (p) => {
              const d = p.data;
              return `${p.seriesName}<br/>${mapping.x}: ${d[0]}<br/>${mapping.y}: ${d[1]}<br/>${mapping.size}: ${d[2]}`;
            },
          },
          toolbox,
          grid,
          legend,
          xAxis: { type: "value", name: xLabel || mapping.x },
          yAxis: { type: "value", name: yLabel || mapping.y },
          series: groups.map((grp) => ({
            name: String(grp),
            type: "scatter",
            data: data
              .filter((r) => r[mapping.category] === grp)
              .map((r) => [
                parseFloat(r[mapping.x]) || 0,
                parseFloat(r[mapping.y]) || 0,
                parseFloat(r[mapping.size]) || 0,
              ]),
            symbolSize: (d) => Math.max(Math.sqrt(d[2] / maxSize) * 50, 6),
            emphasis: { focus: "series", itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
            itemStyle: { shadowBlur: 4, shadowColor: "rgba(0,0,0,0.15)", opacity: 0.75 },
          })),
        };
      }

      return {
        tooltip: { trigger: "item" },
        toolbox,
        grid,
        xAxis: { type: "value", name: xLabel || mapping.x },
        yAxis: { type: "value", name: yLabel || mapping.y },
        series: [{
          type: "scatter",
          data: data.map((r) => {
            const pt = [parseFloat(r[mapping.x]) || 0, parseFloat(r[mapping.y]) || 0];
            if (mapping.size) pt.push(parseFloat(r[mapping.size]) || 10);
            return pt;
          }),
          symbolSize: mapping.size ? (v) => Math.max(Math.sqrt(v[2]) * 3, 5) : 10,
        }],
      };
    }

    if (chartType === "gauge") {
      const val = parseFloat(data[0]?.[mapping.value]) || 0;
      return {
        toolbox,
        series: [
          {
            type: "gauge",
            min: parseFloat(mapping.min_val) || 0,
            max: parseFloat(mapping.max_val) || 100,
            data: [{ value: val, name: chartTitle || "" }],
            detail: { formatter: "{value}" },
          },
        ],
      };
    }

    if (chartType === "funnel") {
      return {
        tooltip: { trigger: "item", formatter: "{b}: {c}" },
        toolbox,
        series: [
          {
            type: "funnel",
            data: data.map((r) => ({
              name: String(r[mapping.stage]),
              value: parseFloat(r[mapping.value]) || 0,
            })),
            label: { position: "inside", overflow: "truncate" },
            labelLayout: { hideOverlap: true, moveOverlap: true },
          },
        ],
      };
    }

    if (chartType === "sankey") {
      const nodes = [
        ...new Set([
          ...data.map((r) => r[mapping.source]),
          ...data.map((r) => r[mapping.target]),
        ]),
      ].map((n) => ({ name: String(n) }));
      return {
        tooltip: { trigger: "item" },
        toolbox,
        series: [
          {
            type: "sankey",
            data: nodes,
            links: data.map((r) => ({
              source: String(r[mapping.source]),
              target: String(r[mapping.target]),
              value: parseFloat(r[mapping.value]) || 0,
            })),
            emphasis: { focus: "adjacency" },
            labelLayout: { hideOverlap: true },
          },
        ],
      };
    }

    if (chartType === "radar") {
      const metrics = [...new Set(data.map((r) => r[mapping.metric]))];
      const entities = [...new Set(data.map((r) => r[mapping.entity]))];
      return {
        tooltip: {},
        toolbox,
        legend:
          showLegend !== false
            ? { data: entities.map(String), top: 0, type: "scroll" }
            : { show: false },
        radar: {
          indicator: metrics.map((m) => ({
            name: String(m),
            max:
              Math.max(
                ...data
                  .filter((r) => r[mapping.metric] === m)
                  .map((r) => parseFloat(r[mapping.value]) || 0),
              ) * 1.2 || 100,
          })),
        },
        series: [
          {
            type: "radar",
            data: entities.map((e) => ({
              name: String(e),
              value: metrics.map((m) => {
                const row = data.find(
                  (r) => r[mapping.entity] === e && r[mapping.metric] === m,
                );
                return row ? parseFloat(row[mapping.value]) || 0 : 0;
              }),
            })),
            labelLayout: { hideOverlap: true },
          },
        ],
      };
    }

    if (chartType === "candlestick") {
      const dates = data.map((r) => r[mapping.date]);
      const timeAxisConfig = getTimeAxisLabelConfig(dates);
      return {
        tooltip: { trigger: "axis" },
        toolbox,
        dataZoom,
        grid,
        xAxis: {
          type: "category",
          data: dates,
          name: xLabel || "",
          ...timeAxisConfig,
          axisLabel: {
            ...timeAxisConfig.axisLabel,
          },
        },
        yAxis: { type: "value", name: yLabel || "" },
        series: [
          {
            type: "candlestick",
            data: data.map((r) => [
              parseFloat(r[mapping.open]) || 0,
              parseFloat(r[mapping.close]) || 0,
              parseFloat(r[mapping.low]) || 0,
              parseFloat(r[mapping.high]) || 0,
            ]),
            itemStyle: {},
            labelLayout: { hideOverlap: true },
          },
        ],
      };
    }

    if (chartType === "heatmap") {
      const xs = [...new Set(data.map((r) => r[mapping.x]))];
      const ys = [...new Set(data.map((r) => r[mapping.y]))];
      const vals = data.map((r) => [
        xs.indexOf(r[mapping.x]),
        ys.indexOf(r[mapping.y]),
        parseFloat(r[mapping.value]) || 0,
      ]);
      const maxV = Math.max(...vals.map((v) => v[2]), 1);
      const timeAxisConfig = getTimeAxisLabelConfig(xs);
      return {
        tooltip: {},
        toolbox,
        dataZoom: hasZoom
          ? [
              {
                type: "slider",
                xAxisIndex: 0,
                start: 0,
                end: 100,
                bottom: 10,
                height: 20,
              },
            ]
          : [],
        grid: { ...grid, bottom: 80 },
        xAxis: {
          type: "category",
          data: xs,
          name: xLabel || "",
          ...timeAxisConfig,
          axisLabel: {
            ...timeAxisConfig.axisLabel,
          },
        },
        yAxis: { type: "category", data: ys, name: yLabel || "" },
        visualMap: {
          min: 0,
          max: maxV,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 10,
        },
        series: [
          {
            type: "heatmap",
            data: vals,
            label: { show: true, overflow: "truncate" },
            labelLayout: { hideOverlap: true, moveOverlap: true },
          },
        ],
      };
    }

    if (chartType === "boxplot") {
      if (chartSubtype === "multi_box") {
        const categories = [...new Set(data.map((r) => r[mapping.category]))];
        const groups = [...new Set(data.map((r) => r[mapping.group]))];
        const timeAxisConfig = getTimeAxisLabelConfig(categories);

        const boxData = groups.map((grp) => ({
          name: String(grp),
          type: "boxplot",
          data: categories.map((cat) => {
            const vals = data
              .filter((r) => r[mapping.category] === cat && r[mapping.group] === grp)
              .map((r) => parseFloat(r[mapping.value]))
              .filter((v) => !isNaN(v));
            return computeQuartiles(vals);
          }),
        }));

        return {
          tooltip: { trigger: "item" },
          toolbox,
          grid,
          legend,
          xAxis: {
            type: "category",
            data: categories,
            name: xLabel || "",
            ...timeAxisConfig,
            axisLabel: {
              ...timeAxisConfig.axisLabel,
            },
          },
          yAxis: { type: "value", name: yLabel || "" },
          series: boxData,
        };
      }

      const categories = [...new Set(data.map((r) => r[mapping.category]))];
      const timeAxisConfig = getTimeAxisLabelConfig(categories);

      const boxItems = categories.map((cat) => {
        const vals = data
          .filter((r) => r[mapping.category] === cat)
          .map((r) => parseFloat(r[mapping.value]))
          .filter((v) => !isNaN(v));
        return computeQuartiles(vals);
      });

      const outlierData = [];
      categories.forEach((cat, i) => {
        const vals = data
          .filter((r) => r[mapping.category] === cat)
          .map((r) => parseFloat(r[mapping.value]))
          .filter((v) => !isNaN(v));
        computeOutliers(vals, i).forEach((pt) => outlierData.push(pt));
      });

      return {
        tooltip: { trigger: "item" },
        toolbox,
        grid,
        xAxis: {
          type: "category",
          data: categories,
          name: xLabel || "",
          ...timeAxisConfig,
          axisLabel: {
            ...timeAxisConfig.axisLabel,
          },
        },
        yAxis: { type: "value", name: yLabel || "" },
        series: [
          { type: "boxplot", data: boxItems },
          ...(outlierData.length > 0 ? [{
            name: "Outliers", type: "scatter", data: outlierData,
            symbolSize: 5, itemStyle: { opacity: 0.6 },
          }] : []),
        ],
      };
    }

    if (chartType === "treemap") {
      return { tooltip: {}, toolbox, series: [{ type: "treemap", data: buildTree(data, mapping) }] };
    }

    if (chartType === "sunburst") {
      const treeData = buildTree(data, mapping);

      if (chartSubtype === "sunburst_visualmap") {
        const allValues = [];
        function collectValues(nodes) {
          for (const n of nodes) {
            if (n.value != null) allValues.push(n.value);
            if (n.children) collectValues(n.children);
          }
        }
        collectValues(treeData);
        const minVal = allValues.length ? Math.min(...allValues) : 0;
        const maxVal = allValues.length ? Math.max(...allValues) : 100;

        return {
          tooltip: { trigger: "item", formatter: "{b}: {c}" },
          toolbox,
          visualMap: {
            type: "continuous",
            min: minVal,
            max: maxVal,
            inRange: { color: ["#2a4858", "#006d75", "#00a2ae", "#73d13d", "#ffe58f", "#ff7a45", "#cf1322"] },
            orient: "horizontal",
            left: "center",
            bottom: 10,
          },
          series: [{
            type: "sunburst",
            data: treeData,
            radius: ["10%", "90%"],
            label: { rotate: "radial", fontSize: 11 },
            emphasis: { focus: "ancestor" },
            levels: [{}, { r0: "10%", r: "35%", label: { fontSize: 13 } }, { r0: "35%", r: "65%" }, { r0: "65%", r: "90%", label: { fontSize: 9 } }],
          }],
        };
      }

      return {
        tooltip: { trigger: "item", formatter: "{b}: {c}" },
        toolbox,
        series: [{
          type: "sunburst",
          data: treeData,
          radius: ["10%", "90%"],
          label: { rotate: "radial", fontSize: 11 },
          emphasis: { focus: "ancestor" },
          levels: [{}, { r0: "10%", r: "35%", label: { fontSize: 13 } }, { r0: "35%", r: "65%" }, { r0: "65%", r: "90%", label: { fontSize: 9 } }],
        }],
      };
    }

    if (chartType === "kpi")
      return {
        _kpi: true,
        label: data[0]?.[mapping.label] || chartTitle,
        value: data[0]?.[mapping.value] || "-",
      };
    if (chartType === "table") return { _table: true, data };
  } catch (err) {
    return { _error: true, message: err.message };
  }
  return null;
}
