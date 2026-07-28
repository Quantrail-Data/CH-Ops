// Copyright (C) 2026 Quantrail™ Data Private Limited
// Structural guards for the Cluster Overview live section.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import fs from "fs";
import Icon from "../../src/frontend/components/common/Icon.jsx";
import { ICON_NAMES } from "../../src/frontend/assets/iconSprite.js";
import {
  METRICS,
  METRIC_KEYS,
  ASYNC_KEYS,
  EVENT_KEYS,
  BACKGROUND_POOLS,
  HEALTH_CHIPS,
  ALL_LOG_LEVELS,
  TIME_BREAKDOWN,
} from "../../src/frontend/components/overview/overviewMetrics.js";

const DIR = "src/frontend/components/overview";
const FILES = ["LiveOverview.jsx", "OverviewCards.jsx", "ClusterOverview.jsx", "ClusterTopology.jsx"];
const live = fs.readFileSync(`${DIR}/LiveOverview.jsx`, "utf8");

describe("metric registry", () => {
  it("gives every metric a label and a unit", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.label, `${key} has no label`).toBeTruthy();
      expect(typeof m.unit, `${key} has no unit`).toBe("string");
    }
  });

  it("gives every metric a formula, so the number is checkable", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.formula, `${key} has no formula`).toBeTruthy();
    }
  });

  it("gives every metric guidance on how to read it", () => {
    // The `read` line is what makes the page teach rather than just report.

    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.read, `${key} has no interpretation guidance`).toBeTruthy();
      expect(m.read.length, `${key} guidance is too short to be useful`).toBeGreaterThan(40);
    }
  });

  it("declares a known source for every metric", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(["metrics", "async", "events"], `${key} has source ${m.source}`).toContain(m.source);
    }
  });

  it("declares a valid direction, or null where there is no judgement to make", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(["lower", "higher", null], `${key} has better=${m.better}`).toContain(
        m.better ?? null,
      );
    }
  });
});

describe("registry and page agree", () => {
  const rendered = new Set(
    [...live.matchAll(/(?:metricKey="([a-z_0-9]+)"|key: "([a-z_0-9]+)")/g)].map(
      (m) => m[1] || m[2],
    ),
  );

  it("renders no metricKey that the registry does not define", () => {
    const defined = new Set(Object.keys(METRICS));
    const missing = [...rendered].filter((k) => !defined.has(k) && !k.endsWith("_rate"));
    expect(missing).toEqual([]);
  });

  it("defines no metric that the page never renders", () => {
    // An orphan is not harmless: it is copy nobody reviews attached to a number
    // nobody sees, and it accumulates.
    const orphans = Object.keys(METRICS).filter((k) => !rendered.has(k));
    expect(orphans).toEqual([]);
  });
});

describe("gauge direction matches the fixed colour bands", () => {
  // The bands are green through red, low to high, on every dial. 
  const gaugeKeys = () => {
    const out = [];
    for (const block of ["machine", "efficiency"]) {
      const m = live.match(new RegExp(`const ${block} = \\[([\\s\\S]*?)\\n    \\];`));
      if (m) out.push(...[...m[1].matchAll(/key: "([a-z_0-9]+)"/g)].map((x) => x[1]));
    }
    return out;
  };

  it("finds the gauge groups in the source", () => {
    expect(gaugeKeys().length).toBeGreaterThan(5);
  });

  it("marks every gauge as better-low", () => {
    const wrong = gaugeKeys().filter((k) => METRICS[k] && METRICS[k].better !== "lower");
    expect(wrong).toEqual([]);
  });
});

describe("polled key lists", () => {
  it("has no duplicates in any list", () => {
    for (const [name, list] of [
      ["METRIC_KEYS", METRIC_KEYS],
      ["ASYNC_KEYS", ASYNC_KEYS],
      ["EVENT_KEYS", EVENT_KEYS],
    ]) {
      expect(new Set(list).size, `${name} contains duplicates`).toBe(list.length);
    }
  });

  it("polls every pool task and limit it intends to chart", () => {
    for (const pool of BACKGROUND_POOLS) {
      expect(METRIC_KEYS, `${pool.label} task not polled`).toContain(pool.task);
      expect(METRIC_KEYS, `${pool.label} limit not polled`).toContain(pool.size);
    }
  });

  it("polls every health chip it intends to show", () => {
    for (const chip of HEALTH_CHIPS) {
      expect(METRIC_KEYS, `${chip.key} not polled`).toContain(chip.key);
    }
  });

  it("polls every counter the thread breakdown differences", () => {
    for (const item of TIME_BREAKDOWN) {
      for (const key of item.keys) {
        expect(EVENT_KEYS, `${key} not polled`).toContain(key);
      }
    }
  });

  it("polls every log level used as the error share denominator", () => {
    for (const level of ALL_LOG_LEVELS) {
      expect(EVENT_KEYS).toContain(level);
    }
  });

  it("gives every health chip a severity and a hint", () => {
    for (const chip of HEALTH_CHIPS) {
      expect(["danger", "warning"]).toContain(chip.severity);
      expect(chip.hint.length).toBeGreaterThan(20);
    }
  });
});

