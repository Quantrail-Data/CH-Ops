# CHOps - Manual Test Plan

## Prerequisites

- CHOps running (dev or production mode)
- At least one ClickHouse® node accessible
- S3-compatible storage (for backup tests)
- Two browser tabs (for multi-user tests)
- Both dark and light themes tested per section
- Test with superadmin, admin, editor, and readonly roles where relevant

---

## TS-01: Installation and Startup

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 1.1 | P | Fresh install | `bun install`, `cp .env.example .env`, edit credentials, `bun src/backend/db/migrate.js` | "Database migration complete." printed, `chadmin.db` created |
| 1.2 | P | Dev mode startup | `bun run dev` | Vite starts on :5173, no errors except echarts chunk size |
| 1.3 | P | Production build | `bun run build` | "built in Xs", dist/ created with index.html |
| 1.4 | P | Production start | `bun src/backend/server.js` | Server starts on :3000, prints loaded routes count |
| 1.5 | P | Missing dist error | Delete dist/, run `bun src/backend/server.js` | Returns JSON error with "Frontend not built" and `bun run build` instruction |
| 1.6 | P | Missing migration | Delete chadmin.db, start server, visit /api/backups | Returns 500 with "re-run the database migration" message |
| 1.7 | N | Missing .env file | Delete .env, run `bun src/backend/server.js` | Clear error about missing environment config, does not crash silently |
| 1.8 | N | Invalid port | Set PORT=99999 in .env | Error about invalid port, does not bind |
| 1.9 | N | Wrong DB path | Set DB_PATH=/nonexistent/path/db | Error about DB creation, does not crash |
| 1.10 | N | Corrupt chadmin.db | Replace chadmin.db with random bytes, start server | Error about corrupt database, suggests re-migration |
| 1.11 | E | Double migration | Run `bun src/backend/db/migrate.js` twice | Second run is idempotent, no error, no data loss |
| 1.12 | E | Build with no node_modules | Delete node_modules/, run `bun run build` | Clear error, not a cryptic stack trace |
| 1.13 | E | Start with port in use | Start two server instances on same port | Second instance fails with "port in use" |
| 1.14 | E | Very long env values | Set SUPER_ADMIN_1 to a 500-char string | Handled gracefully, truncated or rejected |

---

## TS-02: Authentication

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 2.1 | P | Login success | Enter correct username/password | Redirected to Cluster Overview, JWT stored |
| 2.2 | P | Login failure | Enter wrong password | Error message shown, stays on login page |
| 2.3 | P | Login empty fields | Submit with blank username or password | Validation error |
| 2.4 | P | Session expiry | Wait for JWT to expire (or manually delete token) | Redirected to login on next navigation |
| 2.5 | P | Change own password | User dropdown > Change My Password > enter current + new password | Success toast, can login with new password |
| 2.6 | P | Change password wrong current | Enter incorrect current password | Error toast with "incorrect" message |
| 2.7 | P | Sign out | User dropdown > Sign Out | Redirected to login page, token cleared |
| 2.8 | P | Role badge display | Login as superadmin, then as regular user | Superadmin sees amber badge, readonly sees gray badge |
| 2.9 | N | SQL injection in username | Enter `admin' OR '1'='1` as username | Login fails, no SQL injection |
| 2.10 | N | XSS in login fields | Enter `<script>alert(1)</script>` as username | Rendered as text, not executed |
| 2.11 | N | Tampered JWT | Modify JWT payload in localStorage, make request | 401 Unauthorized, redirected to login |
| 2.12 | N | Expired JWT reuse | Save a JWT, wait for expiry, replay it | 401 Unauthorized |
| 2.13 | E | Empty password change | Submit change password form with all blank fields | Validation error, not a server crash |
| 2.14 | E | Unicode username | Create user with emoji or CJK characters in name | Either accepted and works, or clear validation error |
| 2.15 | E | Rapid login attempts | Submit wrong password 10 times in 5 seconds | Rate limited (429), not locked out permanently |
| 2.16 | E | Concurrent sessions | Login from two browsers simultaneously | Both sessions work independently |

---

## TS-03: Navigation Bar

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 3.1 | P | Three-zone layout | Observe navbar | Brand left, connection center, actions right |
| 3.2 | P | Node selector | Click node dropdown | Lists all configured nodes by friendly name |
| 3.3 | P | Switch node | Select a different node | User/password fields update to that node's credentials |
| 3.4 | P | Test connection | Click plug icon | Green indicator on success, red with error on failure |
| 3.5 | P | Refresh button | Click Refresh | Page data reloads, node list refreshes |
| 3.6 | P | Docs link | Click Docs | Opens /docs/ in new tab |
| 3.7 | P | Theme toggle | Click Light/Dark | Theme switches, icon changes (sun/moon), persists on reload |
| 3.8 | P | Button labels | Observe action buttons | Each has text label: Refresh, Docs, Light/Dark |
| 3.9 | P | Navbar transparency | Scroll content behind navbar | Content visible through navbar at 40% opacity with blur |
| 3.10 | P | Cluster name | Configure a cluster name in Cluster Management | Cluster name appears in navbar center zone |
| 3.11 | N | Test connection - CH down | Stop ClickHouse®, click Test | Red indicator with error message, app still functional |
| 3.12 | N | Test connection - wrong port | Configure node with bad port, click Test | Connection failure reported, no hang |
| 3.13 | N | Switch to removed node | Remove a node in Cluster Management while selected | Falls back to first available node |
| 3.14 | N | No nodes configured | Remove all nodes from Cluster Management | Navbar shows empty dropdown, clear message |
| 3.15 | E | Rapid theme toggles | Click theme button 20 times fast | No flicker, no stuck state, final theme correct |
| 3.16 | E | Very long cluster name | Set 100-char cluster name | Truncated or wraps, doesn't break layout |
| 3.17 | E | Many nodes | Configure max nodes | Dropdown shows all nodes, scrollable if needed |
| 3.18 | E | Refresh during query | Run long query, click Refresh | Query is not interrupted, page data reloads |

