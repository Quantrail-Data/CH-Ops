// Reads every ECharts chart on the page, with no change to the app.
//
// In the Vite dev server, the app loads ECharts from one module address. The
// page reads that address from the served file src/frontend/utils/echarts.js,
// imports the same address again and gets the same module. Then it can call
// echarts.getInstanceByDom() on each chart element.

export async function readCharts(page) {
  return page.evaluate(async () => {
    const appModule = await (await fetch("/src/frontend/utils/echarts.js")).text();
    const match = appModule.match(/from\s+["']([^"']*\/deps\/echarts\.js[^"']*)["']/);
    if (!match) return { error: "ECharts module not found. Run the check against the Vite dev server.", charts: [] };
    const echarts = await import(match[1]);

    // Functions cannot be saved, so they become a short text.
    const plain = (value) =>
      JSON.parse(JSON.stringify(value, (key, item) => (typeof item === "function" ? "[function]" : item)));

    const charts = [];
    for (const element of document.querySelectorAll("[_echarts_instance_]")) {
      const chart = echarts.getInstanceByDom(element);
      if (!chart || chart.isDisposed()) continue;
      const box = element.getBoundingClientRect();
      const canvases = [...element.querySelectorAll("canvas")].map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
      }));
      let legendBox = null;
      try {
        // An internal ECharts field. It gives the drawn size of the legend.
        const legendView = chart._componentsViews.find((view) => view.type === "legend.plain" || view.type === "legend.scroll");
        if (legendView) {
          const rect = legendView.group.getBoundingRect();
          legendBox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      } catch {
        legendBox = null;
      }
      charts.push({
        id: element.getAttribute("_echarts_instance_"),
        // A stable name: the chart's place in the page, not its random id.
        path: chartPath(element),
        box: { x: box.x, y: box.y + window.scrollY, width: box.width, height: box.height },
        canvases,
        legendBox,
        option: plain(chart.getOption()),
      });
    }

    function chartPath(element) {
      const parts = [];
      let current = element;
      while (current && current !== document.body) {
        const parent = current.parentElement;
        const index = parent ? [...parent.children].indexOf(current) : 0;
        parts.unshift(`${current.tagName.toLowerCase()}:${index}`);
        current = parent;
      }
      return parts.join("/");
    }

    return { charts };
  });
}

// Option keys that only hold colors. The chart rule allows color changes, so
// they are left out of the compare.
const COLOR_KEYS = new Set([
  "color", "backgroundColor", "borderColor", "shadowColor", "textBorderColor", "textShadowColor",
  "inactiveColor", "inactiveBorderColor", "fillerColor", "handleColor", "dataBackgroundColor", "selectedDataBackgroundColor",
]);

export function withoutColors(value) {
  if (Array.isArray(value)) return value.map(withoutColors);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (COLOR_KEYS.has(key)) continue;
      // fontFamily may change by name only (chart rule).
      if (key === "fontFamily") continue;
      result[key] = withoutColors(item);
    }
    return result;
  }
  return value;
}
