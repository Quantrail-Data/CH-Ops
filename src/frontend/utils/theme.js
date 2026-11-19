// theme.js - Design-token access for code that cannot use CSS var(...)
//
// The Midnight tokens live in styles/global.css; that file is the source of
// truth. Canvas renderers (ECharts, CodeMirror decorations) need concrete
// colour strings, so they read live tokens through themeColor() and series
// colours through chartPalette().
//
// MIDNIGHT below is the ONE JavaScript mirror of those tokens. It is used only
// where no document is available to read (tests, SSR) and to register the
// ECharts themes at load. Keep it in step with global.css; nothing else in the
// codebase should repeat these hex values.
//
// Pure module: no chart library imports, safe to use anywhere.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const MIDNIGHT = {
  dark: {
    // --chart-1..10
    series: [
      "#9590FF", "#4CC9F0", "#F5B83D", "#3FD69A", "#FF7A7A",
      "#C4B5FD", "#67E8F9", "#FCD34D", "#F9A8D4", "#A3ABBC",
    ],
    text: "#ECEFF4", // --text-primary
    secondary: "#B6BECD", // --text-secondary
    muted: "#8C95A8", // --text-muted
    axis: "#2A3556", // --border-strong
    grid: "rgba(140,149,168,0.14)", // --chart-grid
    surface: "#0D1324", // --bg-surface
    tooltipBg: "#131A2E", // --bg-raised
    tooltipBorder: "#2A3556", // --border-strong
    accent: "#9590FF",
    success: "#3FD69A",
    warning: "#F5B83D",
    danger: "#FF7A7A",
    info: "#4CC9F0",
  },
  light: {
    series: [
      "#4F46E5", "#0369A1", "#8C5405", "#13773A", "#C02626",
      "#7C3AED", "#0E7490", "#B45309", "#BE185D", "#475569",
    ],
    text: "#0F1320",
    secondary: "#384154",
    muted: "#5B6478",
    axis: "#CDD2DC",
    grid: "rgba(15,19,32,0.07)",
    surface: "#FFFFFF",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#E2E5EB",
    accent: "#4F46E5",
    success: "#13773A",
    warning: "#8C5405",
    danger: "#C02626",
    info: "#0369A1",
  },
};

export const DARK_COLORS = MIDNIGHT.dark.series;
export const LIGHT_COLORS = MIDNIGHT.light.series;

/** True when the app is in the light theme. */
export function isLightTheme() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light"
  );
}

/**
 * Resolve a design token (CSS custom property) to its current value, e.g.
 * themeColor("--accent"). Canvas renderers such as ECharts and CodeMirror
 * cannot read var(...) themselves, so they read tokens through this.
 */
export function themeColor(name, fallback = "") {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The series palette for the current (or given) theme. Reads the live
 * --chart-N tokens when the requested theme is the active one, so a change in
 * global.css reaches charts without touching JS; otherwise uses the mirror.
 */
export function chartPalette(dark = !isLightTheme()) {
  const mirror = dark ? DARK_COLORS : LIGHT_COLORS;
  if (dark === isLightTheme()) return mirror; // asking for the inactive theme
  return mirror.map((fallback, i) => themeColor(`--chart-${i + 1}`, fallback));
}