---

## TS-04: User Dropdown

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 4.1 | P | Open dropdown | Click username button | Glassy dropdown appears (88% opaque) |
| 4.2 | P | User info shown | Observe dropdown | "Signed in as [username]" with role badge |
| 4.3 | P | Text size slider | Drag slider | Font size changes across entire app in real-time |
| 4.4 | P | Text size + button | Click + button | Font increases by 5%, capped at 200% |
| 4.5 | P | Text size - button | Click - button | Font decreases by 5%, capped at 75% |
| 4.6 | P | Text size scroll | Hover over slider, scroll mouse wheel | Font size changes by 5% per tick |
| 4.7 | P | Text size persists | Change to 120%, reload page | Font size still 120% after reload |
| 4.8 | P | Reset to 100% | Change font, click "Reset to 100%" | Font returns to default, button disappears |
| 4.9 | P | Close on outside click | Open dropdown, click elsewhere | Dropdown closes |
| 4.10 | P | Sign Out | Click Sign Out | Logged out, redirected to login |
| 4.11 | N | Text size beyond max | Spam + button past 200% | Capped at 200%, button stops working |
| 4.12 | N | Text size below min | Spam - button past 75% | Capped at 75%, button stops working |
| 4.13 | N | Clear localStorage font | Delete font size from localStorage, reload | Falls back to 100% default |
| 4.14 | N | Corrupt localStorage | Set font size to "abc" in localStorage, reload | Falls back to 100%, no crash |
| 4.15 | E | Font 200% + long content | Set max font, visit page with long table data | Layout doesn't break, text wraps or truncates |
| 4.16 | E | Font 75% readability | Set min font, read all UI text | Text still legible on all pages |
| 4.17 | E | Dropdown + scroll | Open dropdown, scroll page behind it | Dropdown stays attached to button, closes or follows |
| 4.18 | E | Version strings in dropdown | Observe version info | App version and CH version shown in monospace, read-only |

---

## TS-05: Sidebar

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 5.1 | P | 10 sections visible | Observe sidebar | Overview, Tools, Custom Dashboards, Indexes, Logs, Monitoring, Alerting, Access Control, Backups, Administration |
| 5.2 | P | Section collapse | Click a section header | Section collapses/expands |
| 5.3 | P | Navigation | Click any sidebar item | Correct page loads, URL hash updates |
| 5.4 | P | Active highlight | Navigate to a page | Current page highlighted in sidebar |
| 5.5 | P | Sidebar collapse | Click collapse button at bottom | Sidebar minimizes to icons only |
| 5.6 | P | Auto-collapse on editor | Navigate to SQL Editor | Sidebar automatically collapses |
| 5.7 | P | Restore on navigation | From SQL Editor, click any sidebar item | Sidebar restores to full width |
| 5.8 | P | Renamed labels | Check Indexes section | "Data Skipping Indexes" (not "Secondary Indexes"), "Index Management" |
| 5.9 | P | No plugin sections | Observe all sections | No "Example Plugin" or other plugin sections visible |
| 5.10 | N | Direct URL hash | Type invalid hash like `#/nonexistent` | Shows empty content or 404-like message, no crash |
| 5.11 | N | Rapid navigation | Click 10 different sidebar items in 2 seconds | All pages load correctly, no stale data |
| 5.12 | N | Collapse all sections | Collapse every section header | All collapsed, sidebar still navigable |
| 5.13 | N | Navigate while loading | Click sidebar item while previous page still loading | New page loads, old request doesn't overwrite |
| 5.14 | E | Deep link on fresh load | Open app directly with `#/sql-editor` | SQL Editor loads, sidebar auto-collapses |
| 5.15 | E | Browser back/forward | Navigate A -> B -> C, press Back twice | Returns to A, sidebar highlights correctly |
| 5.16 | E | 26 pages accessible | Click every sidebar item once | All 26 pages load without error |
| 5.17 | E | Collapsed sidebar hover | Collapse sidebar, hover over icons | Tooltips or labels appear for each icon |

---

## TS-06: Cluster Overview

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 6.1 | P | Stat cards | Navigate to Cluster Overview | Shows server version, uptime, databases, tables, parts, disk/memory |
| 6.2 | P | Data loads | Wait for page to load | Tables and cards populated with actual ClickHouse® data |
| 6.3 | P | Fixed scrollbar | Scroll a table | Table caps at ~720px with its own scrollbar |
| 6.4 | P | No horizontal scroll | Resize browser narrower | No global horizontal scrollbar appears |
| 6.5 | N | ClickHouse® disconnected | Disconnect CH, navigate to Overview | Error state shown, not blank cards with 0 |
| 6.6 | N | Slow ClickHouse® | Simulate slow response (large cluster) | Loading indicators shown, page doesn't freeze |
| 6.7 | N | Zero databases | Connect to empty ClickHouse® | Shows 0 for databases/tables, no crash |
| 6.8 | N | Permission denied | Connect with user lacking SELECT on system tables | Graceful error, not 500 |
| 6.9 | E | Very large uptime | Server running 365+ days | Uptime displayed correctly, no overflow |
| 6.10 | E | Many databases | 100+ databases in ClickHouse® | All listed, table scrolls properly |
| 6.11 | E | Refresh mid-load | Click Refresh while data still loading | Previous request cancelled, new one starts |
| 6.12 | E | Theme switch on overview | Toggle theme while stat cards visible | Cards re-render with correct theme colors |

---

