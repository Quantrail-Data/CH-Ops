// Settings shared by the recorder and the checker.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VISUAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES_DIR = path.join(VISUAL_DIR, "fixtures");
export const BASELINE_DIR = path.join(VISUAL_DIR, "baseline");
export const OUTPUT_DIR = path.join(VISUAL_DIR, "output");

// The Vite dev server. The chart check needs dev mode (see lib/charts.js).
export const APP_URL = process.env.VISUAL_APP_URL || "http://localhost:5173";

// Used only while recording.
export const BACKEND_URL = process.env.VISUAL_BACKEND_URL || "http://localhost:3000";
export const FAKE_CLICKHOUSE_URL = process.env.VISUAL_FAKE_CLICKHOUSE_URL || "http://127.0.0.1:8123";
export const ADMIN_USER = process.env.VISUAL_ADMIN_USER || "admin";
export const ADMIN_PASSWORD = process.env.VISUAL_ADMIN_PASSWORD || "";

export const DATASETS = ["normal", "stress"];
export const THEMES = ["dark", "light"];
export const WINDOW_SIZES = {
  normal: [{ width: 1440, height: 900 }],
  // The stress data set also runs at the small and the large width.
  stress: [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }],
};

// A page is quiet when no API call was open for this long.
export const QUIET_MS = 1500;
// Never wait longer than this for one page or tab.
export const PAGE_TIMEOUT_MS = 10000;

// The tab buttons that the check opens one by one.
export const TAB_SELECTOR = ".tab-bar .tab-item, .queue-tab";

// Parts of the page that are covered by a solid box in the pictures. The cluster
// and node names in the navbar are drawn with slightly different anti-aliasing
// from one page load to the next, so they would always show as a difference.
// They are data, not design. Their style is still in the computed styles.
// When the revamp changes the navbar markup, update these selectors.
export const MASK_SELECTORS = [".navbar-connection .cui-select-value"];
