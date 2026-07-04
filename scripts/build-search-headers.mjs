// build-search-headers.mjs
//
// Scrapes constant in-page section headers from each routed page component and
// emits a routeId -> [headers] map that the search index folds in. This gives
// block/section-level search terms (e.g. "Throughput", "Per-table health")
// straight from the UI, with zero hand maintenance: change a header, rerun, and
// search updates.
//
// Only *constant* titles are taken. Anything containing a JS expression
// (template literals, {count}, selected names) is skipped, because it is not a
// stable term. Sources scraped: <h2 class="section-title"> and
// <h3 class="queue-panel-title"> (the two title conventions used app-wide).
//
// Runs automatically at dev-server / build start (see vite.config.js) and can be
// run by hand:  node scripts/build-search-headers.mjs
//
// Reads:  src/frontend/components/layout/MainLayout.jsx   (routeId -> component file)
//         each routed page component                      (header scrape)
// Writes: src/frontend/utils/pageHeaders.generated.js     (PAGE_HEADERS)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT = join(root, "src/frontend/components/layout/MainLayout.jsx");
const LAYOUT_DIR = dirname(LAYOUT);
const OUT = join(root, "src/frontend/utils/pageHeaders.generated.js");

export function generatePageHeaders() {
  const layout = readFileSync(LAYOUT, "utf8");

  // component name -> import path  (const Name = lazy(() => import("PATH")))
  const nameToPath = {};
  for (const m of layout.matchAll(
    /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g,
  )) {
    nameToPath[m[1]] = m[2];
  }

  // routeId -> component name, from CORE_ROUTES pairs and <Route> JSX
  const routeToName = {};
  for (const m of layout.matchAll(/\[\s*["']([^"']+)["']\s*,\s*(\w+)\s*\]/g)) {
    routeToName[m[1].replace(/\/:.*$/, "")] = m[2];
  }
  for (const m of layout.matchAll(
    /path="([^"]+)"[\s\S]{0,160}?element=\{\s*<(\w+)/g,
  )) {
    routeToName[m[1].replace(/\/:.*$/, "")] = m[2];
  }

  const TITLE_RE =
    /<(h[1-4])\b[^>]*class(?:Name)?="[^"]*\b(?:section-title|queue-panel-title)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;

  // Constant static body text: JSX text nodes (>text<) and a small set of
  // user-visible string props. Anything with an expression, tag, or code-ish
  // character is rejected, so only stable prose is indexed.
  const TEXT_RE = />([^<>]+)</g;
  const TEXT_ATTR_RE =
    /\b(?:placeholder|label|subtitle|note|heading|description|aria-label|alt|emptytext|emptylabel|tooltip)\s*=\s*["']([^"'{}]{3,80})["']/gi;

  function cleanText(s) {
    const t = s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 80) return "";
    // Prose characters only, and require at least one real 3+ letter word.
    if (!/^[A-Za-z0-9 .,&:%'"?()+#/-]+$/.test(t)) return "";
    if (!/[A-Za-z]{3,}/.test(t)) return "";
    // Reject leaked code fragments: property access (trend.series), JS operators,
    // and strings that start with code punctuation (a stray ternary/JSX slice).
    if (/\.[A-Za-z]/.test(t)) return "";
    if (/&&|\|\||=>/.test(t)) return "";
    if (/^[)\]:,&|?]/.test(t)) return "";
    if (/[([&|]$/.test(t)) return "";
    return t;
  }

  function cleanTitle(inner) {
    const noTags = inner.replace(/<[^>]*>/g, " "); // drop <Icon/> etc.
    if (/[{}]/.test(noTags)) {
      const stripped = noTags.replace(/\{[^{}]*\}/g, " ");
      if (/[{}]/.test(stripped)) return ""; // nested expression -> dynamic
      return stripped.replace(/\s+/g, " ").trim();
    }
    return noTags.replace(/\s+/g, " ").trim();
  }

  const COMPONENTS_DIR = join(root, "src/frontend/components");
  // Shared chrome / generic widgets: don't scrape or recurse into these (their
  // titles are dynamic or belong to no single page).
  const DENY = new Set([
    "DataTable", "ChartCard", "SharedComponents", "Toast", "ConfirmModal",
    "Select", "MultiSelect", "SelectMenu", "Icon", "DateTimePicker",
    "AlertBanner", "AlertMarquee", "ErrorBoundary", "LogHeatmap", "Navbar",
    "Sidebar", "MainLayout", "GlobalSearch", "Playback", "ChartToolbar",
  ]);
  const MAX_DEPTH = 3;
  const MAX_PER_ROUTE = 30;
  const MAX_TEXT_PER_ROUTE = 180;

  // Resolve a relative import specifier to a .jsx file under components/.
  function resolveLocal(fromDir, spec) {
    if (!spec.startsWith(".")) return null;
    const base = resolve(fromDir, spec);
    for (const cand of [base, base + ".jsx", join(base, "index.jsx")]) {
      if (existsSync(cand) && cand.startsWith(COMPONENTS_DIR)) return cand;
    }
    return null;
  }

  function collect(file, depth, visited, headers, text) {
    if (depth > MAX_DEPTH || visited.has(file)) return;
    if (headers.size >= MAX_PER_ROUTE && text.size >= MAX_TEXT_PER_ROUTE) return;
    visited.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(TITLE_RE)) {
      const t = cleanTitle(m[2]);
      if (t && t.length >= 2 && t.length <= 60 && headers.size < MAX_PER_ROUTE) headers.add(t);
    }
    for (const m of src.matchAll(TEXT_RE)) {
      if (text.size >= MAX_TEXT_PER_ROUTE) break;
      const t = cleanText(m[1]);
      if (t) text.add(t);
    }
    for (const m of src.matchAll(TEXT_ATTR_RE)) {
      if (text.size >= MAX_TEXT_PER_ROUTE) break;
      const t = cleanText(m[1]);
      if (t) text.add(t);
    }
    if (depth === MAX_DEPTH) return;
    for (const im of src.matchAll(/import\s+[^"']*["']([^"']+)["']/g)) {
      const child = resolveLocal(dirname(file), im[1]);
      if (!child) continue;
      const baseName = child.split("/").pop().replace(/\.jsx$/, "");
      if (DENY.has(baseName)) continue;
      collect(child, depth + 1, visited, headers, text);
    }
  }

  const headers = {};
  const texts = {};
  for (const [routeId, name] of Object.entries(routeToName)) {
    const rel = nameToPath[name];
    if (!rel) continue;
    const file = resolve(LAYOUT_DIR, rel);
    if (!existsSync(file)) continue;
    const hset = new Set();
    const tset = new Set();
    collect(file, 0, new Set(), hset, tset);
    if (hset.size) headers[routeId] = [...hset];
    // Drop text that just repeats a header for this route (headers are already
    // indexed at a higher weight).
    const hlower = new Set([...hset].map((s) => s.toLowerCase()));
    const tarr = [...tset].filter((s) => !hlower.has(s.toLowerCase()));
    if (tarr.length) texts[routeId] = tarr;
  }

  const banner = `// AUTO-GENERATED by scripts/build-search-headers.mjs - do not edit by hand.
// Per route, scraped at build/start time and folded into the search index
// (see searchCatalog.js): PAGE_HEADERS = constant section headers (high weight),
// PAGE_TEXT = constant static body text (low weight, recall booster).
// Regenerate: node scripts/build-search-headers.mjs
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited
`;
  const body =
    "export const PAGE_HEADERS = " + JSON.stringify(headers, null, 2) + ";\n\n" +
    "export const PAGE_TEXT = " + JSON.stringify(texts, null, 2) + ";\n";
  writeFileSync(OUT, banner + "\n" + body);
  return { headers, texts };
}

// Run directly (node scripts/build-search-headers.mjs) or import generatePageHeaders().
if (import.meta.url === `file://${process.argv[1]}`) {
  const { headers, texts } = generatePageHeaders();
  const h = Object.values(headers).reduce((a, b) => a + b.length, 0);
  const t = Object.values(texts).reduce((a, b) => a + b.length, 0);
  console.log(
    `build-search-headers: ${Object.keys(headers).length} pages, ${h} headers, ${t} text terms -> ${OUT}`,
  );
}