## TS-07: Queries Section

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 7.1 | P | Current queries tab | Click tab 1 | Shows running queries with kill buttons, auto-refreshes |
| 7.2 | P | Kill query | Run a long query, click kill | Query terminated, toast confirmation |
| 7.3 | P | Analytics heatmaps | Click Analytics tab | 4 heatmaps: query count, errors, memory, duration |
| 7.4 | P | Heatmap appearance | Observe any heatmap | Faint warm tint (low) to deep amber/brown (high), same on both themes |
| 7.5 | P | Heatmap 0-fill | Check sparse date ranges | Empty cells show as 0 (lightest color), not blank |
| 7.6 | P | Heatmap theme switch | Toggle dark/light while heatmap visible | Colors update immediately (MutationObserver) |
| 7.7 | P | Query kind filter | Select a query kind from dropdown | Heatmaps filter to that type only |
| 7.8 | P | Query log tab | Click tab 3 | Searchable query history with filters |
| 7.9 | P | Single-column layout | Observe heatmap grid | All 4 heatmaps stacked vertically (1 column) |
| 7.10 | N | Kill non-existent query | Query finishes before kill button clicked | Graceful error or "query already finished" toast |
| 7.11 | N | Heatmap no data | Select time range with zero queries | "No data for the selected range" message |
| 7.12 | N | Heatmap very short range | Select 1h range with no activity | Empty heatmap with all cells at lightest tint |
| 7.13 | N | Kill without permission | Login as readonly, try to kill a query | Button disabled or error toast about permissions |
| 7.14 | E | Heatmap 30-day range | Load 30 days of busy data | X-axis auto-thins labels, chart renders without overlap |
| 7.15 | E | Heatmap with single spike | One hour has 10000 queries, rest have 1 | Variance depth scales colors so all cells are distinguishable |
| 7.16 | E | Rapid theme toggle on heatmap | Toggle theme 10 times with heatmap visible | Each toggle fully re-renders, no stale colors |
| 7.17 | E | Heatmap download | Click download button | PNG downloads with correct amber colors |

---

## TS-08: Tables & Parts

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 8.1 | P | Stat cards | Navigate to Tables & Parts | Active, inactive, detached, broken part counts |
| 8.2 | P | Broken parts query | Check broken parts card | Uses `startsWith(name, 'broken')` filter |
| 8.3 | P | Table list | Scroll down | Detailed table list with compression ratios and engines |
| 8.4 | N | No tables in database | Connect to empty ClickHouse® | Shows 0 parts, empty table list |
| 8.5 | N | Permission denied | User lacking system.parts access | Graceful error message |
| 8.6 | E | 1000+ tables | Large cluster with many tables | Table scrolls properly, no rendering lag |
| 8.7 | E | Very large compression ratios | Table with 100x compression | Ratio displayed correctly, no overflow |

---

## TS-09: Merges & Mutations

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 9.1 | P | Auto-refresh | Wait 30 seconds | Data refreshes automatically |
| 9.2 | P | Merge operations | Check merges table | Shows active merges if any running |
| 9.3 | P | Fixed scrollbar | Scroll tables | Each table caps at 720px |
| 9.4 | N | No active merges | Visit when no merges running | Empty state message, not blank table |
| 9.5 | N | No mutations | Visit when no mutations exist | Empty state message |
| 9.6 | E | Many concurrent merges | During heavy insert load | All merges listed, auto-refresh keeps updating |
| 9.7 | E | Stuck mutation | Mutation in is_done=0 for hours | Still displayed, timestamp shows staleness |

---

