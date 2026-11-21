# CHOps 2.0 UI revamp: package 6 (forms, trees, memory, premium touches, clean-up)

Base: package 5 with ports (`58819d6`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 to 6; the last commit is `c43d8b3`.

Package 6 includes the planned package 5.1 (your package 5 test feedback). Both are in this one package, as you asked.

## What this package does

| Step | Change |
|---|---|
| 1. Date picker | The shadcn date picker (Popover, Calendar, time field) replaces the old date/time field. The field shows "13 Nov 2026, 10:18:34", so it is not cut off on HD screens. |
| 2. Search forms | Compact forms on all log, query, monitoring and profiler pages: the fields are only as wide as they need to be, and none is the full width of the card. The fields wrap to a new line and do not overlap. Result columns and SQL filters are in a "More options" section that opens and closes. |
| 3. Buttons | One button size everywhere: 2rem high (small 1.75rem, icon-only buttons are square). Fields are 2rem high. 64 page overrides of button sizes are removed. |
| 4. Trees | User Grants, Role Grants, Data Skipping Indexes and Projections use one shared tree (React Flow and dagre). The lines are curves, so they do not overlap. A light moves along the lines in the direction of the flow, and the path to the selected node has a gradient beam. Nodes open and close ("+N" and "−"). PNG export stays. New: a "Where the settings come from" tree on the Settings tab. |
| 5. Memory | Charts are disposed when a page closes. Only the used ECharts parts are loaded. Login, the main layout and ECharts load on demand. A cheaper particle background. New memory gates. Numbers below. |
| 6. Login carousel | New screenshots of the new UI: dark pictures for the dark theme, light pictures for the light theme. |
| 7. Premium touches | Border Beam, Shimmer Button, Aurora Text, page fade-in, Number Ticker, Dot Pattern, a pulse on the connected cluster dot, and the Animated Theme Toggler on Login. Details below. |
| 8. Clean-up | CSS rules that nothing uses after the revamp are removed. |

## Exceptions to the revamp rules (you approved them)

- **Backend:** only `src/backend/utils/env.js` changed, for the ports (package 5).
- **Charts:** the 4 tree views moved from ECharts to React Flow. All other charts change only in font names and colors. `chart-guard.json` has the new hashes for `utils/echarts.js` (the partial import) and `LogHeatmap.jsx` (the dispose fix), with a note.

## Memory and speed

| Measure | Before | After |
|---|---|---|
| A chart page left behind after you closed it (each visit) | 677 DOM nodes and about 310 animation frames per second, which never stopped | 0 |
| Main JavaScript file | 2214 KB | 473 KB |
| Idle CPU on Home, background animation on | about 7.5% of one core | 3.8% to 4.6% (last run 4.1%) |
| Idle CPU on Home, background animation off | about 2% | about 2% |

New gates (they fail when a limit is passed):

- `bun run check:bundle`: the main JavaScript file is at most 600 KB.
- `bun tests/visual/memory.mjs` (after `bun run build` and `bunx vite preview --port 7721`):
  1. Leak: each page is opened 4 more times after 2 warm-up visits. Per visit, at most 20 DOM nodes, 2 listeners and 300 KB of heap may stay.
  2. Running work: after all pages, Home may have at most 2 times its fresh animation frames.
  3. Page size: each page at most 40 MB of heap and 10000 DOM nodes.
  4. Idle CPU on Home: at most 5% with the background animation on, 3% with it off.

## Premium touches

| Effect | Where |
|---|---|
| Border Beam (a light that moves along the border) | Login card, Home featured tile, the firing alert bar (red) |
| Shimmer Button | Login button; a shimmer sweep on the SQL Editor Go button |
| Aurora Text | "made easy" on Login |
| Blur Fade | Each page fades in when it opens (not when only the tab changes) |
| Number Ticker | Cluster Overview stat cards (whole numbers) |
| Dot Pattern | Tree canvas and empty states |
| Pulse | The connected cluster dot in the sidebar |
| Animated Theme Toggler | Login, top right |

Rules: at most 2 moving effects on one screen. All effects stop with "reduced motion" in the system and with the Background animation switch in the user menu. Screen readers read the final number of a Number Ticker once.

## Changes to know

- **Particles: 15 frames per second** (package 3 had 30, package 5 had 20). The particles move at the same speed as before; the movement is now by time, not by frame. The motion is a little less smooth. This keeps idle CPU under the 5% gate with the new effects (with them, 20 frames per second measured 4.8% to 5.1%). On small screens there are 80 particles.
- **react-day-picker 9.14, not 10.** With version 10 and the calendar that the shadcn CLI generates, the arrow keys did not move between days. Two bugs in the generated `calendar.jsx` are also fixed: its parts were made again on each render (the focus was lost), and the day button had no `ref`. When you open the picker, the focus goes to the selected day.
- **The calendar icon** comes from `@tabler/icons-react`; `ti-calendar` is not in the app's icon sprite.
- **Trees:** React Flow draws the trees in the page (HTML and SVG), not on a canvas. Very large trees show a minimap (more than 40 nodes). The flow light runs only when a tree has at most 80 lines and the motion is on.
- **Login carousel:** the screenshots come from the recorded test data (fake ClickHouse), because they must show the new UI. The test data is thin, so the pictures are less rich than the old ones from a real cluster. The tree pages are not in the carousel: the recorded data has no answer for the `system.grants` query, so each tree shows only 1 or 2 nodes. To use real pictures, take them from a real cluster at 1920 x 993 and save them with the same names (`src/frontend/assets/login-dark-01.webp` to `-10`, `login-light-01.webp` to `-10`). `bun tests/visual/login-screenshots.mjs` makes them again from the test data.
- **Images:** WebP, 1.3 MB for 20 pictures (the 20 old PNG files were 7.4 MB). Only the first slide loads at once.
- **Not removed:** 13 shadcn kit parts that no page uses yet (for example `accordion`, `carousel`, `resizable`). They are part of the shadcn kit from package 2 and the build leaves them out. `editor/AnalyzeOutput.jsx` and `layout/LogHeatmap.jsx` are not used either, but they were in the team's code before the revamp; I did not remove them.

## Bugs fixed

- Charts were not disposed when a page closed (React 19 sets the ref to null before the clean-up runs). Each visit to a chart page left its chart and its animation loop running. Now the chart is disposed through its own instance.
- Number Ticker kept its animation loop running for up to 8 s on large numbers, and counted again on each poll. Now it counts once and settles in about 2 s.
- Login carousel: the light theme showed the dark pictures and the other way round. The light list also had one dark picture.
- The Login button icon was gray and faint on the accent color. It now has the text color.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2171 frontend tests pass (2138 in package 5). `bun run lint`: 0 errors (the same 5 warnings). `bun run build` and `bun run check:bundle`: pass.
- New tests: tree data builders, the tree component, the ECharts parts list, the chart clean-up pattern on all chart pages, the particle background, the Login carousel lists and files. Updated tests: the date picker, Query Metrics, More options, indexes, overview pages and the chart mocks.
- Memory gates: all pass.

## Visual check results

Full check on all pages (normal and stress data, 3 screen sizes, both themes, 328 page states), en-US:

- No API call is missing from the recording. No page errors. No new accessibility problems.
- Charts: no chart changed size, and no chart option changed except one data value (below). Many charts moved up by 2 to 11 px, because the search forms and buttons are more compact. On Cluster Overview (stress data, 1440 px) the charts moved up by 42 px, because the form now fits on one line.
- One gauge value on Cluster Overview (Thread pool) shows 82.4% and not 84.8%. This comes from the recorded data, not from a chart change. In package 5 the layout first ran 3 metric queries with an empty node name, before the node was known. In package 6 the layout loads later, so both runs ask the real node. The total number of API calls is the same (25), but the replay now gives the second recorded answer.
- Pictures: most pages change (buttons, fields, forms, trees, fade-in). These are the expected changes of this package.
- Layout reports that are not real problems: tabs that are scrolled out of the tab bar (System Dashboards) count as overlapping the sidebar; open menus and the search dialog cover text; content that is scrolled under the footer counts as overlapping it.

Problems found during the check, all fixed:

- My mistake: the visual tools read the full `echarts` module, and the app now loads `echarts/core`, so the check read no charts. The reader is fixed, and the chart paths leave out the fade-in wrapper so that they match the old baseline.
- Since ECharts loads on demand, the Vite dev server found its parts only when the first chart page opened, and then reloaded the page. A developer would see the same reload. `vite.config.js` now lists the ECharts parts in `optimizeDeps.include`.
- The full ECharts adds an empty list to the chart option for each loaded part that a chart does not use (for example `brush: []`). `compare.mjs` now ignores these empty lists; they draw nothing.

Second full run with the Indian date and number format (`VISUAL_LOCALE=en-IN`), the same pages, sizes and themes:

- The same chart results as en-US. No missing API calls, no page errors.
- No new layout problem. One report differs from en-US only in its text ("am" for "AM"): a clipped table row on Queries, which en-US and the old baseline also have.
- The date picker shows "18 Nov 2026, 07:18:00" in both formats.

The visual baseline (local, `tests/visual/baseline`, not in git) is now the en-US run of package 6. The pages without charts were checked before the chart reader fix; their chart field says "ECharts module not found", and they have no charts in the old baseline either.

## What to test by hand

1. Error Log at 1920 x 1080 and on an HD screen (1366 x 768): the search form is on one or two lines, no field is cut off and nothing overlaps. Click the date field: a calendar opens with the focus on the selected day. Use the arrow keys, Enter, and type a time. Push Escape: the calendar closes.
2. On the same page, open "More options": the result columns and SQL filters show. Close it: a short summary shows what is set.
3. Do the same on Crash Log, Text Log, Session Log, Queries, Query Log, Playback, System Dashboards, Query Profiler, Query Metrics and Processors Profile.
4. Look at the buttons on a few pages: they have one height. Full-width toggle buttons (Overview cards, Cluster Topology, "Open in" menu, Query detail) keep their text on the left.
5. DB RBAC, View Grants, User Grants: select a user. The tree shows curved lines with a moving light. Click a node: the path to it has a gradient beam. Click "+N" to open a node and "−" to close it; the node stays in place. Click the PNG button: a picture downloads. Do the same on Role Grants, Data Skipping Indexes and Projections.
6. View Grants, Settings: select a role. The "Where the settings come from" tree shows.
7. Login, both themes: the carousel shows pictures of the same theme. The card has a moving light on its border, "made easy" has moving colors, the Login button has a shimmer, and the theme toggle is at the top right.
8. Home: the featured tile has a border light; the cluster dot in the sidebar pulses. Open pages one after another: each page fades in.
9. Cluster Overview: the stat numbers count up once, then change at once on refresh.
10. User menu: turn off Background animation. All moving effects stop. Turn it on again: they start.
11. In your system settings, turn on "reduce motion" and reload: no moving effects.
12. Open 10 chart pages one after another, then go to Home. Open the browser task manager: memory and CPU stay low.
