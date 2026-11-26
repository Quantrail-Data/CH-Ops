// A sample dashboard for the README screenshots, with many kinds of charts.
//
// The recorded data has no custom dashboard, so screenshots.mjs answers the
// dashboard API calls with the data below. The numbers are made up, but they
// look like the numbers of a real cluster. They are the same in every run.

export const SAMPLE_DASHBOARD = { id: 9001, name: "Cluster health", columns: 3, filters: "{}" };

// Every second hour, so the axis labels have space.
const HOURS = Array.from({ length: 12 }, (_, index) => `${String(index * 2).padStart(2, "0")}h`);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A wave with a fixed shape, so the charts look real and do not change.
function wave(index, base, height, phase = 0) {
  return Math.round(base + height * (0.5 + 0.5 * Math.sin((index + phase) / 3.2)) + ((index * 7) % 5) * height * 0.04);
}

// Each chart has a name, a type and its data. The first row has the charts
// with the most variety, so the screenshot of one screen shows them.
const CHARTS = [
  {
    name: "Queries",
    chartType: "line", chartSubtype: "multi_line",
    config: { time: "hour", series: "kind", value: "queries", showLegend: true },
    rows: HOURS.flatMap((hour, index) => [
      { hour, kind: "Select", queries: wave(index, 32000, 26000) },
      { hour, kind: "Insert", queries: wave(index, 14000, 6000, 4) },
      { hour, kind: "Other", queries: wave(index, 3000, 2500, 8) },
    ]),
  },
  {
    name: "Disk use",
    chartType: "pie", chartSubtype: "donut",
    config: { category: "database", value: "gib", showLegend: true },
    rows: [
      { database: "events", gib: 1840 },
      { database: "logs", gib: 920 },
      { database: "metrics", gib: 610 },
      { database: "billing", gib: 240 },
      { database: "default", gib: 85 },
    ],
  },
  {
    name: "Inserts",
    chartType: "bar", chartSubtype: "stacked_bar",
    config: { category: "day", series: "table", value: "million_rows", showLegend: true },
    rows: DAYS.flatMap((day, index) => [
      { day, table: "events.clicks", million_rows: wave(index, 120, 60) },
      { day, table: "logs.app", million_rows: wave(index, 70, 40, 3) },
      { day, table: "metrics.points", million_rows: wave(index, 40, 30, 6) },
    ]),
  },
  {
    name: "Busy hours",
    chartType: "heatmap", chartSubtype: "matrix",
    config: { x: "hour", y: "day", value: "queries" },
    rows: DAYS.flatMap((day, dayIndex) =>
      HOURS.map((hour, hourIndex) => ({
        hour,
        day,
        queries: Math.round((dayIndex < 5 ? 1 : 0.4) * (hourIndex >= 4 && hourIndex <= 9 ? 900 : 250) + ((dayIndex * 13 + hourIndex * 7) % 11) * 30),
      })),
    ),
  },
  {
    name: "Top tables",
    chartType: "bar", chartSubtype: "horizontal_bar",
    config: { category: "table", value: "gib" },
    rows: [
      { table: "metrics.points", gib: 210 },
      { table: "billing.invoices", gib: 240 },
      { table: "logs.app", gib: 610 },
      { table: "events.views", gib: 780 },
      { table: "events.clicks", gib: 1060 },
    ],
  },
  {
    name: "Node load",
    chartType: "radar", chartSubtype: "multi_metric",
    config: { entity: "node", metric: "metric", value: "percent", showLegend: true },
    rows: ["ch-node-01", "ch-node-02", "ch-node-03"].flatMap((node, index) =>
      ["CPU", "Memory", "Disk", "Merges", "Network"].map((metric, metricIndex) => ({
        node,
        metric,
        percent: 35 + ((index * 17 + metricIndex * 23) % 55),
      })),
    ),
  },
  {
    name: "Queries today",
    chartType: "kpi", chartSubtype: "single",
    config: { label: "label", value: "value" },
    rows: [{ label: "Queries today", value: "1.28 M" }],
  },
  {
    name: "p95 query time",
    chartType: "kpi", chartSubtype: "single",
    config: { label: "label", value: "value" },
    rows: [{ label: "p95 query time", value: "412 ms" }],
  },
  {
    name: "Memory",
    chartType: "gauge", chartSubtype: "single",
    config: { value: "value", min_val: "0", max_val: "100" },
    rows: [{ value: 63 }],
  },
];

export const SAMPLE_CHARTS = CHARTS.map((chart, index) => ({
  id: 9100 + index,
  name: chart.name,
  dashboardId: SAMPLE_DASHBOARD.id,
  gridRow: Math.floor(index / SAMPLE_DASHBOARD.columns),
  gridCol: index % SAMPLE_DASHBOARD.columns,
  // The SQL is only a key to find the rows below. It is never sent to ClickHouse.
  sqlQuery: `SELECT 'sample chart ${index}'`,
  chartType: chart.chartType,
  chartSubtype: chart.chartSubtype,
  config: JSON.stringify(chart.config),
}));

// Gives the rows of a sample chart, or null for any other SQL.
export function sampleRowsFor(sql) {
  const match = /'sample chart (\d+)'/.exec(sql || "");
  return match ? CHARTS[Number(match[1])].rows : null;
}

// Answers the dashboard API calls. Other calls go to the recorded data.
export async function serveSampleDashboard(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const address = new URL(request.url()).pathname;
    if (request.method() === "GET" && address === "/api/dashboards") {
      return route.fulfill({ json: [SAMPLE_DASHBOARD] });
    }
    if (request.method() === "GET" && address === `/api/dashboards/${SAMPLE_DASHBOARD.id}/charts`) {
      return route.fulfill({ json: SAMPLE_CHARTS });
    }
    if (request.method() === "POST" && address === "/api/query") {
      const rows = sampleRowsFor(JSON.parse(request.postData() || "{}").sql);
      if (rows) return route.fulfill({ json: { rows } });
    }
    return route.fallback();
  });
}