## TS-10: DDL & Readonly

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 10.1 | P | Single-node setup | Run on single node | Cards show zeros, info banner explains "single-node" |
| 10.2 | P | Multi-node setup | Run on cluster | DDL queue entries displayed |
| 10.3 | P | Promise.allSettled | Disconnect one node, load page | Page loads with partial data (doesn't crash) |
| 10.4 | N | All nodes down | Disconnect all ClickHouse® nodes | Error state, not a spinner forever |
| 10.5 | N | Permission denied | User without system.distributed_ddl_queue access | Graceful error |
| 10.6 | E | Many DDL entries | 500+ DDL queue entries | Table scrolls, no rendering lag |
| 10.7 | E | Failed DDL entry | DDL entry with exception in status | Error shown in table row, not hidden |

---

## TS-11: SQL Editor

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 11.1 | P | Database explorer | Observe left panel | Lists databases and tables, resizable via drag handle |
| 11.2 | P | Explorer resize | Drag right edge of explorer | Width changes between 160-500px, cursor shows col-resize |
| 11.3 | P | Explorer collapse | Click collapse toggle | Explorer hides, editor takes full width |
| 11.4 | P | Run SELECT query | Type `SELECT 1`, click Run | Results displayed in table, query stats shown |
| 11.5 | P | Query stats | Run any query | Stats bar shows read rows, written rows, bytes, elapsed |
| 11.6 | P | SQL input collapse | Click collapse arrow on SQL input | Input area collapses, more room for results |
| 11.7 | P | Fullscreen mode | Click fullscreen button | Editor fills entire viewport |
| 11.8 | P | EXPLAIN AST graph | Run `EXPLAIN AST graph=1 SELECT 1` | Auto-enters fullscreen, tree top-to-bottom, color-coded, labels wrapped |
| 11.9 | P | EXPLAIN Pipeline graph | Run `EXPLAIN PIPELINE graph=1 SELECT ...` | Auto-enters fullscreen, tree with pipeline steps, centered |
| 11.10 | P | EXPLAIN PLAN JSON | Run `EXPLAIN json=1 SELECT ...` | Formatted JSON output |
| 11.11 | P | Tree color categories | Run complex EXPLAIN | Different colors for ReadFrom, Filter, Sort, Aggregate, Join, Transform, Output |
| 11.12 | P | Tree node size | Observe tree nodes | symbolSize 12 (scales with zoom) |
| 11.13 | P | Tree text wrapping | Run EXPLAIN with long node names | Names wrap at ~18 chars at camelCase/word boundaries |
| 11.14 | P | Tree scrolling | Run complex EXPLAIN with many nodes | Scrollable in fullscreen, centered |
| 11.15 | P | Sidebar auto-collapse | Navigate to SQL Editor | Sidebar collapses to give editor more space |
| 11.16 | P | Editor scrollbar | Run query returning many rows | Results table uses flex:1 with no max-height cap |
| 11.17 | P | Tree exit fullscreen | Click minimize button on EXPLAIN graph | Graph hidden, results table visible |
| 11.18 | N | Empty query | Click Run with empty input | Validation error or "no query" toast, no server call |
| 11.19 | N | Syntax error | Run `SELEC 1` (typo) | ClickHouse® error message displayed, not a crash |
| 11.20 | N | Query timeout | Run `SELECT sleep(300)` | Times out with error message, UI stays responsive |
| 11.21 | N | Non-EXPLAIN as graph | Run `SELECT 1` | Normal results table, no tree graph attempt |
| 11.22 | N | EXPLAIN no graph | Run `EXPLAIN AST SELECT 1` (without graph=1) | Text table result, not a tree |
| 11.23 | N | Readonly user runs INSERT | Login as readonly, run `INSERT INTO ...` | Permission error from ClickHouse® |
| 11.24 | N | DROP TABLE attempt | Run `DROP TABLE system.query_log` | ClickHouse® rejects, error displayed |
| 11.25 | E | Very wide results | Query returning 50+ columns | Horizontal scroll on results table, no layout break |
| 11.26 | E | 10000 row result | Run `SELECT * FROM system.query_log LIMIT 10000` | Results render without browser freeze |
| 11.27 | E | EXPLAIN on complex query | EXPLAIN AST graph=1 on 20-table join | Large tree renders, scrollable, zoom works |
| 11.28 | E | Rapid Run clicks | Click Run button 10 times fast | Only one query executes, button disabled during run |
| 11.29 | E | Tree zoom range | Zoom to 30% and 300% on EXPLAIN graph | Both extremes render, symbolSize scales proportionally |
| 11.30 | E | EXPLAIN then SELECT | Run EXPLAIN graph, exit fullscreen, run SELECT | Results table appears, no stale graph data |
| 11.31 | E | Explorer with 100 databases | Connect to ClickHouse® with many databases | Explorer lists all, scrollable |

---

## TS-12: Custom Dashboards

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 12.1 | P | Chart Builder | Navigate to Chart Builder | Form with SQL input, chart type picker |
| 12.2 | P | Create chart | Enter SQL, select chart type, configure axes, save | Chart saved, visible in All Charts |
| 12.3 | P | All chart types | Open chart type dropdown | All types: line, bar, area, scatter, pie, donut, gauge, funnel, heatmap, treemap, sankey, KPI, data table |
| 12.4 | P | Dashboard view | Create dashboard, add charts | Dashboard renders with configured column layout |
| 12.5 | P | All Charts | Navigate to All Charts | All saved charts listed |
| 12.6 | N | Save chart without SQL | Leave SQL blank, click Save | Validation error |
| 12.7 | N | Invalid SQL in chart | Enter `SELEC 1`, save and render | Error displayed on chart, not a crash |
| 12.8 | N | Delete chart used in dashboard | Delete a chart that's on a dashboard | Chart removed from dashboard (SET NULL), dashboard doesn't break |
| 12.9 | N | Readonly creates chart | Login as readonly, try to save chart | Permission error |
| 12.10 | E | Very long SQL query | 5000-char SQL in chart builder | Accepted, textarea scrolls |
| 12.11 | E | Dashboard with 20 charts | Add 20 charts to one dashboard | All render, page scrollable |
| 12.12 | E | Chart with 0 data points | SQL returns empty result | Chart shows empty state, not a JS error |
| 12.13 | E | Duplicate chart names | Create two charts with same name | Both saved (names are not unique keys) |

---

## TS-13: Indexes

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 13.1 | P | Data Skipping Indexes | Navigate to page | Tree visualization of indexes centered in scroll container |
| 13.2 | P | Tree zoom | Click + and - zoom buttons | Tree scales up/down with symbolSize, scrollbars adjust |
| 13.3 | P | Index Management | Navigate to page | Three tabs: Create, Materialize, Drop |
| 13.4 | P | Create index | Fill form with granularity, ON CLUSTER, IF NOT EXISTS | SQL preview updates, execution works |
| 13.5 | P | Drop index | Switch to Drop tab, select index | DROP INDEX SQL generated and executed |
| 13.6 | P | Projections | Navigate to Projections | View, add, drop, materialize, clear buttons |
| 13.7 | P | Projection tree | Observe projection tree | Centered, zoom controls, symbolSize 12 |
| 13.8 | N | No indexes exist | Select database with no indexes | "No indexes found" empty state |
| 13.9 | N | No projections exist | Select database with no projections | "No projections found" empty state |
| 13.10 | N | Create index bad SQL | Enter invalid expression in index form | ClickHouse® error displayed |
| 13.11 | N | Drop index - readonly user | Login as readonly, try to drop | Permission error or button disabled |
| 13.12 | E | Tree with 100+ indexes | Database with many indexes | Tree auto-sizes, scrollable, centered |
| 13.13 | E | Very long index expression | Index expression with 200 chars | Label wraps or truncates, doesn't break tree layout |
| 13.14 | E | Zoom to 300% on index tree | Zoom all the way in | Tree enlarges, scrollbars appear, symbolSize scales |
| 13.15 | E | Zoom to 30% on index tree | Zoom all the way out | Tree shrinks, still readable |

---

## TS-14: Logs

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 14.1 | P | Crash Log overview | Navigate, click Overview tab | Calendar heatmap of crash events |
| 14.2 | P | Crash Log search | Click Search tab | Filterable list with query, signal, exception filters |
| 14.3 | P | Error Log overview | Navigate to Error Log | Heatmap with error type filter dropdown |
| 14.4 | P | Error Log multi-select | Select multiple error types | Table filters to selected types |
| 14.5 | P | Text Log levels | Navigate to Text Log | Log level filter (Fatal through Test) |
| 14.6 | P | Text Log colors (dark) | Switch to dark mode | Trace=#6ee7b7, Information=#60a5fa, Fatal=#fb7185 |
| 14.7 | P | Text Log colors (light) | Switch to light mode | Trace=#2E7D32, Information=#1565C0, Fatal=#880E4F |
| 14.8 | P | Log table scrollbar | Check all 3 log search tabs | All use variant="single" |
| 14.9 | N | Empty log tables | ClickHouse® with no crash/error/text logs | Empty state message on each page |
| 14.10 | N | Heatmap no data range | Select time range with zero events | "No data for the selected range" |
| 14.11 | N | Invalid time range | Set "from" after "to" | Graceful handling, no crash |
| 14.12 | N | Log table permission denied | User without system.crash_log access | Error message, not blank page |
| 14.13 | E | 30-day heatmap range | Load heatmap for 30 days on busy server | Auto-thins x-axis labels, renders without overlap |
| 14.14 | E | 100000 log entries | Search tab with huge result set | Table scrolls, pagination or virtual scroll |
| 14.15 | E | Rapid tab switching | Switch Overview/Search 10 times fast | No stale data, correct tab content shown |
| 14.16 | E | Theme toggle on heatmap | Toggle theme while crash log heatmap visible | Heatmap fully re-renders with amber scale |

---

## TS-15: Monitoring

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 15.1 | P | Load charts | Select time range, click Load Charts | 70+ charts rendered across tabs |
| 15.2 | P | Tab navigation | Click through all tabs | Each tab shows relevant charts |
| 15.3 | P | Time range | Change time range and rounding interval | Charts reload with new data |
| 15.4 | N | ClickHouse® down | Disconnect CH, load monitoring | Error state on charts, not blank |
| 15.5 | N | No metrics data | Fresh ClickHouse® with no history | Charts show empty state or flat lines |
| 15.6 | E | Very wide time range | Select 365-day range | Charts render without browser freeze |
| 15.7 | E | Rapid tab switching | Click through all tabs in 3 seconds | All load correctly, no stale chart data |

---

## TS-16: Alerting

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 16.1 | P | Create channel | Add email/slack/webhook channel | Channel saved |
| 16.2 | P | Test channel | Click Test on a channel | Test notification sent |
| 16.3 | P | Create alert rule | Add rule with SQL, cron, threshold, severity, channel | Rule saved |
| 16.4 | P | Enable/disable rule | Toggle rule enabled state | Rule status updates |
| 16.5 | P | Alert evaluation | Wait for cron to fire | Rule evaluates, last_run and last_value update |
| 16.6 | N | Create channel without name | Leave name blank, save | Validation error |
| 16.7 | N | Invalid webhook URL | Enter `not-a-url` as webhook | Validation error on save |
| 16.8 | N | Invalid cron expression | Enter `* * * *` (too few fields) | Validation error |
| 16.9 | N | Alert SQL syntax error | Enter `SELEC 1` as alert SQL | Error on evaluation, last_error updated |
| 16.10 | E | 50 alert rules | Create many rules | All listed, scheduler handles them |
| 16.11 | E | Channel used by multiple rules | Delete channel used by 3 rules | Rules updated (cascade or error) |
| 16.12 | E | Very frequent cron | Set `* * * * *` (every minute) | Runs every minute without overlap |
| 16.13 | E | Alert returns no rows | SQL returns empty result | Handled as 0 or skip, not an error |

---

## TS-17: RBAC

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 17.1 | P | View Grants | Navigate to View Grants | Tree chart of all GRANT statements, centered |
| 17.2 | P | Grant tree zoom | Use zoom buttons on tree | Tree scales, symbolSize changes, scrollbars adjust |
| 17.3 | P | Users list | Navigate to RBAC Users | Lists all ClickHouse® users |
| 17.4 | P | Roles list | Navigate to RBAC Roles | Lists all roles |
| 17.5 | P | Settings Profiles | Navigate to RBAC Profiles | Lists settings profiles |
| 17.6 | P | Scrollbar variants | Check each RBAC page | Users/Roles = single, Grants/Profiles = fixed |
| 17.7 | N | No users in ClickHouse® | Connect to CH with no users (besides default) | Shows default user only, no crash |
| 17.8 | N | No roles defined | Connect to CH with no roles | Empty state on Roles page |
| 17.9 | N | User with no grants | Select user with zero grants in tree | Tree shows user node with no children |
| 17.10 | N | Permission denied | User without system.grants access | Error message, not blank tree |
| 17.11 | E | User with 100+ grants | Select user with many GRANT statements | Tree auto-sizes, scrollable |
| 17.12 | E | Very long grant string | GRANT on database.table.column with long names | Label doesn't break tree layout |
| 17.13 | E | Role tree zoom 300% | Zoom all the way in on role tree | Scales correctly, scrollbars work |
| 17.14 | E | Theme switch on grant tree | Toggle theme while tree visible | Tree re-renders with correct label colors |

---

## TS-18: Backups - Storage Profiles

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 18.1 | P | Create profile | Fill form: name, type (S3/GCS), bucket, endpoint, credentials | Profile saved |
| 18.2 | P | Test connection | Click Test on profile | Probe runs, success or error reported |
| 18.3 | P | Edit profile | Click Edit, change bucket | Profile updated |
| 18.4 | P | Duplicate name | Try creating profile with existing name | Error: duplicate name |
| 18.5 | P | Delete profile | Click Delete | Profile removed |
| 18.6 | N | Create without name | Leave name blank, save | Validation error |
| 18.7 | N | Create without bucket | Leave bucket blank, save | Validation error |
| 18.8 | N | Invalid endpoint URL | Enter `not-a-url` for endpoint | Validation error or connection test fails |
| 18.9 | N | Delete profile used by schedule | Try deleting profile that a schedule references | Error or confirmation warning |
| 18.10 | E | 20 storage profiles | Create many profiles | All listed, page scrolls |
| 18.11 | E | Very long bucket name | 100-char bucket name | Accepted or truncated, doesn't break layout |
| 18.12 | E | Special chars in credentials | Access key with + / = characters | Handled correctly, not URL-encoded |
| 18.13 | E | Edit all fields | Change every field on a profile, save | All changes persisted |

---

## TS-19: Backups - Manual Backup

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 19.1 | P | Backup ALL | Select scope=ALL, profile, click Execute | Backup executes, success toast |
| 19.2 | P | Backup DATABASE | Select scope=DATABASE, pick database | SQL preview shows `BACKUP DATABASE {name}` |
| 19.3 | P | Backup TABLE | Select scope=TABLE, pick database then table | SQL preview shows `BACKUP TABLE {db}.{table}` |
| 19.4 | P | SQL preview updates | Change every dropdown | SQL preview updates live |
| 19.5 | P | ON CLUSTER | Select a cluster | SQL shows `ON CLUSTER '{name}'` |
| 19.6 | P | ASYNC toggle | Check ASYNC | SQL shows `BACKUP ASYNC ALL TO ...` |
| 19.7 | P | EXCEPT TABLES | Enter exception | SQL shows `EXCEPT TABLES ...` |
| 19.8 | P | S3 error - bad credentials | Use wrong S3 keys | Error: "S3 authentication failed..." |
| 19.9 | P | S3 error - bad endpoint | Use wrong endpoint URL | Error: "Cannot reach S3 endpoint..." |
| 19.10 | P | S3 error - bad bucket | Use wrong bucket name | Error: "S3 bucket not found..." |
| 19.11 | P | List backups for restore | Switch to RESTORE, click List Available Backups | Shows backups sorted newest first |
| 19.12 | P | Scope filter on restore | Backup ALL + DATABASE, restore with scope=DATABASE | Only DATABASE backups listed |
| 19.13 | P | Restore execution | Select a backup, click Execute RESTORE | Restore executes |
| 19.14 | P | Manifest written | After backup, check S3 | `manifest.json` at correct path |
| 19.15 | N | Execute without profile | Click Execute with no profile selected | Validation error |
| 19.16 | N | Execute without scope | Click Execute with no scope selected | Validation error |
| 19.17 | N | Restore non-existent backup | Manually enter bad backup ID | ClickHouse® error, clear message |
| 19.18 | N | Readonly user backup | Login as readonly, try to execute backup | Permission error or button disabled |
| 19.19 | E | Backup large database | Database with 100GB of data | Backup starts, progress can be tracked via ASYNC |
| 19.20 | E | Concurrent backups | Start two backups simultaneously | Both succeed or second queued, no corruption |
| 19.21 | E | Restore to non-empty table | Restore backup over existing data | ClickHouse® behavior (error or overwrite), displayed correctly |
| 19.22 | E | Very long EXCEPT TABLES | Enter 20 table exceptions | SQL preview shows all, doesn't truncate |


## TS-20: Backups - Available Backups

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 20.1 | P | Scan S3 | Select profile, click Scan S3 | Table shows all found backups |
| 20.2 | P | Filter - All | Select All Backups filter | Shows manual |
| 20.3 | P | Filter - Manual Only | Select Manual Only | Shows only manual backups |
| 20.4 | P | Type badges | Observe Type column | MANUAL (green) or SCHEDULED (blue) badges |
| 20.5 | P | Full/Inc badges | Observe Incremental column | FULL (green) or INC (amber) badges |
| 20.6 | P | Newest first | Create 2 backups, scan | Most recent at top |
| 20.7 | N | Empty bucket | Scan bucket with no backups | Toast: "No backups found" |
| 20.8 | N | No profile selected | Click Scan without selecting profile | Toast: "Select a storage profile" |
| 20.9 | N | S3 unreachable | Wrong endpoint, click Scan | Error message about unreachable S3 |
| 20.10 | N | Invalid credentials | Wrong access key, click Scan | Auth error displayed |
| 20.11 | E | 100 backups | Scan bucket with many backups | All listed, table scrolls |
| 20.12 | E | manual  | Backups of both types | Filters correctly separate them |
| 20.13 | E | Rapid scan clicks | Click Scan 5 times fast | Only one scan runs, button disabled during scan |
| 20.14 | E | Scan after deleting profile | Delete the selected profile, click Scan | Error or "select a profile" message |

---

## TS-21: User Management

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 21.1 | P | View user list | Navigate to User Management | All users listed with role badges (amber/purple/blue/gray) |
| 21.2 | P | Create user with role | Fill form, select role, click Create | User created, random password shown |
| 21.3 | P | Role dropdown (superadmin) | Open create form as superadmin | Shows superadmin, admin, editor, readonly |
| 21.4 | P | Role dropdown (admin) | Open create form as admin | Shows admin, editor, readonly (no superadmin) |
| 21.5 | P | Non-admin buttons | Login as editor or readonly | Buttons greyed, no New User button |
| 21.6 | P | Role change dialog | Change a user's role | Confirmation dialog: "Change username from X to Y?" |
| 21.7 | P | Role change confirm | Click Confirm | Role updated, toast success |
| 21.8 | P | Role change cancel | Click Cancel | Role reverts, no API call |
| 21.9 | P | Self password change | Click Change My Password | Form opens, new-user form closes |
| 21.10 | P | Delete user | Click Delete on lower-level user | Confirmation, then removed |
| 21.11 | N | Cannot delete self | Try to delete own account | Error message |
| 21.12 | N | Cannot delete higher level | Admin tries to delete superadmin | Button disabled |
| 21.13 | N | Superadmin changes superadmin | Superadmin tries to change another superadmin's role | No dropdown shown, just badge |
| 21.14 | N | Admin changes admin | Admin tries to change another admin | No dropdown shown |
| 21.15 | N | Create duplicate username | Create user with existing username | Error: unique constraint |
| 21.16 | N | Readonly tries create | Login as readonly, look for New User | Button not present |
| 21.17 | E | 50 app users | Create many users | All listed, table scrolls |
| 21.18 | E | Very long username | Create user with 100-char name | Accepted or clear validation error |
| 21.19 | E | Rapid role changes | Change role back and forth 5 times | Each triggers confirm dialog, final state correct |
| 21.20 | E | Delete last superadmin | Try to delete the only remaining superadmin | Error: cannot delete last superadmin |

---

## TS-22: Cluster Management

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 22.1 | P | Add node | Click Add, fill all fields | Node added to list |
| 22.2 | P | Node name required | Leave name blank, save | Error: "Node Name is required" |
| 22.3 | P | Duplicate name | Add two nodes with same name | Error: "Duplicate node name" |
| 22.4 | P | Case-insensitive duplicate | Add "Prod-1" then "prod-1" | Error: duplicate detected |
| 22.5 | P | Max 3 clusters, 18 total nodes | Add 4th cluster or exceed 18 nodes | Error message shown |
| 22.6 | P | Test connection | Click Test on a node | Success/failure reported |
| 22.7 | P | Save updates navbar | Save changes | Navbar dropdown updates immediately |
| 22.8 | P | Edit node | Change host/port, save | Node updated |
| 22.9 | P | Remove node | Click remove, save | Node removed from list and navbar |
| 22.10 | P | HTTPS toggle | Check HTTPS on a node | Connection uses HTTPS |
| 22.11 | N | Empty host | Leave host blank, save | Validation error |
| 22.12 | N | Invalid port | Enter "abc" for port, save | Validation error |
| 22.13 | N | Port out of range | Enter 99999 for port | Validation error |
| 22.14 | N | Readonly manages cluster | Login as readonly, visit Cluster Management | Read-only view or permission error |
| 22.15 | E | Remove currently selected node | Remove node that's active in navbar, save | Falls back to first available |
| 22.16 | E | Remove all nodes | Remove every node, save | Empty navbar dropdown, clear message |
| 22.17 | E | Very long node name | 100-char node name | Accepted, truncated in dropdown |
| 22.18 | E | Special chars in host | Host with underscores, hyphens | Accepted, connection works |

---

## TS-23: Scrollbar System

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 23.1 | P | dt-single pages | Visit CrashLog, ErrorLog, TextLog, RBAC Users, Roles, User Management, All Charts | Table height adapts to viewport |
| 23.2 | P | dt-fixed pages | Visit Cluster Overview, DDL, Tables & Parts, Merges, RBAC Grants, Profiles | Each table caps at 720px |
| 23.3 | P | Editor results | Run query in SQL Editor | Results table uses flex:1, no height cap |
| 23.4 | P | No horizontal scroll | Resize window on any page | No global horizontal scrollbar |
| 23.5 | N | Very narrow window | Resize to 800px width | Layout doesn't break, may show horizontal scroll |
| 23.6 | N | Empty table | Visit page with no data | Table shows empty state, scrollbar area still correct |
| 23.7 | E | 10000 rows in dt-single | Table with many rows | Viewport-based scrollbar works smoothly |
| 23.8 | E | Resize window with data | Resize window while table has data | Table height adjusts, no layout jump |

---

## TS-24: Theme System

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 24.1 | P | Dark mode default | Load app fresh | Dark theme active |
| 24.2 | P | Toggle to light | Click theme button | Light mode with brighter colors |
| 24.3 | P | Toggle back | Click again | Dark mode restored |
| 24.4 | P | Persistence | Toggle to light, reload | Light mode persists |
| 24.5 | P | Navbar transparency | Both themes | Navbar 40% opaque with 40px backdrop blur |
| 24.3 | P | Table header transparency | Both themes | Table headers 35-40% opaque with 20px blur |
| 24.7 | P | Glass dropdown | Both themes | User dropdown 88% opaque |
| 24.8 | P | Modal glass | Open any confirm modal | Uses glass-dropdown background |
| 24.9 | N | Corrupt theme in localStorage | Set theme to "invalid" in localStorage, reload | Falls back to dark default |
| 24.10 | N | Delete theme from localStorage | Clear theme storage, reload | Falls back to dark default |
| 24.11 | N | Theme during modal | Toggle theme while modal open | Modal background updates correctly |
| 24.12 | N | Theme during heatmap load | Toggle theme while heatmap loading | Heatmap renders with correct theme after load |
| 24.13 | E | 50 rapid toggles | Click theme 50 times fast | Final state correct, no visual glitches |
| 24.14 | E | Theme on every page | Toggle theme while visiting each of 26 pages | All pages render correctly in both themes |
| 24.15 | E | Theme + font size combo | Set 200% font + light theme | Layout doesn't break |
| 24.16 | E | Heatmap + tree + table themes | Have heatmap, tree, and table visible, toggle | All three re-render correctly |

---

## TS-25: Toast Notifications

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 25.1 | P | Success toast | Perform successful action | Green toast appears |
| 25.2 | P | Error toast | Trigger error | Red toast appears |
| 25.3 | P | Warning toast | Trigger warning | Amber toast appears |
| 25.4 | P | Info toast | Trigger info | Blue toast appears |
| 25.5 | P | Auto-dismiss | Wait 10 seconds | Toast disappears automatically |
| 25.6 | P | Manual dismiss | Click X before 10s | Toast dismissed immediately |
| 25.7 | N | Multiple errors | Trigger 5 errors rapidly | All 5 toasts stack, don't overlap each other |
| 25.8 | N | Very long error message | Trigger error with 500-char message | Toast wraps text, doesn't extend off screen |
| 25.9 | E | 20 simultaneous toasts | Trigger 20 actions rapidly | Toasts queue or stack without breaking layout |
| 25.10 | E | Toast + page navigation | Toast appears, navigate to different page | Toast persists or clears gracefully |

---

## TS-26: Font System

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 26.1 | P | UI font | Observe labels, buttons, nav | Geist Sans |
| 26.2 | P | Table font | Observe data table cells | B612 |
| 26.3 | P | Stat card font | Observe stat card values | Mona Sans |
| 26.4 | P | Chart font | Observe chart axis labels | Red Hat Mono |
| 26.5 | P | Code font | Observe SQL editor, code blocks | Fira Code |
| 26.6 | N | Font CDN unreachable | Block font CDN, reload | Fallback system fonts render, no blank text |
| 26.7 | N | Slow font load | Throttle network, reload | Text visible with system font, swaps to custom when loaded |
| 26.8 | E | All 5 fonts on one page | Visit page with all font contexts | No font conflicts or flashing |
| 26.9 | E | Font + 200% zoom | Max font size with custom fonts | All fonts still render at correct family |

---

## TS-27: Error Handling

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 27.1 | P | ClickHouse® down | Stop ClickHouse®, try any query | Clear error message, not a crash |
| 27.2 | P | S3 unreachable | Wrong S3 endpoint, try backup listing | "Cannot reach S3 endpoint" |
| 27.3 | P | S3 bad auth | Wrong S3 keys, try backup | "S3 authentication failed" |
| 27.4 | P | Missing backup table | Delete chadmin.db, visit Scheduled Backups | "re-run the database migration" |
| 27.5 | P | Network error | Disconnect network, try action | Error toast with descriptive message |
| 27.6 | N | Partial network failure | Network drops mid-request | Request times out, error shown, app recoverable |
| 27.7 | N | ClickHouse® returns 500 | Force ClickHouse® internal error | Error displayed, not a white screen |
| 27.8 | N | API returns HTML instead of JSON | Misconfigured proxy returns HTML | Graceful parsing error, not a crash |
| 27.9 | N | Concurrent error + success | Two requests: one fails, one succeeds | Both results shown correctly |
| 27.10 | E | ClickHouse® reconnect | Stop CH, get error, restart CH, retry | Works again without app restart |
| 27.11 | E | Error on every page | Visit all 26 pages with CH down | Each shows error state, none crash |
| 27.12 | E | Error message i18n | Error with unicode characters | Rendered correctly, no encoding issues |
| 27.13 | E | 500 errors in 1 minute | Trigger many errors rapidly | App stays responsive, toasts don't pile up infinitely |

---

## TS-28: Cross-Browser / Responsive

| # | Type | Test Case | Steps | Expected Result |
|---|------|-----------|-------|-----------------|
| 28.1 | P | Chrome | Run full app in Chrome | All features work |
| 28.2 | P | Firefox | Run full app in Firefox | All features work, backdrop-filter renders |
| 28.3 | P | Safari | Run full app in Safari | -webkit-backdrop-filter works |
| 28.4 | P | Narrow viewport | Resize to 1024px width | No horizontal scroll, layout adjusts |
| 28.5 | P | Wide viewport | Use 2560px+ monitor | Layout fills space appropriately |
| 28.6 | N | Very narrow (768px) | Resize to tablet width | Usable, may have minor layout adjustments |
| 28.7 | N | Internet Explorer | Open in IE | Graceful error or unsupported message |
| 28.8 | E | 4K monitor | Use 3840px display | No blurry elements, layout scales |
| 28.9 | E | Browser zoom 200% | Ctrl++ to 200% browser zoom | Layout still functional |

---

## Test Summary

| Scenario | Positive | Negative | Edge | Total | Priority |
|----------|----------|----------|------|-------|----------|
| TS-01: Installation | 6 | 4 | 4 | 14 | P0 |
| TS-02: Authentication | 8 | 4 | 4 | 16 | P0 |
| TS-03: Navigation Bar | 10 | 4 | 4 | 18 | P0 |
| TS-04: User Dropdown | 10 | 4 | 4 | 18 | P0 |
| TS-05: Sidebar | 9 | 4 | 4 | 17 | P1 |
| TS-06: Cluster Overview | 4 | 4 | 4 | 12 | P1 |
| TS-07: Queries | 9 | 4 | 4 | 17 | P1 |
| TS-08: Tables & Parts | 3 | 2 | 2 | 7 | P2 |
| TS-09: Merges & Mutations | 3 | 2 | 2 | 7 | P2 |
| TS-10: DDL & Readonly | 3 | 2 | 2 | 7 | P2 |
| TS-11: SQL Editor | 17 | 7 | 7 | 31 | P0 |
| TS-12: Custom Dashboards | 5 | 4 | 4 | 13 | P1 |
| TS-13: Indexes | 7 | 4 | 4 | 15 | P2 |
| TS-14: Logs | 8 | 4 | 4 | 16 | P1 |
| TS-15: Monitoring | 3 | 2 | 2 | 7 | P1 |
| TS-16: Alerting | 5 | 4 | 4 | 13 | P1 |
| TS-17: RBAC | 6 | 4 | 4 | 14 | P2 |
| TS-18: Storage Profiles | 5 | 4 | 4 | 13 | P0 |
| TS-19: Manual Backup | 14 | 4 | 4 | 22 | P0 |
| TS-20: Available Backups | 7 | 4 | 4 | 15 | P1 |
| TS-21: User Management | 10 | 6 | 4 | 20 | P1 |
| TS-22: Cluster Management | 10 | 4 | 4 | 18 | P0 |
| TS-23: Scrollbar System | 4 | 2 | 2 | 8 | P2 |
| TS-24: Theme System | 8 | 4 | 4 | 16 | P1 |
| TS-25: Toast Notifications | 6 | 2 | 2 | 10 | P2 |
| TS-26: Font System | 5 | 2 | 2 | 9 | P2 |
| TS-27: Error Handling | 5 | 4 | 4 | 13 | P0 |
| TS-28: Cross-Browser | 5 | 2 | 2 | 9 | P1 |
| **Total** | **209** | **99** | **87** | **395** | |

Legend: P = Positive, N = Negative, E = Edge Case

