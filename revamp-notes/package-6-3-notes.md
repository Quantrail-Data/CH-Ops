# CHOps 2.0 UI revamp: package 6.3 (the reported issues)

Base: package 6.2 (`3f958c2`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 to 6.3; the last commit is `b5ccaaf`.

Run `bun install` first.

## Fixes

| # | Page | Cause | Fix |
|---|---|---|---|
| 1 | Monitoring > Playback | A bug from before the revamp: the Storage Profiles style `input:read-only { opacity: 0.3 }` also matched sliders, check boxes and radio buttons, so they showed at 30% strength on all pages. | The style now matches only fields with the `readonly` attribute. The slider track is a little darker. |
| 2 | Monitoring > System Dashboards | The tab bar hides its scroll bar, so hidden tabs did not show. | New `ScrollableTabBar`: left and right arrow buttons and a soft edge when tabs are hidden; the open tab scrolls into view. System Dashboards is the only page with hidden tabs at 1280 px. |
| 3 | Kubernetes connection and Insights > Health | No colors for the check states. | Green check: passed. Red question mark: could not run. Amber triangle: failed (as before). The "Connected" notice in Cluster Management is green. |
| 4 | Qurioz AI | (a) A disabled button was transparent with a white icon, so it did not show on white. (b) A bug from before the revamp: the new-chat screen used `!isLoading`, so the send and microphone buttons always looked disabled there. (c) The microphone icon was grey on the accent color. | A visible grey disabled style; the new-chat screen uses the same rule as the chat screen; the icon takes the white color. |
| 5 | Kubernetes Insights > Logs | Fields of different heights (dropdown 36 px, line count 42 px, switch box 40 px, button 32 px). | One row, all 32 px. The From field is the shared date picker. A "Read at <date, time>" line (before the first read: "Tab opened at ..."). The shared dropdown is now 2rem high everywhere (it was 36 px; this also aligns the labels on Query Log and other forms). |
| 6 | SQL Editor > Comparison mode | The Current panel header used a see-through tint, so rows showed through the sticky header. | The tint lies over the solid header color, in both panels. |
| 7 | Database Schema & Estimate dialog | The dialog set `position: relative`, which replaced the fixed position of the modal; the centering moved its top off the screen. | Removed. The two lists fit short windows (at most 28% of the window height each), and the dialog scrolls when needed. |
| 8 | SQL Editor, query with no result table | The logo (20rem) was inside the empty table box (200 px high). | The logo is alone in the middle of the whole results area. |
| 9 | Alert Rules, rule form | | The form is wider (1120 px). The Test button shows "Testing..." and the page scrolls to the results. |
| 10 | Query Profiler > View Generated SQL | The SQL box had the page color as its background. | The section is a card, with the SQL in a code panel. |
| 11 | All pages | | The floating search button is removed. The navbar search and Ctrl+K stay. The bug report button moves down to its place. |
| 12 | Kubernetes Insights | When the connected cluster is a Direct cluster, the page showed the first Kubernetes cluster. | An empty state: "Switch to Kubernetes mode to view Kubernetes Insights.", with the name of the connected cluster. |
| 13 | Index Management > Drop | No confirmation. | A confirmation dialog (as on Projections). |
| 14 | Alert Rules, templates | The rule was not deleted: by design, the page hides template rules that are off, unless "Show template rules that are off" is on. So the card disappeared. | A rule that you disable stays on the page with an "Enable" button until a reload, and a message says where to find it later. |
| 15 | Alert Rules, cards | A click anywhere on the card opened the rule. | Only the Edit button opens it. The rule name is still a button that opens the rule: for users who cannot edit, it is the only way to read the SQL. Tell me if you want it removed too. |
| 16 | Charts, Download | The export took the picture of the current (zoomed) view. | You approved this exception. `fullChartDataURL()` sets the zoom to 100% with the animation off, takes the picture, then puts the zoom back. Used by all charts with the shared chart toolbar (Daily Summary, Queries > Analytics, Query Metrics, Cluster Overview, dashboards, logs), the Log heatmap and the SQL Editor graph. Tested in the browser: the picture after a zoom is the same as without zoom, and the zoom stays. |
| 17 | Docs | The docs page had its own old theme. | Midnight fonts and colors in both themes, no gradient washes or glass blur, the app's icon button for the theme toggle. |

## Limits

- **Playback charts** use the built-in ECharts save button, not the shared toolbar. Their download still takes the current view. I can change them to the shared download in a later step.
- **Docs screenshots:** the docs have no screenshots or images at all, so there were none to replace. I can add screenshots of the main pages if you want them.
- **Docs check:** I could not open the docs here (they load Docsify from a CDN, and my test environment did not allow that). Please check them in your browser.
- **Checked only by code and unit tests**, because the test data does not reach these states: the Schema & Estimate dialog (needs an AI login), the SQL Editor logo (needs a ClickHouse login in the editor), the drop confirmation (the test data has no tables with indexes), the generated SQL card, the comparison header.
- **Checked in the browser with mocked Kubernetes answers:** the Direct-mode empty state, the health check colors and the Logs row.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2202 frontend tests pass. `bun run lint`: 0 errors (the same 5 warnings).
- New: `tests/frontend/package-6-3-fixes.test.jsx` (17 tests).
- Changed: `tests/frontend/global-search.test.js` (no floating button), `tests/frontend/chart-guard.json` (ChartToolbar.jsx and LogHeatmap.jsx, with the approved exception note).

## Visual check results

Full check on all pages (normal and stress data, 3 screen sizes, both themes), against the package 6 baseline:

- No missing API calls, no page errors, no new accessibility problems.
- Charts: no chart changed size or options. On 8 pages, charts moved up by 4 px: the shared dropdown is now 32 px high (was 36 px).
- Layout reports that are not real problems: content scrolled under the footer; tabs scrolled out of the System Dashboards tab bar; the new rule form covers the page title while it is open.

## Memory gates and a build mistake

All memory gates pass on a production build: idle CPU on Home 3.4% with the background animation on (limit 5%), 1.0% off (limit 3%). The 6.2 build measures 3.6% and 1.0%, so 6.3 adds no CPU.

**My mistake, found in this package:** `bun run` loads `.env`, and your `.env` has `NODE_ENV=development`. So every `bun run build` that I made in the repo folder was a development build of React: bigger and slower. My earlier numbers came from these builds:

| Measure | Reported before (development build) | Production build |
|---|---|---|
| Main JavaScript file | 473 KB | 272 KB |
| Idle CPU, animation on | 3.8% to 4.9% | 3.4% |
| Idle CPU, animation off | 1.8% to 2.4% | 1.0% |

The gates passed in both cases, so no decision changes. Docker images are not affected: `.dockerignore` leaves out `.env`, and the Dockerfile sets `NODE_ENV=production`.

To prevent this:
- `bun run check:bundle` now fails on a development build, with a message.
- The gate comment gives the production build command: `NODE_ENV=production bun run build`.
- A local production build on your machine needs the same command (or no `NODE_ENV=development` in `.env`).

## What to check

1. Run `bun install`, then `bun run test`. Make sure that all tests pass.
2. Monitoring > Playback, light theme: fetch data. Make sure that the slider dot shows clearly. Look at a page with check boxes (Error Log > Search > Error Type): make sure that the check boxes are not faded.
3. Monitoring > System Dashboards at 1280 px: make sure that an arrow shows at the right end of the tab bar. Click it. Make sure that the hidden tabs show and a left arrow shows.
4. Kubernetes Insights > Health (Kubernetes cluster): make sure that passed checks have a green check and checks that could not run have a red question mark. Cluster Management > Kubernetes > Test connection: make sure that "Connected" is green.
5. Qurioz AI, light theme: make sure that the send and microphone buttons show clearly, on the new-chat screen and in a chat.
6. Kubernetes Insights > Logs: make sure that Pod, From, Lines, Previous container and Read logs are on one line with the same height. Make sure that "Tab opened at ..." shows, and "Read at ..." after you click Read logs.
7. SQL Editor > Comparison: run two queries with many rows. Scroll both result tables. Make sure that the header stays solid in both.
8. SQL Editor and Qurioz: click DB Schema/Estimate. Make sure that the whole dialog shows, with Get Tables, on an HD screen.
9. SQL Editor: run `CREATE TABLE ...` or `INSERT ...`. Make sure that the logo shows in full, in the middle of the results area.
10. Alert Rules > New Rule: make sure that the form is wider. Click Test. Make sure that the button says "Testing..." and the page scrolls to the results.
11. Query Profiler: load queries and open "View Generated SQL". Make sure that the SQL is in a card with a code panel.
12. Make sure that no page has a floating search button at the bottom right. Push Ctrl+K: make sure that the search opens.
13. Select a Direct cluster in the cluster menu. Open Kubernetes Insights. Make sure that the "Switch to Kubernetes mode" message shows.
14. Index Management > Drop: select an index and click Drop Index. Make sure that a confirmation shows. Click Cancel: make sure that the index is still there.
15. Alert Rules: disable a template rule. Make sure that its card stays, with an "Enable" button. Click on the card (not on a button): make sure that the rule does not open.
16. Daily Summary: zoom in on a chart, then click Download. Make sure that the picture shows the whole chart, and that the chart on the page stays zoomed. Do the same on Queries > Analytics and Query Metrics.
17. Open `/docs/` in both themes. Make sure that the fonts and colors match the app.