/** Every icon name the overview files reference, including ternary forms. */
function iconsUsed() {
  const used = new Set();
  for (const file of FILES) {
    const src = fs.readFileSync(`${DIR}/${file}`, "utf8");
    for (const m of src.matchAll(/ti ti-([a-z0-9-]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/icon="ti-([a-z0-9-]+)"/g)) used.add(m[1]);
    // Names built from a ternary, for example ti-player-${live ? "pause" : "play"}
    for (const m of src.matchAll(
      /ti-([a-z0-9-]*)\$\{[^}]*\?\s*"([a-z-]+)"\s*:\s*"([a-z-]+)"\}([a-z0-9-]*)/g,
    )) {
      used.add(`${m[1]}${m[2]}${m[4]}`);
      used.add(`${m[1]}${m[3]}${m[4]}`);
    }
  }
  return [...used];
}

describe("icons", () => {
  it("renders every icon from the sprite rather than as a blank placeholder", () => {
    // Stronger than checking names against ICON_NAMES, because it exercises the
    // component that actually decides. 
    const blank = [];
    for (const name of iconsUsed()) {
      // createElement rather than JSX: this file is .test.js, and the react
      // plugin only applies the JSX transform to .jsx.
      const { container, unmount } = render(
        React.createElement(Icon, { className: `ti ti-${name}` }),
      );
      if (container.querySelector('rect[opacity="0.5"]')) blank.push(name);
      unmount();
    }
    expect(blank, `these icons render blank: ${blank.join(", ")}`).toEqual([]);
  });

  it("uses only icons that are in the generated sprite", () => {
    // An unbundled name renders as a blank square rather than failing loudly,
    // so nothing catches it except a reader noticing the gap.
    const used = new Set();
    for (const file of FILES) {
      const src = fs.readFileSync(`${DIR}/${file}`, "utf8");
      for (const m of src.matchAll(/ti ti-([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/icon="ti-([a-z0-9-]+)"/g)) used.add(m[1]);
      // Names built from a ternary, for example ti-player-${live ? "pause" : "play"}
      for (const m of src.matchAll(
        /ti-([a-z0-9-]*)\$\{[^}]*\?\s*"([a-z-]+)"\s*:\s*"([a-z-]+)"\}([a-z0-9-]*)/g,
      )) {
        used.add(`${m[1]}${m[2]}${m[4]}`);
        used.add(`${m[1]}${m[3]}${m[4]}`);
      }
    }
    const missing = [...used].filter((n) => !ICON_NAMES.has(n));
    expect(missing).toEqual([]);
  });
});

describe("page hygiene", () => {
  it("declares a chart type and a format on every chart card", () => {
    // Without them a card falls back to the line defaults, which silently skips
    // the unit on the axis and the bar label placement.
    const cards = live.match(/<ChartCard\b[\s\S]*?\/>/g) || [];
    expect(cards.length).toBeGreaterThan(10);
    for (const card of cards) {
      expect(card, "chart card without a type").toContain("type=");
      expect(card, "chart card without a format").toContain("format=");
    }
  });

  it("keeps no time series charts, since nothing on the page is buffered", () => {
    for (const sub of ["multi_line", "simple_line", "area_line", "stacked_area"]) {
      expect(live, `${sub} needs a history the page does not keep`).not.toContain(sub);
    }
  });

  it("pauses polling when the tab is hidden", () => {
    // A dashboard left on a second monitor overnight is otherwise around
    // seventeen thousand queries.
    expect(live).toContain("visibilitychange");
    expect(live).toContain("visibilityState");
  });

  it("does not reintroduce dangerouslySetInnerHTML", () => {
    for (const file of FILES) {
      expect(fs.readFileSync(`${DIR}/${file}`, "utf8")).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
